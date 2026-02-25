import type { Payload } from '../primitives';
import type { PublicUserInfo } from './user';
import type { VersionedEntity } from './versioned';

export type PlayerStatus = 'syncing' | 'active' | 'eliminated' | 'disconnected';

export type PlayerId = { gameId: string; userId: string };

export type Player<TPrivateState extends Payload = Payload> =
	VersionedEntity<PlayerId> &
		PublicUserInfo & {
			status: PlayerStatus;
			privateState: TPrivateState;
		};