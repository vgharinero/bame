export type Lobby = {
    id: string;
    code: string;
    owner_id: string;
    status: "waiting" | "in_game" | "finished";
    created_at: string;
    updated_at: string;
};

export type LobbyMember = {
    id: string;
    lobby_id: string;
    user_id: string;
    joined_at: string;
};

export type Game = {
    id: string;
    lobby_id: string;
    state: unknown;
    state_version: number;
    current_turn_user_id: string | null;
    status: "active" | "finished";
    created_at: string;
    updated_at: string;
};

export type LobbyWithMembers = Lobby & {
    lobby_members: LobbyMember[];
};

