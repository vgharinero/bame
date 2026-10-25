import type { InvalidMove, TurnDirective } from './invalid.js';
import type { GameRandom, RandomProvider } from './random.js';

export type PlayerConfig = number | { min: number; max: number };

export interface PlayerRef {
	id: string;
	index: number;
}

export type GameResult =
	| { winner: string; scores?: Record<string, number>; reason?: string }
	| {
			winner: null;
			draw?: boolean;
			scores?: Record<string, number>;
			reason?: string;
	  }
	| {
			draw: boolean;
			winner?: null;
			scores?: Record<string, number>;
			reason?: string;
	  };

export interface GameNotificationInput<TData = unknown> {
	/**
	 * Recipient player ID, array of player IDs, `'all'` (every player in the match),
	 * or `'opponents'` (every player except the player making the move).
	 */
	to: string | readonly string[] | 'all' | 'opponents';
	/** Notification category (e.g. `'trade_offer'`, `'robber_discard'`, `'turn_reminder'`) */
	type: string;
	/** Human-readable notification text */
	message: string;
	/** Optional structured payload (e.g. trade offer details) */
	data?: TData;
}

export interface GameNotification<TData = unknown> {
	id: string;
	matchId: string;
	game: string;
	fromPlayerId: string;
	toPlayerIds: string[];
	type: string;
	message: string;
	data?: TData;
	timestamp: number;
}

export interface SetupContext<TConfig = unknown> {
	players: PlayerRef[];
	config: TConfig;
	random: GameRandom;
}

export interface MoveContext<TState, TConfig = unknown> {
	state: TState;
	player: PlayerRef;
	players: PlayerRef[];
	turn: TurnState;
	config: TConfig;
	random: GameRandom;
	/**
	 * Explicitly end the current player's turn and optionally jump to a specific
	 * `nextPlayerId` (e.g. for Catan snake drafts, UNO reverse/skip, or custom turn order).
	 */
	endTurn(nextPlayerId?: string): TurnDirective;
	/**
	 * Keep the turn on the current player after this move finishes.
	 */
	keepTurn(): TurnDirective;
	/**
	 * Reject the move with a human-readable error message without modifying state.
	 */
	invalid(reason: string): InvalidMove;
	/**
	 * Emit a notification to specific players, `'opponents'`, or `'all'`
	 * (e.g. when proposing a market trade offer or requiring players to discard on a 7).
	 */
	notify<TData = unknown>(notification: GameNotificationInput<TData>): void;
	/**
	 * Pause the current turn to wait for specific player(s) to respond out-of-turn
	 * (e.g. waiting for Bob and Charlie to discard cards when a 7 is rolled in Catan,
	 * or waiting for an opponent to respond to a reaction card in Mistborn).
	 * Pass `null` or `[]` once all responses are complete to resume normal turn flow.
	 */
	waitFor(
		playerIds: string | readonly string[] | 'opponents' | 'all' | null,
	): void;
}

export interface EndIfContext<TState, TConfig = unknown> {
	state: TState;
	player: PlayerRef;
	players: PlayerRef[];
	turn: TurnState;
	config: TConfig;
}

export interface ViewContext<TState, TConfig = unknown> {
	state: TState;
	playerId: string | null;
	players: PlayerRef[];
	turn: TurnState;
	config: TConfig;
}

// biome-ignore lint/suspicious/noExplicitAny: variadic move args inference
export type MoveHandler<TState, TArgs extends any[] = any[], TConfig = any> = (
	ctx: MoveContext<TState, TConfig>,
	...args: TArgs
	// biome-ignore lint/suspicious/noConfusingVoidType: allow move functions with no return statement
) => TState | InvalidMove | TurnDirective | undefined | void;

export type MoveMap<TState> = Record<string, MoveHandler<TState>>;

export type MoveArgs<THandler> = THandler extends (
	// biome-ignore lint/suspicious/noExplicitAny: context first arg
	ctx: any,
	...args: infer TArgs
) => unknown
	? TArgs
	: unknown[];

