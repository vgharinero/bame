import type { PublicUserInfo } from './user';
import type { VersionedEntity } from './versioned-entity';

export interface Profile extends VersionedEntity, PublicUserInfo {
	wins: number;
	losses: number;
	draws: number;
	totalGames: number;
	winRate: number;
}
