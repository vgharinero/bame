import type { FromViz, Perspective, Viz } from './perspective';
import type { PublicUserInfo } from './user';
import type { VersionedEntity } from './versioned';

export type PlayerStatus = 'syncing' | 'active' | 'eliminated' | 'disconnected';

export type Player<
	TState extends Perspective = Perspective,
	TViz extends Viz = 'private',
> = VersionedEntity &
	PublicUserInfo & {
		gameId: string;
		userId: string;
		
		status: PlayerStatus;
		state: FromViz<TState, TViz>;
	};
