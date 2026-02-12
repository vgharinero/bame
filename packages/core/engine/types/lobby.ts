import type { LobbyMember } from './lobby-member';

export type LobbyStatus =
	| 'waiting'
	| 'ready'
	| 'starting'
	| 'started'
	| 'closed';

export interface Lobby<TConfig extends object = object> {
	id: string;
	code: string; // 4-char join code
	hostId: string;

	status: LobbyStatus;
	members: LobbyMember[];

	minPlayers: number;
	maxPlayers: number;
	gameConfig: TConfig;

	createdAt: number;
	updatedAt: number;
}
