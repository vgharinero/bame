CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- =============================================================================
-- PROFILES
-- =============================================================================
-- Represents the profile of a user, which is separate from the auth.users table
-- to allow for more flexible profile management

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view any profile"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles(display_name);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$ 
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'display_name', 
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER handle_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE moddatetime('updated_at');

-- =============================================================================
-- LOBBIES
-- =============================================================================
-- Represents a game lobby where players gather before starting

CREATE TYPE lobby_status AS ENUM ('waiting', 'ready', 'starting', 'started', 'closed');

CREATE TABLE IF NOT EXISTS lobbies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL DEFAULT UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6)),
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  min_players INTEGER NOT NULL,
  max_players INTEGER NOT NULL,
  status lobby_status NOT NULL DEFAULT 'waiting',
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  game_id UUID REFERENCES games(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_player_range CHECK (min_players <= max_players)
);

ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lobbies they are part of"
  ON lobbies FOR SELECT
  USING (
    auth.uid() = host_id
    OR is_user_in_lobby(lobbies.id, auth.uid())
  );

CREATE POLICY "Users can create lobbies"
  ON lobbies FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Only host can update lobby"
  ON lobbies FOR UPDATE
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Only host can delete lobby"
  ON lobbies FOR DELETE
  USING (auth.uid() = host_id);

CREATE TYPE lobby_member_status AS ENUM ('in_lobby', 'leaving', 'in_game', 'synced');

CREATE TABLE IF NOT EXISTS lobby_members (
  lobby_id UUID REFERENCES lobbies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_ready BOOLEAN NOT NULL DEFAULT false,
  status lobby_member_status NOT NULL DEFAULT 'in_lobby',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (lobby_id, user_id)
);

ALTER TABLE lobby_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_lobbies_code ON lobbies(code);
CREATE INDEX IF NOT EXISTS idx_lobbies_status ON lobbies(status);
CREATE INDEX IF NOT EXISTS idx_lobbies_created_at ON lobbies(created_at) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_lobby_members_lobby_id ON lobby_members(lobby_id);
CREATE INDEX IF NOT EXISTS idx_lobby_members_user_id ON lobby_members(user_id);

CREATE OR REPLACE FUNCTION get_lobby_player_count(lobby_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER 
    FROM lobby_members 
    WHERE lobby_members.lobby_id = lobby_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_user_in_lobby(lobby_id UUID, user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT EXISTS (
      SELECT 1 
      FROM lobby_members 
      WHERE lobby_members.lobby_id = lobby_id 
        AND lobby_members.user_id = user_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION validate_lobby_capacity()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM lobby_members WHERE lobby_id = NEW.lobby_id) >= 
     (SELECT max_players FROM lobbies WHERE id = NEW.lobby_id) THEN
    RAISE EXCEPTION 'Lobby is full';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_lobby_capacity
  BEFORE INSERT ON lobby_members
  FOR EACH ROW EXECUTE FUNCTION validate_lobby_capacity();

CREATE OR REPLACE FUNCTION check_lobby_ready_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  all_ready BOOLEAN;
  min_players_met BOOLEAN;
  current_lobby_id UUID;
BEGIN
  -- Get the lobby_id from the updated row
  current_lobby_id := COALESCE(NEW.lobby_id, OLD.lobby_id);
  
  -- Check if we have minimum players and all are ready
  SELECT 
    COUNT(*) >= (SELECT min_players FROM lobbies WHERE id = current_lobby_id),
    NOT EXISTS (SELECT 1 FROM lobby_members WHERE lobby_id = current_lobby_id AND is_ready = false)
  INTO min_players_met, all_ready
  FROM lobby_members
  WHERE lobby_id = current_lobby_id;
  
  -- Update lobby status
  IF all_ready AND min_players_met THEN
    UPDATE lobbies SET status = 'ready' WHERE id = current_lobby_id AND status = 'waiting';
  ELSE
    UPDATE lobbies SET status = 'waiting' WHERE id = current_lobby_id AND status = 'ready';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER update_lobby_ready_status
  AFTER INSERT OR UPDATE OR DELETE ON lobby_members
  FOR EACH ROW EXECUTE FUNCTION check_lobby_ready_status();

CREATE POLICY "Users can join open lobbies"
ON lobby_members FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM lobbies
    WHERE id = lobby_members.lobby_id
    AND status = 'waiting'
    AND (
      SELECT COUNT(*) FROM lobby_members lm 
      WHERE lm.lobby_id = lobbies.id
    ) < lobbies.max_players
  )
);

