-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS moddatetime;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE lobby_status AS ENUM ('waiting', 'ready', 'starting', 'transitioned', 'closed');
CREATE TYPE lobby_member_status AS ENUM ('in_lobby', 'leaving', 'in_game', 'synced');
CREATE TYPE game_status AS ENUM ('waiting', 'starting', 'active', 'finished', 'aborted');
CREATE TYPE player_status AS ENUM ('syncing', 'active', 'eliminated', 'disconnected');

-- ============================================
-- PROFILES TABLE
-- ============================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    wins INTEGER DEFAULT 0 NOT NULL,
    losses INTEGER DEFAULT 0 NOT NULL,
    draws INTEGER DEFAULT 0 NOT NULL,
    total_games INTEGER DEFAULT 0 NOT NULL,
    win_rate NUMERIC(5,2) DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_profiles_win_rate ON profiles(win_rate DESC);
CREATE INDEX idx_profiles_total_games ON profiles(total_games DESC);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger to update win_rate on stats change
CREATE OR REPLACE FUNCTION update_win_rate()
RETURNS TRIGGER AS $$
BEGIN
  NEW.win_rate := CASE
    WHEN NEW.total_games > 0 THEN ROUND((NEW.wins::NUMERIC / NEW.total_games::NUMERIC) * 100, 2)
    ELSE 0
  END;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_win_rate
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (OLD.wins IS DISTINCT FROM NEW.wins OR OLD.total_games IS DISTINCT FROM NEW.total_games)
  EXECUTE FUNCTION update_win_rate();

CREATE TRIGGER handle_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE moddatetime('updated_at');  

-- ============================================
-- LOBBIES TABLE
-- ============================================

CREATE TABLE lobbies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL DEFAULT UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6)),
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status lobby_status DEFAULT 'waiting' NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  min_players INTEGER NOT NULL,
  max_players INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transitioned_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_player_range CHECK (min_players <= max_players)
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE lobbies;

-- Indexes
CREATE INDEX idx_lobbies_code ON lobbies(code);
CREATE INDEX idx_lobbies_status ON lobbies(status) WHERE status IN ('waiting', 'ready');
CREATE INDEX idx_lobbies_host ON lobbies(host_id);
CREATE INDEX idx_lobbies_created_at ON lobbies(created_at);

-- RLS Policies
ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active lobbies"
  ON lobbies FOR SELECT
  USING (status IN ('waiting', 'ready', 'starting'));

CREATE POLICY "Authenticated users can create lobbies"
  ON lobbies FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can update lobby"
  ON lobbies FOR UPDATE
  USING (auth.uid() = host_id);

CREATE POLICY "Host can delete lobby"
  ON lobbies FOR DELETE
  USING (auth.uid() = host_id);

-- Handle updated_at
CREATE TRIGGER handle_lobbies_updated_at
  BEFORE UPDATE ON lobbies
  FOR EACH ROW EXECUTE PROCEDURE moddatetime('updated_at');  

-- ============================================
-- LOBBY_MEMBERS TABLE
-- ============================================

CREATE TABLE lobby_members (
  lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status lobby_member_status NOT NULL DEFAULT 'in_lobby',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (lobby_id, user_id)
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE lobby_members;

-- Indexes
CREATE INDEX idx_lobby_members_user ON lobby_members(user_id);
CREATE INDEX idx_lobby_members_status ON lobby_members(lobby_id, status);

-- RLS Policies
ALTER TABLE lobby_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view lobby members"
  ON lobby_members FOR SELECT
  USING (true);

CREATE POLICY "Users can join lobbies"
  ON lobby_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave lobbies"
  ON lobby_members FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "System can update member status"
  ON lobby_members FOR UPDATE
  TO service_role
  USING (true);

-- ============================================
-- GAMES TABLE
-- ============================================

CREATE TABLE games (
  id UUID PRIMARY KEY, -- Same as lobby_id
  status game_status NOT NULL DEFAULT 'waiting',
  config JSONB NOT NULL,
  
  -- Separate turn management
  current_player_id UUID REFERENCES profiles(id),
  current_phase TEXT NOT NULL,
  turn_data JSONB NOT NULL,
  
  -- Game-specific public state
  public_state JSONB NOT NULL,

  seed TEXT NOT NULL,
  winner UUID REFERENCES profiles(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE games;

-- Indexes
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_created_at ON games(created_at DESC);
CREATE INDEX idx_games_current_player ON games(current_player_id) WHERE status = 'active';
CREATE INDEX idx_games_current_phase ON games(current_phase) WHERE status = 'active';

-- RLS Policies
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view their games"
  ON games FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM game_players
      WHERE game_players.game_id = games.id
      AND game_players.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage games"
  ON games FOR ALL
  TO service_role
  USING (true);

-- Handle updated_at
CREATE TRIGGER handle_games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE PROCEDURE moddatetime('updated_at'); 

-- ============================================
-- GAME_PLAYERS TABLE
-- ============================================

CREATE TABLE game_players (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status player_status NOT NULL DEFAULT 'syncing',
  private_state JSONB NOT NULL DEFAULT '{}'::JSONB,
  joined_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (game_id, user_id)
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;

-- Indexes
CREATE INDEX idx_game_players_user ON game_players(user_id);
CREATE INDEX idx_game_players_status ON game_players(game_id, status);

-- RLS Policies
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view their own game player data"
  ON game_players FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage game players"
  ON game_players FOR ALL
  TO service_role
  USING (true);

-- Handle updated_at
CREATE TRIGGER handle_game_players_updated_at
  BEFORE UPDATE ON game_players
  FOR EACH ROW EXECUTE PROCEDURE moddatetime('updated_at'); 


-- ============================================
-- GAME_ACTIONS TABLE (Optional - for history)
-- ============================================

CREATE TABLE game_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  action_data JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

-- Indexes
CREATE INDEX idx_game_actions_game ON game_actions(game_id, created_at);

-- RLS Policies
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view actions in their games"
  ON game_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM game_players
      WHERE game_players.game_id = game_actions.game_id
      AND game_players.user_id = auth.uid()
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check if user is in lobby
CREATE OR REPLACE FUNCTION is_user_in_lobby(p_lobby_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM lobby_members
    WHERE lobby_id = p_lobby_id
    AND user_id = p_user_id
    AND status = 'in_lobby'
  );
END;
$$ LANGUAGE plpgsql;

-- Get lobby member count
CREATE OR REPLACE FUNCTION get_lobby_member_count(p_lobby_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM lobby_members
    WHERE lobby_id = p_lobby_id
    AND status = 'in_lobby'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CLEANUP FUNCTIONS
-- ============================================

-- Cleanup old waiting lobbies (30+ minutes)
CREATE OR REPLACE FUNCTION cleanup_old_lobbies()
RETURNS void AS $$
BEGIN
  UPDATE lobbies
  SET status = 'closed'
  WHERE status = 'waiting'
  AND created_at < (EXTRACT(EPOCH FROM NOW()) * 1000) - (30 * 60 * 1000);
  
  DELETE FROM lobbies
  WHERE status = 'closed'
  AND created_at < (EXTRACT(EPOCH FROM NOW()) * 1000) - (60 * 60 * 1000); -- Delete after 1 hour
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('cleanup-old-lobbies', '*/15 * * * *', 'SELECT cleanup_old_lobbies()');