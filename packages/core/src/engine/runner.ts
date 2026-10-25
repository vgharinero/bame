import { assertJson, jsonClone } from '../store/json.js';
import {
	endTurn as createEndTurnDirective,
	invalid as createInvalidMove,
	keepTurn as createKeepTurnDirective,
	isInvalidMove,
	isTurnDirective,
} from './invalid.js';
import { defaultRandomProvider } from './random.js';
import type {
	Game,
	GameNotification,
	GameNotificationInput,
	Match,
	MatchView,
	MoveArgs,
	MoveMap,
	PlayerRef,
	TurnState,
} from './types.js';

export interface CreateMatchOptions<TConfig = undefined> {
	id?: string;
	players: string[];
	config?: TConfig;
	seed?: string;
	now?: number;
}

export type ApplyMoveOutcome<TState = unknown, TConfig = unknown> =
	| {
			ok: true;
			match: Match<TState, TConfig>;
			notifications: GameNotification[];
	  }
	| { ok: false; error: string };

const generateId = (): string => globalThis.crypto.randomUUID();

export const createMatch = <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = undefined,
	TView = TState,
>(
	game: Game<TState, TMoves, TConfig, TView>,
	options: CreateMatchOptions<TConfig>,
): Match<TState, TConfig> => {
	const {
		id = generateId(),
		players: playerIds,
		config = undefined as TConfig,
		seed = generateId(),
		now = Date.now(),
	} = options;

	if (
		playerIds.length < game.minPlayers ||
		playerIds.length > game.maxPlayers
	) {
		throw new Error(
			`Game "${game.name}" requires between ${game.minPlayers} and ${game.maxPlayers} players (got ${playerIds.length})`,
		);
	}

	const uniqueIds = new Set(playerIds);
	if (uniqueIds.size !== playerIds.length) {
		throw new Error('Duplicate player IDs are not allowed');
	}

	const players: PlayerRef[] = playerIds.map((playerId, index) => ({
		id: playerId,
		index,
	}));

	assertJson(config, 'config');
	const configError = game.validateConfig?.(config);
	if (configError) throw new Error(configError);
	const provider = game.randomProvider ?? defaultRandomProvider;
	const random = provider.create(seed);
	const initialState = jsonClone(
		game.setup({
			players: structuredClone(players),
			config: structuredClone(config),
			random,
		}),
	);

	const turn: TurnState = {
		number: 1,
		currentPlayerId: players[0].id,
		currentPlayerIndex: 0,
		movesMade: 0,
	};

	return {
		id,
		rulesVersion: game.rulesVersion ?? '1',
		randomProviderId: provider.id,
		game: game.name,
		version: 1,
		status: 'active',
		players,
		config: jsonClone(config),
		state: initialState,
		turn,
		rngState: random.getCursor(),
		seed,
		history: [],
		createdAt: now,
		updatedAt: now,
	};
};

export const applyMove = <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = undefined,
	TView = TState,
	K extends keyof TMoves & string = keyof TMoves & string,
