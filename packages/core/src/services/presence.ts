import type {
	Realtime,
	SubscriptionOptions,
	Unsubscribe,
} from '../store/index.js';
import { bestEffort, type ErrorReporter } from './errors.js';

export type PresenceStatus = 'online' | 'away' | 'offline';

export interface PresenceEntry {
	userId: string;
	status: PresenceStatus;
	updatedAt: number;
	expiresAt: number;
}

export interface PresenceSnapshot {
	scope: string;
	entries: Record<string, PresenceEntry>;
}

export interface ReportPresenceInput {
	scope: string;
	userId: string;
	status: PresenceStatus;
	ttlMs?: number;
}

export const DEFAULT_PRESENCE_TTL_MS = 45_000;
const OFFLINE_RETENTION_MS = 5 * 60_000;

export const matchPresenceScope = (matchId: string) =>
	`match:${encodeURIComponent(matchId)}`;

export const lobbyPresenceScope = (lobbyId: string) =>
	`lobby:${encodeURIComponent(lobbyId)}`;

export const presenceChannel = (scope: string) => `presence:${scope}`;

export const createPresenceService = (
	realtime: Realtime,
	onError?: ErrorReporter,
) => {
	const scopes = new Map<string, Map<string, PresenceEntry>>();

	const getScopeMap = (scope: string) => {
		let map = scopes.get(scope);
		if (!map) {
			map = new Map<string, PresenceEntry>();
			scopes.set(scope, map);
		}
		return map;
	};

	const prune = (scope: string, now = Date.now()) => {
		const map = scopes.get(scope);
		if (!map) return;
		for (const [userId, entry] of map.entries()) {
			if (entry.expiresAt > now) continue;
			if (entry.status !== 'offline') {
				map.set(userId, {
					userId,
					status: 'offline',
					updatedAt: entry.expiresAt,
					expiresAt: entry.expiresAt + OFFLINE_RETENTION_MS,
				});
			} else {
				map.delete(userId);
			}
		}
		if (map.size === 0) scopes.delete(scope);
	};

	const get = async (
		scope: string,
		_userId?: string,
	): Promise<PresenceSnapshot> => {
		const now = Date.now();
		prune(scope, now);
		const map = scopes.get(scope);
		return {
			scope,
			entries: map ? Object.fromEntries(map.entries()) : {},
		};
	};

	const report = async (
		input: ReportPresenceInput,
	): Promise<PresenceSnapshot> => {
		const now = Date.now();
		const ttl =
			input.status === 'offline'
				? OFFLINE_RETENTION_MS
				: (input.ttlMs ?? DEFAULT_PRESENCE_TTL_MS);
		const entry: PresenceEntry = {
			userId: input.userId,
			status: input.status,
			updatedAt: now,
			expiresAt: now + ttl,
		};
		getScopeMap(input.scope).set(input.userId, entry);
		prune(input.scope, now);
		await bestEffort(
			() =>
				realtime.publish<PresenceSnapshot>(presenceChannel(input.scope), {
					scope: input.scope,
					entries: { [input.userId]: entry },
				}),
			{ operation: 'presence.publish' },
			onError,
		);
		return get(input.scope);
	};

	const subscribe = (
		scope: string,
		callback: (snapshot: PresenceSnapshot) => void | Promise<void>,
		options?: SubscriptionOptions,
	): Unsubscribe =>
		realtime.subscribe<PresenceSnapshot>(
			presenceChannel(scope),
			callback,
			options,
		);

	return {
		report,
		get,
		subscribe,
	};
};