export interface TurnOptions<TMoveNames extends string = string> {
	/**
	 * Maximum moves a player can make in a single turn before the turn
	 * automatically advances to the next player. Defaults to 1.
	 */
	movesPerTurn?: number;
	/**
	 * Allow non-active players (`player.id !== turn.currentPlayerId`) to execute moves:
	 * - `true`: Any player in the match can execute any move at any time (simultaneous games like 7 Wonders, Diplomacy, Rock-Paper-Scissors).
	 * - `TMoveNames[]`: Specific move names that non-active players can call during another player's turn (e.g. `['acceptTrade', 'declineTrade', 'discardCards']` in Catan).
	 */
	allowOutOfTurn?: boolean | readonly TMoveNames[];
	/**
	 * Whether players can undo the last move via `bame.matches.undo()` / `useMatch().undo()`.
	 * Defaults to `false`.
	 */
	allowUndo?: boolean;
}

export type MoveCheck = 'allowed' | 'denied' | 'unknown';
export interface ActionReceipt {
	actor: string;
	requestId: string;
	expectedVersion: number;
	appliedVersion: number;
	digest: string;
}

export interface GameSpec<
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = unknown,
	TView = TState,
> {
	name: string;
	rulesVersion?: string;
	randomProvider?: RandomProvider;
	validateConfig?: (config: TConfig) => string | undefined;
	validateArgs?(
		move: keyof TMoves & string,
		args: readonly unknown[],
	): string | undefined;
	checkMove?(
		view: MatchView<TView>,
		move: keyof TMoves & string,
		args: readonly unknown[],
	): MoveCheck;
	players: PlayerConfig;
	setup: (ctx: SetupContext<TConfig>) => TState;
	moves: TMoves;
	endIf?: (ctx: EndIfContext<TState, TConfig>) => GameResult | undefined;
	view?: (ctx: ViewContext<TState, TConfig>) => TView;
	turn?: TurnOptions<keyof TMoves & string>;
}

export interface NormalizedPlayerBounds {
	minPlayers: number;
	maxPlayers: number;
}

export type Game<
	TState = unknown,
	TMoves extends MoveMap<TState> = MoveMap<TState>,
	TConfig = unknown,
	TView = TState,
> = GameSpec<TState, TMoves, TConfig, TView> & NormalizedPlayerBounds;

// biome-ignore lint/suspicious/noExplicitAny: type extractor
export type StateOf<TGame> = TGame extends Game<infer S, any, any, any>
	? S
	: never;
// biome-ignore lint/suspicious/noExplicitAny: type extractor
export type MovesOf<TGame> = TGame extends Game<any, infer M, any, any>
	? M
	: never;
// biome-ignore lint/suspicious/noExplicitAny: type extractor
export type ConfigOf<TGame> = TGame extends Game<any, any, infer C, any>
	? C
	: never;
// biome-ignore lint/suspicious/noExplicitAny: type extractor
export type ViewOf<TGame> = TGame extends Game<any, any, any, infer V>
	? V
	: never;

export type MatchStatus = 'active' | 'finished';

export interface TurnState {
	/** 1-based turn counter */
	number: number;
	/** ID of the player whose turn it is */
	currentPlayerId: string;
	/** 0-based index in `players` */
	currentPlayerIndex: number;
	/** Number of moves already made during the current turn */
	movesMade: number;
	/**
	 * Optional list of player IDs the match is currently waiting on to act
	 * (set via `ctx.waitFor(...)` during interrupts, robber discards, or trade offers).
	 * When omitted, the match is waiting on `[currentPlayerId]`.
	 */
	waitingFor?: string[];
}

export interface MoveRecord {
	turn: number;
	playerId: string;
	move: string;
	args: unknown[];
	timestamp: number;
}

export interface Match<TState = unknown, TConfig = unknown> {
	id: string;
	rulesVersion: string;
	randomProviderId: string;
	receipts?: ActionReceipt[];
	game: string;
	version: number;
	status: MatchStatus;
	players: PlayerRef[];
	config: TConfig;
	state: TState;
	turn: TurnState;
	result?: GameResult;
	/** Internal RNG state cursor (never exposed in MatchView) */
	rngState: number;
	/** Internal initial seed (never exposed in MatchView) */
	seed: string;
	history: MoveRecord[];
	createdAt: number;
	updatedAt: number;
	finishedAt?: number;
}

export interface MatchView<TView = unknown> {
	id: string;
	game: string;
	version: number;
	status: MatchStatus;
	players: PlayerRef[];
	playerId: string | null;
	state: TView;
	turn: TurnState;
	result?: GameResult;
	createdAt: number;
	updatedAt: number;
	finishedAt?: number;
}
