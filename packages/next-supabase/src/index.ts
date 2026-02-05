// Supabase clients
export { createSupabaseBrowserClient } from './supabase/client';
export { updateSession } from './supabase/proxy';
export { createSupabaseServerClient } from './supabase/server';

// Route factories
export { makeCreateGameRoute } from './routes/makeCreateGameRoute';
export { makeCreateLobbyRoute } from './routes/makeCreateLobbyRoute';
export { makeJoinLobbyRoute } from './routes/makeJoinLobbyRoute';
export { makeSubmitActionRoute } from './routes/makeSubmitActionRoute';

// React hooks
export { useGame } from './client/hooks/useGame';
export { useLobby } from './client/hooks/useLobby';
export type { LobbyState } from './client/hooks/useLobby';
export { useSubmitAction } from './client/hooks/useSubmitAction';
export type {
  SubmitActionState,
  UseSubmitActionReturn,
} from './client/hooks/useSubmitAction';

// Shared types
export type {
  Game,
  Lobby,
  LobbyMember,
  LobbyWithMembers,
} from './shared/types';

// Shared schemas
export {
  GameIdSchema,
  JoinCodeSchema,
  LobbyIdSchema,
  SubmitActionSchema,
} from './shared/zod';
