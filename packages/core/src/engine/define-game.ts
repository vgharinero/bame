import type { RandomProvider } from './random.js';
import type {
	EndIfContext,
	Game,
	GameResult,
	MatchView,
	MoveCheck,
	MoveHandler,
	PlayerConfig,
	SetupContext,
	TurnOptions,
	ViewContext,
} from './types.js';

export const normalizePlayers = (config: PlayerConfig) => {
	if (typeof config === 'number') {
		if (!Number.isInteger(config) || config < 1) {
			throw new Error('players count must be a positive integer');
		}
		return { minPlayers: config, maxPlayers: config };
	}
	if (
		!Number.isInteger(config.min) ||
		!Number.isInteger(config.max) ||
		config.min < 1 ||
		config.max < config.min
	) {
		throw new Error('players bounds must satisfy 1 <= min <= max');
	}
	return { minPlayers: config.min, maxPlayers: config.max };
};

/**
 * Define a turn-based game with full TypeScript inference for state, moves,
 * configuration, and per-player view.
 */
export const defineGame = <
	TState,
	// biome-ignore lint/suspicious/noExplicitAny: preserve specific move parameter tuples
	TMoves extends Record<string, (...args: any[]) => any>,
	TConfig = unknown,
	TView = NoInfer<TState>,
>(spec: {
	name: string;
	rulesVersion?: string;
	randomProvider?: RandomProvider;
	validateConfig?: (config: NoInfer<TConfig>) => string | undefined;
	validateArgs?: (
		move: keyof TMoves & string,
		args: readonly unknown[],
	) => string | undefined;
	checkMove?: (
		view: MatchView<NoInfer<TView>>,
		move: keyof TMoves & string,
		args: readonly unknown[],
	) => MoveCheck;
	players: PlayerConfig;
	setup: (ctx: SetupContext<TConfig>) => TState;
	moves: TMoves &
		// biome-ignore lint/suspicious/noExplicitAny: preserve move args
		Record<string, MoveHandler<NoInfer<TState>, any[], NoInfer<TConfig>>>;
	endIf?: (
		ctx: EndIfContext<NoInfer<TState>, NoInfer<TConfig>>,
	) => GameResult | undefined;
	view?: (ctx: ViewContext<NoInfer<TState>, NoInfer<TConfig>>) => TView;
	turn?: TurnOptions<keyof TMoves & string>;
}): Game<TState, TMoves, TConfig, TView> => {
	if (!spec.name || typeof spec.name !== 'string') {
		throw new Error('Game name must be a non-empty string');
	}
	const { minPlayers, maxPlayers } = normalizePlayers(spec.players);

	return {
		...spec,
		minPlayers,
		maxPlayers,
	};
};
