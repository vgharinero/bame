import type { Payload } from '../primitives';
import type { Action } from './action';
import type { Game } from './game';
import type { Perspective, PerspectiveMap } from './perspective';
import type { Player } from './player';
import type {
	ApplyActionResult,
	CheckGameEndResult,
	InitializationResult,
	ValidateActionResult,
} from './results';
import type { Turn } from './turn';

export type Engine<
	TConfig extends Payload,
	TState extends Payload,
	TPlayerState extends Perspective,
	TActionMap extends PerspectiveMap,
	TPhaseMap extends PerspectiveMap,
> = {
	name: string;
	minPlayers: number;
	maxPlayers: number;

	initialize(
		config: TConfig,
		playerIds: string[],
		seed: string,
	): InitializationResult<TState, TPlayerState, TActionMap, TPhaseMap>;

	projectPlayer(player: Player<TPlayerState>): Player<TPlayerState, 'public'>;

	projectAction(
		action: Action<TActionMap, TPhaseMap>,
	): Action<TActionMap, TPhaseMap, 'public'>;

	projectTurn(
		turn: Turn<TActionMap, TPhaseMap>,
	): Turn<TActionMap, TPhaseMap, 'public'>;

	validateAction(
		game: Game<TConfig, TState, TPlayerState, TActionMap, TPhaseMap>,
		action: Action<TActionMap, TPhaseMap>,
	): ValidateActionResult;

	applyAction(
		game: Game<TConfig, TState, TPlayerState, TActionMap, TPhaseMap>,
		action: Action<TActionMap, TPhaseMap>,
	): ApplyActionResult<TState, TPlayerState, TActionMap, TPhaseMap>;

	checkGameEnd(
		game: Game<TConfig, TState, TPlayerState, TActionMap, TPhaseMap>,
	): CheckGameEndResult;
};

export const projectGame = <
	TConfig extends Payload,
	TState extends Payload,
	TPlayerState extends Perspective,
	TActionMap extends PerspectiveMap,
	TPhaseMap extends PerspectiveMap,
>(
	engine: Engine<TConfig, TState, TPlayerState, TActionMap, TPhaseMap>,
	game: Game<TConfig, TState, TPlayerState, TActionMap, TPhaseMap>,
	userId: string,
): Game<TConfig, TState, TPlayerState, TActionMap, TPhaseMap, 'public'> => {
	const [player, enemies] = game.players.reduce(
		(acc, item) => {
			if (item.userId === userId && !acc[0]) acc[0] = item;
			else acc[1].push(engine.projectPlayer(item));
			return acc;
		},
		[null as any, []] as [
			Player<TPlayerState>,
			Player<TPlayerState, 'public'>[],
		],
	);

	const turn =
		userId === game.turn.userId ? game.turn : engine.projectTurn(game.turn);

	return {
		...game,
		player,
		enemies,
		turn,
	};
};