>(
	game: Game<TState, TMoves, TConfig, TView>,
	match: Match<TState, TConfig>,
	userId: string,
	moveName: K,
	args: MoveArgs<TMoves[K]>,
	now: number = Date.now(),
): ApplyMoveOutcome<TState, TConfig> => {
	if (match.status !== 'active') {
		return { ok: false, error: 'Match is already finished' };
	}

	const player = match.players.find((p) => p.id === userId);
	if (!player) {
		return { ok: false, error: 'You are not a player in this match' };
	}

	if (
		match.rulesVersion !== (game.rulesVersion ?? '1') ||
		match.randomProviderId !== (game.randomProvider ?? defaultRandomProvider).id
	)
		return { ok: false, error: 'Incompatible game rules or random provider' };
	const handler = Object.hasOwn(game.moves, moveName)
		? game.moves[moveName]
		: undefined;
	if (typeof handler !== 'function') {
		return { ok: false, error: `Unknown move "${moveName}"` };
	}

	const isOutOfTurn = match.turn.currentPlayerId !== userId;
	const isWaitingOnUser = Boolean(match.turn.waitingFor?.includes(userId));
	if (isOutOfTurn && !isWaitingOnUser) {
		const allow = game.turn?.allowOutOfTurn;
		const isAllowed =
			allow === true || (Array.isArray(allow) && allow.includes(moveName));
		if (!isAllowed) {
			return { ok: false, error: 'Not your turn' };
		}
	}

	try {
		assertJson(args, 'args');
	} catch {
		return { ok: false, error: 'Move arguments must be JSON-compatible' };
	}
	const argsError = game.validateArgs?.(moveName, args);
	if (argsError) return { ok: false, error: argsError };

	const workingState = structuredClone(match.state);
	const clonedArgs = structuredClone(args);
	const random = (game.randomProvider ?? defaultRandomProvider).create(
		match.seed,
		match.rngState,
	);

	const movesPerTurn = game.turn?.movesPerTurn ?? 1;
	const nextMovesMade = isOutOfTurn
		? match.turn.movesMade
		: match.turn.movesMade + 1;

	// If an out-of-turn player makes an allowed out-of-turn move (e.g. accepting a trade
	// or discarding on a 7 in Catan), keep the turn on the current turn owner by default.
	let shouldEndTurn = isOutOfTurn ? false : nextMovesMade >= movesPerTurn;
	let explicitNextPlayerId: string | undefined;
	let nextWaitingFor: string[] | undefined = match.turn.waitingFor
		? [...match.turn.waitingFor]
		: undefined;
	const pendingNotifications: GameNotification[] = [];

	const ctx = {
		state: workingState,
		player: { ...player },
		players: structuredClone(match.players),
		turn: structuredClone(match.turn),
		config: structuredClone(match.config),
		random,
		endTurn: (nextPlayerId?: string) => {
			shouldEndTurn = true;
			explicitNextPlayerId = nextPlayerId;
			return createEndTurnDirective(nextPlayerId);
		},
		keepTurn: () => {
			shouldEndTurn = false;
			explicitNextPlayerId = undefined;
			return createKeepTurnDirective();
		},
		invalid: (reason: string) => createInvalidMove(reason),
		notify: <TData = unknown>(input: GameNotificationInput<TData>) => {
			let recipients: string[];
			if (input.to === 'all') {
				recipients = match.players.map((p) => p.id);
			} else if (input.to === 'opponents') {
				recipients = match.players
					.filter((p) => p.id !== userId)
					.map((p) => p.id);
			} else if (typeof input.to === 'string') {
				recipients = [input.to];
			} else {
				recipients = [...input.to];
			}

			pendingNotifications.push({
				id: generateId(),
				matchId: match.id,
				game: match.game,
				fromPlayerId: userId,
				toPlayerIds: recipients,
				type: input.type,
				message: input.message,
				data:
					input.data !== undefined ? structuredClone(input.data) : undefined,
				timestamp: now,
			});
		},
		waitFor: (
			target: string | readonly string[] | 'opponents' | 'all' | null,
		) => {
			if (target === null) {
				nextWaitingFor = undefined;
				return;
			}
			let ids: string[];
			if (target === 'all') {
				ids = match.players.map((p) => p.id);
			} else if (target === 'opponents') {
				ids = match.players.filter((p) => p.id !== userId).map((p) => p.id);
			} else if (typeof target === 'string') {
				ids = [target];
			} else {
				ids = [...target];
			}
			nextWaitingFor = ids.length > 0 ? ids : undefined;
			// Waiting on players during a turn implicitly keeps the current turn open
			if (nextWaitingFor) {
				shouldEndTurn = false;
			}
		},
	};

	const returned = handler(ctx, ...clonedArgs);

	if (isInvalidMove(returned)) {
		return { ok: false, error: returned.reason };
	}

	if (isTurnDirective(returned)) {
		if (returned.action === 'keep') {
			shouldEndTurn = false;
			explicitNextPlayerId = undefined;
		} else {
			shouldEndTurn = true;
			if (returned.nextPlayerId !== undefined) {
				explicitNextPlayerId = returned.nextPlayerId;
			}
		}
	}

	if (explicitNextPlayerId !== undefined) {
		const targetExists = match.players.some(
			(p) => p.id === explicitNextPlayerId,
		);
		if (!targetExists) {
			return {
				ok: false,
				error: `Unknown next player "${explicitNextPlayerId}"`,
			};
		}
	}

	const nextState = (
		returned !== undefined && !isTurnDirective(returned)
			? returned
			: workingState
	) as TState;

	assertJson(nextState, 'state');
	const rawEndResult = game.endIf?.({
		state: structuredClone(nextState),
		player: { ...player },
		players: structuredClone(match.players),
		turn: { ...structuredClone(match.turn), movesMade: nextMovesMade },
		config: structuredClone(match.config),
	});
	const endResult =
		rawEndResult &&
		'draw' in rawEndResult &&
		rawEndResult.draw === false &&
		!('winner' in rawEndResult)
			? undefined
			: rawEndResult;

	let nextTurn: TurnState;
	if (endResult) {
		nextTurn = {
			number: match.turn.number,
			currentPlayerId: match.turn.currentPlayerId,
			currentPlayerIndex: match.turn.currentPlayerIndex,
			movesMade: nextMovesMade,
		};
	} else if (shouldEndTurn) {
		const nextIndex =
			explicitNextPlayerId !== undefined
				? match.players.findIndex((p) => p.id === explicitNextPlayerId)
				: (match.turn.currentPlayerIndex + 1) % match.players.length;
		nextTurn = {
			number: match.turn.number + 1,
			currentPlayerIndex: nextIndex,
			currentPlayerId: match.players[nextIndex].id,
			movesMade: 0,
		};
	} else {
		nextTurn = {
			number: match.turn.number,
			currentPlayerId: match.turn.currentPlayerId,
			currentPlayerIndex: match.turn.currentPlayerIndex,
			movesMade: nextMovesMade,
			...(nextWaitingFor ? { waitingFor: nextWaitingFor } : {}),
		};
	}

	assertJson(endResult, 'result');
	const nextMatch: Match<TState, TConfig> = {
		...match,
		version: match.version + 1,
		status: endResult ? 'finished' : 'active',
		state: jsonClone(nextState),
		turn: nextTurn,
		result: endResult,
		rngState: random.getCursor(),
		history: [
			...match.history,
			{
				turn: match.turn.number,
				playerId: userId,
				move: moveName,
				args: clonedArgs,
				timestamp: now,
			},
		],
		updatedAt: now,
		finishedAt: endResult ? now : undefined,
	};

	return {
		ok: true,
		match: nextMatch,
		notifications: pendingNotifications,
	};
};

