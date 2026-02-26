import type { PublicUserInfo } from './user';
import type { VersionedEntity } from './versioned';

export type ProfileStats = {
	wins: number;
	losses: number;
	draws: number;
	totalGames: number;
};

export type Profile = VersionedEntity &
	PublicUserInfo & {
		userId: string;
		stats: ProfileStats;
	};