CREATE POLICY "Users can view players in their lobbies"
  ON lobby_members FOR SELECT
  USING (is_user_in_lobby(lobby_members.lobby_id, auth.uid())
    OR auth.uid() = (
      SELECT host_id FROM lobbies WHERE lobbies.id = lobby_members.lobby_id
    )
  );

CREATE POLICY "Users can update their own lobby player row"
  ON lobby_members FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave lobbies"
  ON lobby_members FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER handle_lobby_members_updated_at
  BEFORE UPDATE ON lobby_members
  FOR EACH ROW EXECUTE PROCEDURE moddatetime('updated_at');

CREATE OR REPLACE FUNCTION cleanup_old_lobbies(age_hours INTEGER DEFAULT 1)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM lobbies
  WHERE status = 'waiting'
  AND created_at < NOW() - (age_hours || ' hours')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE lobbies;
ALTER PUBLICATION supabase_realtime ADD TABLE lobby_members;

-- =============================================================================
-- GAMES
-- =============================================================================
-- Represents a game instance that is created when a lobby starts

CREATE TYPE game_status AS ENUM ('waiting', 'starting', 'active', 'finished', 'aborted');

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status game_status NOT NULL DEFAULT 'waiting',
  current_turn INTEGER NOT NULL DEFAULT 0,
  current_player_id UUID REFERENCES profiles(id),
  public_state JSONB NOT NULL DEFAULT '{}'::JSONB,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  winner_id UUID NULL REFERENCES profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_games_current_player_id ON games(current_player_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

CREATE OR REPLACE FUNCTION is_user_in_game(game_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM game_players 
    WHERE game_id = game_uuid AND user_id = user_uuid
  );
END;
$$;

CREATE POLICY "Users can view games they are part of"
  ON games FOR SELECT
  USING (
    is_user_in_game(games.id, auth.uid())
  );

CREATE POLICY "Only service role can create games"
  ON games FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Players can update games they are in"
  ON games FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM game_players 
      WHERE game_players.game_id = games.id 
      AND game_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Players can delete finished/aborted games"
  ON games FOR DELETE
  USING (
    is_user_in_game(games.id, auth.uid())
    AND status IN ('finished', 'aborted')
  );

CREATE TRIGGER handle_games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE PROCEDURE moddatetime('updated_at');

CREATE TYPE game_player_status AS ENUM ('active', 'eliminated', 'disconnected');

CREATE TABLE IF NOT EXISTS public.game_players (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  turn_order INTEGER NOT NULL,
  player_state JSONB NOT NULL DEFAULT '{}'::JSONB,
  status game_player_status NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY(game_id, user_id),
  UNIQUE(game_id, turn_order)
);

ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_user_id ON game_players(user_id);

CREATE POLICY "Users can view players in their games"
  ON game_players FOR SELECT
  USING (
    is_user_in_game(game_players.game_id, auth.uid())
  );

CREATE POLICY "System can create game players (via function)"
  ON game_players FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Users can update their own game player row"
  ON game_players FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players cannot leave active games"
  ON game_players FOR DELETE
  USING (
    auth.uid() = user_id
    AND (SELECT status FROM games WHERE id = game_id) NOT IN ('active', 'starting')
  );

CREATE OR REPLACE FUNCTION validate_turn_order()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.turn_order < 0 THEN
    RAISE EXCEPTION 'Turn order must be non-negative';
  END IF;
  
  IF NEW.turn_order > (
    SELECT COUNT(*) FROM game_players WHERE game_id = NEW.game_id
  ) THEN
    RAISE EXCEPTION 'Turn order has gaps';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_game_player_turn_order
  BEFORE INSERT ON game_players
  FOR EACH ROW EXECUTE FUNCTION validate_turn_order();

ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;

-- =============================================================================
-- GAME ACTIONS
-- =============================================================================
-- Represents actions/moves taken by players during a game

CREATE TABLE IF NOT EXISTS game_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  action_type TEXT NOT NULL,
  action_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  turn_number INTEGER NOT NULL,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_game_actions_game_id ON game_actions(game_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_turn_number ON game_actions(game_id, turn_number);

CREATE POLICY "Players can view actions in their games"
  ON game_actions FOR SELECT
  USING (is_user_in_game(game_actions.game_id, auth.uid()));

CREATE POLICY "Players can insert actions in their games"
  ON game_actions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_user_in_game(game_actions.game_id, auth.uid())
    AND (SELECT status FROM games WHERE id = game_id) = 'active'
  );

ALTER PUBLICATION supabase_realtime ADD TABLE game_actions;

-- =============================================================================
-- GAME TRANSITION FUNCTIONS
-- =============================================================================
-- Functions to manage lobby-to-game transitions and game lifecycle

CREATE OR REPLACE FUNCTION start_game_from_lobby(
  lobby_uuid UUID,
  game_config JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_game_id UUID;
  player_record RECORD;
  current_turn_order INTEGER := 0;
BEGIN
  -- Verify caller is the host
  IF NOT EXISTS (
    SELECT 1 FROM lobbies 
    WHERE id = lobby_uuid 
    AND host_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the lobby host can start the game';
  END IF;
  
  -- Verify lobby is ready to start
  IF NOT EXISTS (
    SELECT 1 FROM lobbies 
    WHERE id = lobby_uuid 
    AND status = 'ready'
  ) THEN
    RAISE EXCEPTION 'Lobby is not ready to start';
  END IF;
  
  -- Verify minimum players
  IF (SELECT COUNT(*) FROM lobby_members WHERE lobby_id = lobby_uuid) < 
     (SELECT min_players FROM lobbies WHERE id = lobby_uuid) THEN
    RAISE EXCEPTION 'Not enough players';
  END IF;
  
  -- Verify all players are ready
  IF EXISTS (
    SELECT 1 FROM lobby_members 
    WHERE lobby_id = lobby_uuid 
    AND is_ready = false
  ) THEN
    RAISE EXCEPTION 'Not all players are ready';
  END IF;
  
  -- Update lobby status to starting
  UPDATE lobbies SET status = 'starting' WHERE id = lobby_uuid;
  
  -- Create the game
  INSERT INTO games (config, status)
  VALUES (game_config, 'starting')
  RETURNING id INTO new_game_id;
  
  -- Add players to game in random order
  FOR player_record IN 
    SELECT user_id FROM lobby_members 
    WHERE lobby_id = lobby_uuid 
    ORDER BY RANDOM()
  LOOP
    INSERT INTO game_players (game_id, user_id, turn_order)
    VALUES (new_game_id, player_record.user_id, current_turn_order);
    
    current_turn_order := current_turn_order + 1;
  END LOOP;
  
  -- Update lobby members status
  UPDATE lobby_members 
  SET status = 'in_game' 
  WHERE lobby_id = lobby_uuid;
  
  -- Update lobby status and link game
  UPDATE lobbies 
  SET status = 'started', game_id = new_game_id 
  WHERE id = lobby_uuid;
  
  RETURN new_game_id;
END;
$$;

CREATE OR REPLACE FUNCTION mark_player_synced(lobby_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  all_synced BOOLEAN;
  game_uuid UUID;
BEGIN
  -- Mark this player as synced
  UPDATE lobby_members
  SET status = 'synced'
  WHERE lobby_id = lobby_uuid
  AND user_id = auth.uid()
  AND status = 'in_game';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not in this lobby or game not started';
  END IF;
  
  -- Check if all players are synced
  SELECT NOT EXISTS (
    SELECT 1 FROM lobby_members
    WHERE lobby_id = lobby_uuid
    AND status != 'synced'
  ) INTO all_synced;
  
  -- If all synced, activate the game
  IF all_synced THEN
    -- Get the game_id from the lobby
    SELECT game_id INTO game_uuid
    FROM lobbies
    WHERE id = lobby_uuid;
    
    IF game_uuid IS NOT NULL THEN
      PERFORM activate_game(game_uuid);
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION activate_game(game_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_player_id UUID;
BEGIN
  -- Get the first player (turn_order = 0)
  SELECT user_id INTO first_player_id
  FROM game_players
  WHERE game_id = game_uuid
  AND turn_order = 0;
  
  -- Activate the game
  UPDATE games
  SET 
    status = 'active',
    current_player_id = first_player_id,
    current_turn = 1
  WHERE id = game_uuid
  AND status = 'starting';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found or not in starting state';
  END IF;
END;
$$;