export const viewFor = <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = undefined,
	TView = TState,
>(
	game: Game<TState, TMoves, TConfig, TView>,
	match: Match<TState, TConfig>,
	playerId: string | null,
): MatchView<TView> => {
	const clonedState = structuredClone(match.state);
	const viewState = game.view
		? game.view({
				state: clonedState,
				playerId,
				players: structuredClone(match.players),
				turn: { ...match.turn },
				config: structuredClone(match.config),
			})
		: (clonedState as unknown as TView);

	return {
		id: match.id,
		game: match.game,
		version: match.version,
		status: match.status,
		players: structuredClone(match.players),
		playerId,
		state: viewState,
		turn: { ...match.turn },
		result: match.result ? { ...match.result } : undefined,
		createdAt: match.createdAt,
		updatedAt: match.updatedAt,
		finishedAt: match.finishedAt,
	};
};

/**
 * Dry-run a move against a `Match` or `MatchView` without mutating or persisting anything.
 * Useful in UI code to check why a move would be rejected.
 */
export const validateMove = <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = undefined,
	TView = TState,
	K extends keyof TMoves & string = keyof TMoves & string,
>(
	game: Game<TState, TMoves, TConfig, TView>,
	matchOrView: Match<TState, TConfig> | MatchView<TState>,
	userId: string,
	moveName: K,
	args: MoveArgs<TMoves[K]>,
): { ok: true } | { ok: false; error: string } => {
	if ('rngState' in matchOrView) {
		const outcome = applyMove(game, matchOrView, userId, moveName, args);
		return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
	}

	if (game.checkMove) {
		const res = game.checkMove(
			matchOrView as unknown as MatchView<TView>,
			moveName,
			args,
		);
		return res === 'denied'
			? { ok: false, error: 'Move denied by checkMove' }
			: { ok: true };
	}

	if (game.view) {
		return {
			ok: false,
			error:
				'Authoritative validation requires a full match; define checkMove for projected views',
		};
	}

	const provider = game.randomProvider ?? defaultRandomProvider;
	const syntheticMatch: Match<TState, TConfig> = {
		...matchOrView,
		rulesVersion: game.rulesVersion ?? '1',
		randomProviderId: provider.id,
		config: undefined as TConfig,
		rngState: 0,
		seed: 'dry-run-seed',
		history: [],
	};
	const outcome = applyMove(game, syntheticMatch, userId, moveName, args);
	return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
};

/**
 * Returns `true` if `userId` can legally execute `moveName` with `args` right now.
 * Ideal for disabling or highlighting buttons in React / Console UIs without duplicating rules.
 */
export const canMove = <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = undefined,
	TView = TState,
	K extends keyof TMoves & string = keyof TMoves & string,
>(
	game: Game<TState, TMoves, TConfig, TView>,
	matchOrView: Match<TState, TConfig> | MatchView<TState>,
	userId: string,
	moveName: K,
	...args: MoveArgs<TMoves[K]>
): boolean => validateMove(game, matchOrView, userId, moveName, args).ok;

