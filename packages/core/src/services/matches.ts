import {
	applyMove,
	forfeitMatch,
	type Game,
	type GameNotification,
	type Match,
	type MatchStatus,
	type MatchView,
	type MoveArgs,
	type MoveMap,
	undoMove,
	viewFor,
} from '../engine/index.js';
import {
	assertJson,
	canonicalJson,
	type Realtime,
	type Storage,
	type StorageOperation,
	type SubscriptionOptions,
	type Unsubscribe,
	VersionConflictError,
	type VersionedSnapshot,
} from '../store/index.js';
import { bestEffort, type ErrorReporter } from './errors.js';
import { matchPlayerChannel } from './lobbies.js';
import { prepareResultWrites, profileChannel } from './profiles.js';

export const userNotificationChannel = (userId: string) =>
	`user:${encodeURIComponent(userId)}:notifications`;

export interface MoveInput<
	// biome-ignore lint/suspicious/noExplicitAny: generic default
	TMoves extends MoveMap<any> = MoveMap<any>,
	K extends keyof TMoves & string = keyof TMoves & string,
> {
	requestId?: string;
	expectedVersion?: number;
	userId: string;
	matchId: string;
	move: K;
	args?: MoveArgs<TMoves[K]>;
}

export interface MatchActionInput {
	requestId?: string;
	expectedVersion?: number;
	userId: string;
	matchId: string;
}

export interface ListMatchesFilter {
	/** Only return matches where this user is a participant (and project the view for this user) */
	userId?: string;
	/** Only return active matches currently waiting on this user's turn or action (`turn.waitingFor` / `turn.currentPlayerId`) */
	waitingForUserId?: string;
	/** Filter by match status (`'active'` or `'finished'`) */
	status?: MatchStatus;
	/** Filter by game name (e.g. `'catan'`) */
	game?: string;
}

export interface BameMoveHookEvent {
	eventId: string;
	requestId?: string;
	match: Match;
	previousMatch: Match;
	playerId: string;
	move: string;
	args: unknown[];
	turnChanged: boolean;
	nextPlayerId: string;
	notifications: GameNotification[];
}

export interface BameHooks {
	/**
	 * Invoked on the server after any valid move is persisted.
	 * Ideal for sending push notifications, emails, or webhooks in multi-day async games
	 * when `event.turnChanged` is `true` or when `event.match.status === 'finished'`.
	 */
	onMove?: (event: BameMoveHookEvent) => void | Promise<void>;
	/**
	 * Invoked for each notification emitted via `ctx.notify(...)` inside a move
	 * (e.g. Catan market trade offers or robber discard alerts).
	 */
	onNotify?: (notification: GameNotification) => void | Promise<void>;
}

export type MoveResult<TView = unknown> =
	| {
			ok: true;
			view: MatchView<TView>;
			appliedVersion: number;
			duplicate: boolean;
	  }
	| { ok: false; error: string; code?: string };
