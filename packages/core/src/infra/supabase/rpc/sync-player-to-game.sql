CREATE OR REPLACE FUNCTION sync_player_to_game(
  p_game_id UUID,
  p_user_id UUID
) RETURNS VOID AS $$
DECLARE
  v_total_players INT;
  v_synced_players INT;
BEGIN
  -- Update player to synced
  UPDATE game_players
  SET status = 'active'  -- They're now synced and active
  WHERE game_id = p_game_id AND user_id = p_user_id AND status = 'syncing';
  
  -- Update lobby member to synced
  UPDATE lobby_members
  SET status = 'synced'
  WHERE user_id = p_user_id
  AND lobby_id = (SELECT lobby_id FROM games WHERE id = p_game_id);
  
 -- Check if all players synced (cross-check both tables)
SELECT COUNT(*) INTO v_total_players
FROM game_players
WHERE game_id = p_game_id;

SELECT COUNT(*) INTO v_synced_players
FROM game_players
WHERE game_id = p_game_id AND status = 'active';

DECLARE
  v_lobby_synced INT;
BEGIN
  -- Also verify lobby members are synced
  SELECT COUNT(*) INTO v_lobby_synced
  FROM lobby_members lm
  JOIN games g ON g.lobby_id = lm.lobby_id
  WHERE g.id = p_game_id AND lm.status = 'synced';
  
  -- All checks must pass
  IF v_synced_players = v_total_players AND v_lobby_synced = v_total_players THEN
    UPDATE games SET status = 'starting' WHERE id = p_game_id;
    PERFORM pg_sleep(0.5);
    UPDATE games SET status = 'active', started_at = NOW() WHERE id = p_game_id;
  END IF;
END;
END;
$$ LANGUAGE plpgsql;