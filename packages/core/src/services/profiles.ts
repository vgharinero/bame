import type { GameResult, Match } from '../engine/index.js';
import {
	type Realtime,
	type Storage,
	type StorageOperation,
	type SubscriptionOptions,
	type Unsubscribe,
	VersionConflictError,
} from '../store/index.js';
import { bestEffort, type ErrorReporter } from './errors.js';

export interface ProfileStats {
	wins: number;
	losses: number;
	draws: number;
	totalGames: number;
}

export interface ProfileGameStats extends ProfileStats {
	totalScore: number;
}

export interface Profile {
	id: string;
	version: number;
	displayName: string;
	avatarUrl: string | null;
	stats: ProfileStats;
	/** Per-game breakdown of wins, losses, draws, totalGames, and cumulative score */
	statsByGame?: Record<string, ProfileGameStats>;
	/** Optional custom player metadata (e.g. Elo rating, rank, badges) */
	metadata?: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
}

export interface UpdateProfileInput {
	displayName?: string;
	avatarUrl?: string | null;
	metadata?: Record<string, unknown>;
}

export const profileChannel = (userId: string) =>
	`profile:${encodeURIComponent(userId)}`;

const emptyStats = (): ProfileStats => ({
	wins: 0,
	losses: 0,
	draws: 0,
	totalGames: 0,
});
const newProfile = (id: string, defaults?: UpdateProfileInput): Profile => ({
	id,
	version: 1,
	displayName: defaults?.displayName ?? id,
	avatarUrl: defaults?.avatarUrl ?? null,
	metadata: defaults?.metadata,
	stats: emptyStats(),
	createdAt: Date.now(),
	updatedAt: Date.now(),
});
function addResult(
	profile: Profile,
	result: GameResult,
	game: string,
): Profile {
	const draw =
		('draw' in result && result.draw === true) ||
		('winner' in result && result.winner === null);
	const won = 'winner' in result && result.winner === profile.id;
	const add = (stats: ProfileStats): ProfileStats => ({
		wins: stats.wins + Number(won),
		losses: stats.losses + Number(!draw && !won),
		draws: stats.draws + Number(draw),
		totalGames: stats.totalGames + 1,
	});
	const previous = profile.statsByGame?.[game] ?? {
		...emptyStats(),
		totalScore: 0,
	};
	return {
		...profile,
		stats: add(profile.stats),
		statsByGame: {
			...profile.statsByGame,
			[game]: {
				...add(previous),
				totalScore: previous.totalScore + (result.scores?.[profile.id] ?? 0),
			},
		},
	};
}

/** Prepare result writes; the caller commits these with the terminal match. */
export async function prepareResultWrites(
	storage: Storage,
	match: Match,
): Promise<{ operations: StorageOperation[]; profiles: Profile[] }> {
	const operations: StorageOperation[] = [],
		profiles: Profile[] = [];
	if (!match.result) return { operations, profiles };
	for (const player of match.players) {
		const existing = await storage.get<Profile>('profiles', player.id);
		const updated = addResult(
			existing ?? newProfile(player.id),
			match.result,
			match.game,
		);
		updated.version = existing ? existing.version + 1 : 1;
		updated.updatedAt = Date.now();
		operations.push(
			existing
				? {
						type: 'update',
						collection: 'profiles',
						doc: updated,
						expectedVersion: existing.version,
					}
				: { type: 'create', collection: 'profiles', doc: updated },
		);
		profiles.push(updated);
	}
	return { operations, profiles };
}

export const createProfilesService = (
	storage: Storage,
	realtime: Realtime,
	onError?: ErrorReporter,
) => {
	const publish = (profile: Profile) =>
		bestEffort(
			() => realtime.publish(profileChannel(profile.id), profile),
			{ operation: 'profile.publish' },
			onError,
		);
	const ensure = async (
		id: string,
		defaults?: UpdateProfileInput,
	): Promise<Profile> => {
		const existing = await storage.get<Profile>('profiles', id);
		if (existing) return existing;
		const profile = newProfile(id, defaults);
		try {
			await storage.create('profiles', profile);
		} catch (error) {
			if (!(error instanceof VersionConflictError)) throw error;
			const concurrent = await storage.get<Profile>('profiles', id);
			if (concurrent) return concurrent;
			throw error;
		}
		await publish(profile);
		return profile;
	};
	const rebuildStats = async (userId?: string): Promise<Profile[]> => {
		const ids = userId
			? [userId]
			: [
					...new Set([
						...(await storage.find<Profile>('profiles')).map((p) => p.id),
						...(
							await storage.find<Match>('matches', { status: 'finished' })
						).flatMap((m) => m.players.map((p) => p.id)),
					]),
				];
		const rebuilt: Profile[] = [];
		for (const id of ids) {
			for (let attempt = 0; attempt < 5; attempt++) {
				const current = await ensure(id);
				let next: Profile = {
					...current,
					stats: emptyStats(),
					statsByGame: {},
					version: current.version + 1,
					updatedAt: Date.now(),
				};
				for (const match of await storage.find<Match>('matches', {
					status: 'finished',
				}))
					if (match.result && match.players.some((p) => p.id === id))
						next = addResult(next, match.result, match.game);
				try {
					await storage.update('profiles', next, current.version);
				} catch (error) {
					if (error instanceof VersionConflictError && attempt < 4) continue;
					throw error;
				}
				await publish(next);
				rebuilt.push(next);
				break;
			}
		}
		return rebuilt;
	};
	return {
		ensure,
		rebuildStats,
		// Idempotent repair based on persisted results; callers cannot invent a result.
		async recordMatchResult(matchId: string) {
			const match = await storage.get<Match>('matches', matchId);
			if (!match || match.status !== 'finished')
				throw new Error('A finished match is required');
			return (
				await Promise.all(match.players.map((p) => rebuildStats(p.id)))
			).flat();
		},
		get: (id: string) => storage.get<Profile>('profiles', id),
		async list() {
			return (await storage.find<Profile>('profiles')).sort(
				(a, b) =>
					b.stats.wins - a.stats.wins ||
					b.stats.totalGames - a.stats.totalGames,
			);
		},
		async update(id: string, updates: UpdateProfileInput): Promise<Profile> {
			for (let attempt = 0; attempt < 5; attempt++) {
				const current = await ensure(id, updates);
				const next: Profile = {
					...current,
					version: current.version + 1,
					displayName: updates.displayName ?? current.displayName,
					avatarUrl:
						updates.avatarUrl === undefined
							? current.avatarUrl
							: updates.avatarUrl,
					metadata:
						updates.metadata === undefined
							? current.metadata
							: { ...current.metadata, ...updates.metadata },
					updatedAt: Date.now(),
				};
				try {
					await storage.update('profiles', next, current.version);
				} catch (error) {
					if (error instanceof VersionConflictError && attempt < 4) continue;
					throw error;
				}
				await publish(next);
				return next;
			}
			throw new Error('Concurrent profile updates');
		},
		subscribe(
			id: string,
			callback: (profile: Profile) => void | Promise<void>,
			options?: SubscriptionOptions,
		): Unsubscribe {
			return realtime.subscribe(profileChannel(id), callback, options);
		},
	};
};
export type ProfilesService = ReturnType<typeof createProfilesService>;