export const createMatchesService = (
	// biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry
	games: Map<string, Game<any, any, any, any>>,
	storage: Storage,
	realtime: Realtime,
	hooks?: BameHooks,
	onError?: ErrorReporter,
) => {
	const requireGame = (name: string) => {
		const game = games.get(name);
		if (!game) throw new Error(`Unknown game ${name}`);
		return game;
	};
	const act = async <TView>(
		kind: 'move' | 'undo' | 'forfeit',
		input: MatchActionInput & { move?: string; args?: unknown[] },
	): Promise<MoveResult<TView>> => {
		if (
			(input.requestId === undefined) !==
				(input.expectedVersion === undefined) ||
			(input.requestId !== undefined &&
				(!input.requestId ||
					!Number.isSafeInteger(input.expectedVersion) ||
					(input.expectedVersion ?? 0) < 1))
		)
			return {
				ok: false,
				error: 'requestId and expectedVersion must be supplied together',
				code: 'INVALID_REQUEST',
			};
		const canonical = canonicalJson({
			kind,
			actor: input.userId,
			expectedVersion: input.expectedVersion,
			move: input.move,
			args: input.args ?? [],
		});
		const digest = input.requestId
			? Array.from(
					new Uint8Array(
						await crypto.subtle.digest(
							'SHA-256',
							new TextEncoder().encode(canonical),
						),
					),
					(byte) => byte.toString(16).padStart(2, '0'),
				).join('')
			: '';
		for (let attempt = 0; attempt < 5; attempt++) {
			const match = await storage.get<Match>('matches', input.matchId);
			if (!match)
				return { ok: false, error: 'Match not found', code: 'NOT_FOUND' };
			if (!match.players.some((p) => p.id === input.userId))
				return {
					ok: false,
					error: 'You are not a player in this match',
					code: 'FORBIDDEN',
				};
			const game = requireGame(match.game);
			const receipt = input.requestId
				? match.receipts?.find(
						(r) => r.actor === input.userId && r.requestId === input.requestId,
					)
				: undefined;
			if (receipt) {
				if (receipt.digest !== digest)
					return {
						ok: false,
						error: 'Request ID was reused with different input',
						code: 'CONFLICT',
					};
				return {
					ok: true,
					view: viewFor(game, match, input.userId) as MatchView<TView>,
					appliedVersion: receipt.appliedVersion,
					duplicate: true,
				};
			}
			if (
				input.expectedVersion !== undefined &&
				input.expectedVersion !== match.version
			)
				return {
					ok: false,
					error: 'Match changed; refresh before submitting a new action',
					code: 'CONFLICT',
				};
			const outcome =
				kind === 'move'
					? applyMove(
							game,
							match,
							input.userId,
							input.move ?? '',
							input.args ?? [],
						)
					: kind === 'undo'
						? undoMove(game, match, input.userId)
						: forfeitMatch(game, match, input.userId);
			if (!outcome.ok) return outcome;
			if (input.requestId)
				outcome.match.receipts = [
					...(match.receipts ?? []),
					{
						actor: input.userId,
						requestId: input.requestId,
						expectedVersion: match.version,
						appliedVersion: outcome.match.version,
						digest,
					},
				].slice(-64);
			const eventId = JSON.stringify([match.id, outcome.match.version, kind]);
			const notifications = outcome.notifications.map((n, i) => ({
				...n,
				id: JSON.stringify([eventId, i]),
			}));
			if (kind === 'move' && outcome.match.status === 'active') {
				const before = new Set(
					match.turn.waitingFor ?? [match.turn.currentPlayerId],
				);
				const notified = new Set(notifications.flatMap((n) => n.toPlayerIds));
				const recipients = (
					outcome.match.turn.waitingFor ?? [outcome.match.turn.currentPlayerId]
				).filter(
					(id) => id !== input.userId && !before.has(id) && !notified.has(id),
				);
				if (recipients.length)
					notifications.push({
						id: JSON.stringify([eventId, 'turn']),
						matchId: match.id,
						game: match.game,
						fromPlayerId: input.userId,
						toPlayerIds: recipients,
						type: 'your_turn',
						message: `Action required from you in ${match.game}!`,
						timestamp: outcome.match.updatedAt,
					});
			}
			assertJson(notifications, 'notifications');
			// Projection is checked before commit so a broken game view cannot produce an ambiguous success.
			const views = outcome.match.players.map((player) => ({
				player,
				view: viewFor(game, outcome.match, player.id),
			}));
			for (const { view } of views) assertJson(view, 'view');
			const resultWrites =
				outcome.match.status === 'finished'
					? await prepareResultWrites(storage, outcome.match)
					: { operations: [], profiles: [] };
			const operations: StorageOperation[] = [
				{
					type: 'update',
					collection: 'matches',
					doc: outcome.match,
					expectedVersion: match.version,
				},
				...resultWrites.operations,
			];
			try {
				await storage.commit(operations);
			} catch (error) {
				if (error instanceof VersionConflictError && attempt < 4) continue;
				throw error;
			}
			const context = { matchId: match.id, eventId };
			for (const profile of resultWrites.profiles)
				await bestEffort(
					() => realtime.publish(profileChannel(profile.id), profile),
					{ ...context, operation: 'profile.publish' },
					onError,
				);
			for (const { player, view } of views)
				await bestEffort(
					() =>
						realtime.publish(matchPlayerChannel(match.id, player.id), {
							version: outcome.match.version,
							view,
						}),
					{ ...context, operation: 'match.publish' },
					onError,
				);
			for (const notification of notifications) {
				for (const id of notification.toPlayerIds)
					await bestEffort(
						() => realtime.publish(userNotificationChannel(id), notification),
						{ ...context, operation: 'notification.publish' },
						onError,
					);
				await bestEffort(
					() => hooks?.onNotify?.(structuredClone(notification)),
					{ ...context, operation: 'hook.onNotify' },
					onError,
				);
			}
			if (kind === 'move')
				await bestEffort(
					() =>
						hooks?.onMove?.({
							eventId,
							requestId: input.requestId,
							match: structuredClone(outcome.match),
							previousMatch: structuredClone(match),
							playerId: input.userId,
							move: input.move ?? '',
							args: structuredClone(input.args ?? []),
							turnChanged:
								outcome.match.status === 'active' &&
								(outcome.match.turn.number !== match.turn.number ||
									outcome.match.turn.currentPlayerId !==
										match.turn.currentPlayerId),
							nextPlayerId: outcome.match.turn.currentPlayerId,
							notifications: structuredClone(notifications),
						}),
					{ ...context, operation: 'hook.onMove' },
					onError,
				);
			return {
				ok: true,
				view: views.find((v) => v.player.id === input.userId)
					?.view as MatchView<TView>,
				appliedVersion: outcome.match.version,
				duplicate: false,
			};
		}
		return {
			ok: false,
			error: 'Concurrent updates; retry later',
			code: 'CONFLICT',
		};
	};
	return {
		async get<TView = unknown>(
			matchId: string,
			userId: string | null = null,
		): Promise<MatchView<TView> | null> {
			const match = await storage.get<Match>('matches', matchId);
			if (!match) return null;

			const game = requireGame(match.game);
			return viewFor(game, match, userId) as MatchView<TView>;
		},

		async list<TView = unknown>(
			filter: ListMatchesFilter = {},
		): Promise<MatchView<TView>[]> {
			const storageFilter: Record<string, unknown> = {};
			if (filter.status) storageFilter.status = filter.status;
			if (filter.game) storageFilter.game = filter.game;

			const allMatches = await storage.find<Match>('matches', storageFilter);
			let filtered = filter.userId
				? allMatches.filter((m) =>
						m.players.some((p) => p.id === filter.userId),
					)
				: allMatches;

			if (filter.waitingForUserId) {
				const target = filter.waitingForUserId;
				filtered = filtered.filter((m) => {
					if (m.status !== 'active') return false;
					const waiting = m.turn.waitingFor ?? [m.turn.currentPlayerId];
					return waiting.includes(target);
				});
			}

			filtered.sort((a, b) => b.updatedAt - a.updatedAt);

			return filtered.map((m) => {
				const game = requireGame(m.game);
				return viewFor(game, m, filter.userId ?? null) as MatchView<TView>;
			});
		},

		move<
			TView = unknown,
			// biome-ignore lint/suspicious/noExplicitAny: generic move inference
			TMoves extends MoveMap<any> = MoveMap<any>,
			K extends keyof TMoves & string = keyof TMoves & string,
		>(input: MoveInput<TMoves, K>) {
			return act<TView>('move', input);
		},
		undo<TView = unknown>(input: MatchActionInput) {
			return act<TView>('undo', input);
		},
		forfeit<TView = unknown>(input: MatchActionInput) {
			return act<TView>('forfeit', input);
		},
		subscribe<TView = unknown>(
			matchId: string,
			userId: string,
			callback: (
				view: MatchView<TView>,
				version: number,
			) => void | Promise<void>,
			options?: SubscriptionOptions,
		): Unsubscribe {
			return realtime.subscribe<VersionedSnapshot<MatchView<TView>>>(
				matchPlayerChannel(matchId, userId),
				(snapshot) => callback(snapshot.view, snapshot.version),
				options,
			);
		},
		subscribeNotifications<TData = unknown>(
			userId: string,
			callback: (notification: GameNotification<TData>) => void | Promise<void>,
			options?: SubscriptionOptions,
		): Unsubscribe {
			return realtime.subscribe(
				userNotificationChannel(userId),
				callback,
				options,
			);
		},
	};
};
