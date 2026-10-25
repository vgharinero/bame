import {
	type ApplyMoveOutcome,
	applyMove,
	canMove,
	createMatch,
	forfeitMatch,
	type Game,
	type GameResult,
	type Match,
	type MatchStatus,
	type MatchView,
	type MoveArgs,
	type MoveMap,
	replayMatch,
	type TurnState,
	undoMove,
	viewFor,
} from './engine/index.js';

export interface SimulateOptions<TConfig = undefined> {
	players?: string[];
	config?: TConfig;
	seed?: string;
}

export interface Simulation<
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = undefined,
	TView = TState,
> {
	readonly match: Match<TState, TConfig>;
	readonly state: TState;
	readonly turn: TurnState;
	readonly status: MatchStatus;
	readonly result: GameResult | undefined;
	move<K extends keyof TMoves & string>(
		playerId: string,
		moveName: K,
		...args: MoveArgs<TMoves[K]>
	): ApplyMoveOutcome<TState, TConfig>;
	canMove<K extends keyof TMoves & string>(
		playerId: string,
		moveName: K,
		...args: MoveArgs<TMoves[K]>
	): boolean;
	undo(playerId?: string): ApplyMoveOutcome<TState, TConfig>;
	forfeit(playerId: string): ApplyMoveOutcome<TState, TConfig>;
	replay(upToMoveCount?: number): Match<TState, TConfig>;
	view(playerId: string | null): MatchView<TView>;
}

/**
 * Headless test harness for simulating games synchronously without storage or realtime.
 */
export const simulate = <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = undefined,
	TView = TState,
>(
	game: Game<TState, TMoves, TConfig, TView>,
	options: SimulateOptions<TConfig> = {},
): Simulation<TState, TMoves, TConfig, TView> => {
	const defaultPlayers = Array.from(
		{ length: game.minPlayers },
		(_, index) => `p${index + 1}`,
	);
	let currentMatch = createMatch(game, {
		players: options.players ?? defaultPlayers,
		config: options.config,
		seed: options.seed ?? 'test-seed',
	});

	return {
		get match() {
			return currentMatch;
		},
		get state() {
			return currentMatch.state;
		},
		get turn() {
			return currentMatch.turn;
		},
		get status() {
			return currentMatch.status;
		},
		get result() {
			return currentMatch.result;
		},
		move<K extends keyof TMoves & string>(
			playerId: string,
			moveName: K,
			...args: MoveArgs<TMoves[K]>
		): ApplyMoveOutcome<TState, TConfig> {
			const outcome = applyMove(game, currentMatch, playerId, moveName, args);
			if (outcome.ok) {
				currentMatch = outcome.match;
			}
			return outcome;
		},
		canMove<K extends keyof TMoves & string>(
			playerId: string,
			moveName: K,
			...args: MoveArgs<TMoves[K]>
		): boolean {
			return canMove(game, currentMatch, playerId, moveName, ...args);
		},
		undo(playerId?: string): ApplyMoveOutcome<TState, TConfig> {
			const caller = playerId ?? currentMatch.turn.currentPlayerId;
			const outcome = undoMove(game, currentMatch, caller);
			if (outcome.ok) {
				currentMatch = outcome.match;
			}
			return outcome;
		},
		forfeit(playerId: string): ApplyMoveOutcome<TState, TConfig> {
			const outcome = forfeitMatch(game, currentMatch, playerId);
			if (outcome.ok) {
				currentMatch = outcome.match;
			}
			return outcome;
		},
		replay(upToMoveCount?: number): Match<TState, TConfig> {
			return replayMatch(game, currentMatch, upToMoveCount);
		},
		view(playerId: string | null): MatchView<TView> {
			return viewFor(game, currentMatch, playerId);
		},
	};
};
