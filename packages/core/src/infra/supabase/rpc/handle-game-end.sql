CREATE OR REPLACE FUNCTION handle_game_end(
  p_winners UUID[],
  p_losers UUID[],
  p_is_draw BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $$
BEGIN
  IF p_is_draw THEN
    -- Everyone gets a draw
    UPDATE profiles
    SET 
      draws = draws + 1,
      total_games = total_games + 1
    WHERE id = ANY(p_winners) OR id = ANY(p_losers);
  ELSE
    -- Update winners
    UPDATE profiles
    SET 
      wins = wins + 1,
      total_games = total_games + 1
    WHERE id = ANY(p_winners);
    
    -- Update losers
    UPDATE profiles
    SET 
      losses = losses + 1,
      total_games = total_games + 1
    WHERE id = ANY(p_losers);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;