export type LobbyStatus = 'waiting' | 'in_game' | 'finished';

export type Lobby = {
  id: string;
  code: string;
  owner_id: string;
  status: LobbyStatus;
  created_at: string;
  updated_at: string;
};

export type LobbyMember = {
  id: string;
  lobby_id: string;
  user_id: string;
  joined_at: string;
};

export type GameStatus = 'active' | 'finished';

export type Game<TState extends object> = {
  id: string;
  lobby_id: string;
  state: TState;
  state_version: number;
  current_turn_user_id: string | null;
  status: GameStatus;
  created_at: string;
  updated_at: string;
};

export type LobbyWithMembers = Lobby & {
  lobby_members: LobbyMember[];
};
