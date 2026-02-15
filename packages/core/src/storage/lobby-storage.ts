import type {
	Lobby,
	LobbyMember,
	LobbyMemberStatus,
	LobbyStatus,
} from '../engine/types';

export interface ILobbyStorage {
	createLobby<TConfig extends object>(
		hostId: string,
		config: TConfig,
		minPlayers: number,
		maxPlayers: number,
	): Promise<Lobby<TConfig>>;

	getLobby<TConfig extends object>(
		lobbyId: string,
	): Promise<Lobby<TConfig> | null>;

	listLobbies<TConfig extends object>(filters?: {
		status?: 'waiting' | 'ready';
		hasSpace?: boolean;
	}): Promise<Lobby<TConfig>[]>;

	updateConfig<TConfig extends object>(
		lobbyId: string,
		config: TConfig,
	): Promise<Lobby<TConfig>>;

	updateLobbyStatus(lobbyId: string, status: LobbyStatus): Promise<void>;

	deleteLobby(lobbyId: string): Promise<void>;

	joinLobby(lobbyId: string, userId: string): Promise<LobbyMember>;

	leaveLobby(lobbyId: string, userId: string): Promise<void>;

	updateMemberStatus(
		lobbyId: string,
		userId: string,
		status: LobbyMemberStatus,
	): Promise<void>;
}
