import type { PublicUserInfo } from './user';
import type { VersionedEntity } from './versioned-entity';

export type PlayerStatus = 'syncing' | 'active' | 'eliminated' | 'disconnected';

export type PlayerId = { gameId: string; userId: string };

export interface Player<TPrivateState extends object>
	extends VersionedEntity<PlayerId>,
		PublicUserInfo {
	status: PlayerStatus;
	privateState: TPrivateState;
}
