import type { Profile } from '../../domain';
import type { ProfileRecord } from '../schema/profile';

export namespace ProfileMapper {
	export const toDomain = (profileRecord: ProfileRecord): Profile => {
		return {
			id: profileRecord.id,
			version: profileRecord.version,
			createdAt: profileRecord.createdAt,
			updatedAt: profileRecord.updatedAt,
			displayName: profileRecord.displayName,
			avatarUrl: profileRecord.avatarUrl,
			stats: {
				wins: profileRecord.wins,
				losses: profileRecord.losses,
				draws: profileRecord.draws,
				totalGames: profileRecord.totalGames,
			},
		};
	};

	export const toRecord = (profile: Profile): ProfileRecord => {
		return {
			id: profile.id,
			version: profile.version,
			createdAt: profile.createdAt,
			updatedAt: profile.updatedAt,
			displayName: profile.displayName,
			avatarUrl: profile.avatarUrl,
			wins: profile.stats.wins,
			losses: profile.stats.losses,
			draws: profile.stats.draws,
			totalGames: profile.stats.totalGames,
		};
	};
}
