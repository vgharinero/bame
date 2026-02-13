CREATE OR REPLACE FUNCTION transition_lobby_to_game(
  p_lobby_id UUID,
  p_game_id UUID,
  p_initial_state JSONB,
  p_config JSONB,
  p_seed TEXT
) RETURNS UUID AS $$
DECLARE
  v_lobby_status TEXT;
  v_member_count INT;
BEGIN
  -- 1. Validate lobby exists and is in 'starting' state
  SELECT status INTO v_lobby_status 
  FROM lobbies 
  WHERE id = p_lobby_id;
  
  IF v_lobby_status IS NULL THEN
    RAISE EXCEPTION 'Lobby not found';
  END IF;
  
  IF v_lobby_status != 'starting' THEN
    RAISE EXCEPTION 'Lobby is not in starting state';
  END IF;

  -- 2. Count members
  SELECT COUNT(*) INTO v_member_count
  FROM lobby_members
  WHERE lobby_id = p_lobby_id AND status = 'in_lobby';
  
  IF v_member_count = 0 THEN
    RAISE EXCEPTION 'No members in lobby';
  END IF;

  -- 3. Create game (atomic)
  INSERT INTO games (id, lobby_id, status, config, public_state, seed, created_at)
  VALUES (
    p_game_id,
    p_lobby_id,
    'active',
    p_config,
    p_initial_state,
    p_seed,
    EXTRACT(EPOCH FROM NOW()) * 1000
  );

  -- 4. Create game_players from lobby_members
  INSERT INTO game_players (game_id, user_id, status, private_state, joined_at)
  SELECT 
    p_game_id,
    user_id,
    'active',
    '{}'::JSONB,
    EXTRACT(EPOCH FROM NOW()) * 1000
  FROM lobby_members
  WHERE lobby_id = p_lobby_id AND status = 'in_lobby';

  -- 5. Update lobby_members status
  UPDATE lobby_members
  SET status = 'in_game'
  WHERE lobby_id = p_lobby_id AND status = 'in_lobby';

  -- 6. Update lobby status
  UPDATE lobbies
  SET status = 'started', started_at = EXTRACT(EPOCH FROM NOW()) * 1000
  WHERE id = p_lobby_id;

  RETURN p_game_id;
END;
$$ LANGUAGE plpgsql;