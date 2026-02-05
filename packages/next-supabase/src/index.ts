// Supabase clients
export { createSupabaseServerClient } from "./supabase/server";
export { createSupabaseBrowserClient } from "./supabase/client";

// Route factories
export { makeCreateLobbyRoute } from "./routes/makeCreateLobbyRoute";
export { makeJoinLobbyRoute } from "./routes/makeJoinLobbyRoute";
export { makeCreateGameRoute } from "./routes/makeCreateGameRoute";
export { makeSubmitActionRoute } from "./routes/makeSubmitActionRoute";

// React hooks
export { useGame } from "./client/hooks/useGame";
export { useLobby } from "./client/hooks/useLobby";
export type { LobbyState } from "./client/hooks/useLobby";
export { useSubmitAction } from "./client/hooks/useSubmitAction";
export type { SubmitActionState, UseSubmitActionReturn } from "./client/hooks/useSubmitAction";

// Shared types
export type { Lobby, LobbyMember, Game, LobbyWithMembers } from "./shared/types";

// Shared schemas
export { LobbyIdSchema, GameIdSchema, JoinCodeSchema, SubmitActionSchema } from "./shared/zod";
