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

export type LobbyStatus = 'waiting' | 'ready' | 'starting' | 'transitioned';

export type Lobby<TConfig extends Payload = Payload> = VersionedEntity & {
	code: string; // 4-char join code
	hostId: string;

	status: LobbyStatus;
	members: LobbyMember[];

	minPlayers: number;
	maxPlayers: number;
	gameConfig: TConfig;

	transitionedAt?: number; // timestamp of when the lobby transitioned to a game
};
