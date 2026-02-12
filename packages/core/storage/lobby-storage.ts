import type { LobbyMember } from '../engine/types';
import type { Lobby, LobbyStatus } from '../engine/types/lobby';
import type { LobbyMemberStatus } from '../engine/types/lobby-member';

export interface ILobbyStorage {
	createLobby<TConfig extends object>(
		hostId: string,
		config: TConfig,
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
