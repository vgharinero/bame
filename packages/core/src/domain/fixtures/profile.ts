import type { Profile, ProfileStats } from '../profile';

export const createMockProfileStats = (
	overrides?: Partial<ProfileStats>,
): ProfileStats => ({
	wins: 0,
	losses: 0,
	draws: 0,
	totalGames: 0,
	...overrides,
});

export const createMockProfile = (
	userId: string,
	overrides?: Partial<Profile>,
): Profile => ({
	id: userId,
	version: 1,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	displayName: `Player ${userId}`,
	avatarUrl: null,
	stats: createMockProfileStats(),
	...overrides,
});
