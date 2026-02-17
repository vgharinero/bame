CREATE OR REPLACE FUNCTION apply_game_action(
  p_game_id UUID,
  p_new_state JSONB,
  p_action JSONB
) RETURNS VOID AS $$
BEGIN
  -- 1. Update game state atomically
  UPDATE games
  SET 
    public_state = p_new_state,
  WHERE id = p_game_id AND status = 'active';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found or not active';
  END IF;

  -- 2. Insert action into history (optional)
  INSERT INTO game_actions (game_id, action_data)
  VALUES (
    p_game_id,
    p_action
  );
END;
$$ LANGUAGE plpgsql;