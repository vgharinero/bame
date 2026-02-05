import { z } from 'zod';

export const LobbyIdSchema = z.object({
  lobbyId: z.string().uuid(),
});

export const GameIdSchema = z.object({
  gameId: z.string().uuid(),
});

export const JoinCodeSchema = z.object({
  code: z.string().min(3).max(32),
});

export const SubmitActionSchema = z.object({
  gameId: z.string().uuid(),
  action: z.unknown(), // TODO
});