/**
 * Deterministically reconstruct a `Match` from its initial `seed` and `history`
 * up to `upToMoveCount` moves (defaults to full history).
 * Powers both move-by-move match replay scrubbers and deterministic `undoMove`.
 */
export const replayMatch = <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = undefined,
	TView = TState,
>(
	game: Game<TState, TMoves, TConfig, TView>,
	match: Match<TState, TConfig>,
	upToMoveCount: number = match.history.length,
): Match<TState, TConfig> => {
	if (
		match.rulesVersion !== (game.rulesVersion ?? '1') ||
		match.randomProviderId !== (game.randomProvider ?? defaultRandomProvider).id
	)
		throw new Error('Incompatible game rules or random provider');
	const clampedCount = Math.max(
		0,
		Math.min(upToMoveCount, match.history.length),
	);
	let current = createMatch(game, {
		id: match.id,
		players: match.players.map((p) => p.id),
		config: match.config,
		seed: match.seed,
		now: match.createdAt,
	});

	for (let i = 0; i < clampedCount; i++) {
		const record = match.history[i];
		const outcome = applyMove(
			game,
			current,
			record.playerId,
			record.move as keyof TMoves & string,
			record.args as MoveArgs<TMoves[keyof TMoves & string]>,
			record.timestamp,
		);
		if (!outcome.ok) {
			throw new Error(
				`Failed to replay move #${i + 1} ("${record.move}"): ${outcome.error}`,
			);
		}
		current = outcome.match;
	}

	return current;
};

/**
 * Undo the most recent move in a match (when `turn.allowUndo: true` is configured on the game)
 * by deterministically replaying `history.slice(0, -1)` from the match's initial `seed`.
 */
export const undoMove = <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = undefined,
	TView = TState,
>(
	game: Game<TState, TMoves, TConfig, TView>,
	match: Match<TState, TConfig>,
	userId: string,
	now: number = Date.now(),
): ApplyMoveOutcome<TState, TConfig> => {
	if (match.status !== 'active')
		return { ok: false, error: 'Finished matches are final' };
	if (!game.turn?.allowUndo) {
		return { ok: false, error: 'Undo is not enabled for this game' };
	}
	if (!match.players.some((p) => p.id === userId)) {
		return { ok: false, error: 'You are not a player in this match' };
	}
	if (match.history.length === 0) {
		return { ok: false, error: 'No moves to undo' };
	}

	if (match.history.at(-1)?.playerId !== userId)
		return { ok: false, error: 'Only the last mover may undo' };
	const replayed = replayMatch(game, match, match.history.length - 1);
	const nextMatch: Match<TState, TConfig> = {
		...replayed,
		receipts: match.receipts,
		version: match.version + 1,
		updatedAt: now,
	};

	return {
		ok: true,
		match: nextMatch,
		notifications: [],
	};
};

/**
 * Forfeit / resign a match on behalf of `userId`.
 * If exactly 1 opponent remains, that opponent wins; otherwise the match finishes with `{ winner: null, reason }`.
 */
export const forfeitMatch = <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = undefined,
	TView = TState,
>(
	_game: Game<TState, TMoves, TConfig, TView>,
	match: Match<TState, TConfig>,
	userId: string,
	now: number = Date.now(),
): ApplyMoveOutcome<TState, TConfig> => {
	if (match.status !== 'active') {
		return { ok: false, error: 'Match is already finished' };
	}
	if (!match.players.some((p) => p.id === userId)) {
		return { ok: false, error: 'You are not a player in this match' };
	}

	const remainingOpponents = match.players.filter((p) => p.id !== userId);
	const reason = `${userId} forfeited`;
	const result =
		remainingOpponents.length === 1
			? { winner: remainingOpponents[0].id, reason }
			: { winner: null, reason };

	const nextMatch: Match<TState, TConfig> = {
		...match,
		version: match.version + 1,
		status: 'finished',
		result,
		updatedAt: now,
		finishedAt: now,
	};

	const notifications: GameNotification[] =
		remainingOpponents.length > 0
			? [
					{
						id: generateId(),
						matchId: match.id,
						game: match.game,
						fromPlayerId: userId,
						toPlayerIds: remainingOpponents.map((p) => p.id),
						type: 'forfeit',
						message: `${userId} forfeited the match`,
						timestamp: now,
					},
				]
			: [];

	return {
		ok: true,
		match: nextMatch,
		notifications,
	};
};
