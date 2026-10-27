import { type ErrorInput, errorResult } from './errors.js';

const INVALID_SYMBOL = Symbol.for('@bame/core/invalid');
const TURN_DIRECTIVE_SYMBOL = Symbol.for('@bame/core/turn-directive');

export interface InvalidMove {
	readonly [INVALID_SYMBOL]: true;
	readonly reason: string;
	readonly code?: string;
	readonly params?: Record<string, unknown>;
}

export interface TurnDirective {
	readonly [TURN_DIRECTIVE_SYMBOL]: true;
	readonly action: 'keep' | 'end';
	readonly nextPlayerId?: string;
}

/**
 * Return `invalid('reason')` from inside a move handler to reject the move
 * with a human-readable error message without modifying the match state.
 * Use `invalid({ code: 'DISCARD_REQUIRED', params: { count: 3 } })` for
 * language-independent feedback; `message` is an optional fallback.
 */
export const invalid = (input: ErrorInput): InvalidMove => {
	const { error, code, params } = errorResult(input);
	return {
		[INVALID_SYMBOL]: true,
		reason: error,
		...(code === undefined ? {} : { code }),
		...(params === undefined ? {} : { params }),
	};
};

export const isInvalidMove = (value: unknown): value is InvalidMove =>
	typeof value === 'object' &&
	value !== null &&
	(value as Record<symbol, unknown>)[INVALID_SYMBOL] === true;

/**
 * Keep the turn on the current player after this move finishes.
 * Can be called via `ctx.keepTurn()` or returned via `return keepTurn()`.
 */
export const keepTurn = (): TurnDirective => ({
	[TURN_DIRECTIVE_SYMBOL]: true,
	action: 'keep',
});

/**
 * End the current player's turn and optionally jump to a specific `nextPlayerId`
 * (e.g. for Catan snake-draft placement, UNO reverse/skip, or custom turn order).
 * Can be called via `ctx.endTurn(nextPlayerId)` or returned via `return endTurn(nextPlayerId)`.
 */
export const endTurn = (nextPlayerId?: string): TurnDirective => ({
	[TURN_DIRECTIVE_SYMBOL]: true,
	action: 'end',
	nextPlayerId,
});

export const isTurnDirective = (value: unknown): value is TurnDirective =>
	typeof value === 'object' &&
	value !== null &&
	(value as Record<symbol, unknown>)[TURN_DIRECTIVE_SYMBOL] === true;
