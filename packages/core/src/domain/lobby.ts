import type { Payload } from '../primitives';
import type { LobbyMember } from './lobby-member';
import type { VersionedEntity } from './versioned';

export const getRandomCode = () => {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let result = '';
	for (let i = 0; i < 6; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
};

export const isPublicLobby = (lobby: Lobby) => !lobby.code;

export type LobbyStatus = 'waiting' | 'ready' | 'starting' | 'transitioned';

export type Lobby<TConfig extends Payload = Payload> = VersionedEntity & {
	id: string;
	code: string | null;
	hostId: string;
	
	minPlayers: number;
	maxPlayers: number;
	
	status: LobbyStatus;
	members: LobbyMember[];

	gameConfig: TConfig;

	transitionedAt?: number; // timestamp of when the lobby transitioned to a game
};

export type PublicLobby = Pick<
	Lobby,
	'id' | 'hostId' | 'minPlayers' | 'maxPlayers' | 'status'
>;
