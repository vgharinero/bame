CREATE OR REPLACE FUNCTION transition_lobby_to_game(
  p_lobby_id UUID,
  p_public_state JSONB,
  p_current_player_id UUID,
  p_current_phase TEXT,
  p_turn_data JSONB,
  p_player_ids UUID[],
  p_private_states JSONB[],
  p_config JSONB,
  p_seed TEXT
) RETURNS UUID AS $$
DECLARE
  v_lobby_status TEXT;
  v_member_count INT;
  v_player_index INT := 1;
BEGIN
  -- 1. Validate lobby
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

  -- 3. Create game
  INSERT INTO games (
    id, 
    config, 
    current_player_id,
    current_phase,
    turn_data,
    public_state,
    seed
  )
  VALUES (
    p_lobby_id,
    p_config,
    p_current_player_id,
    p_current_phase,
    p_turn_data,
    p_public_state,
    p_seed
  );

  -- 4. Create game_players with proper private states
  INSERT INTO game_players (game_id, user_id, private_state)
  SELECT 
    p_lobby_id,
    p_player_ids[idx],
    p_private_states[idx],
FROM generate_subscripts(p_player_ids, 1) AS idx;

  -- 5. Update lobby_members
  UPDATE lobby_members
  SET status = 'in_game'
  WHERE lobby_id = p_lobby_id AND status = 'in_lobby';

  -- 6. Update lobby
  UPDATE lobbies
  SET status = 'started', updated_at = NOW()
  WHERE id = p_lobby_id;

  RETURN p_game_id;
END;
$$ LANGUAGE plpgsql;