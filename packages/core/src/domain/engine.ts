import type { Action } from './action';
import type { Game, GameDefinition } from './game';
import type { Player } from './player';
import type {
	ApplyActionResult,
	CheckGameEndResult,
	InitializationResult,
	ValidateActionResult,
} from './results';
import type { Turn } from './turn';

export type Engine<TDef extends GameDefinition> = {
	name: string;
	minPlayers: number;
	maxPlayers: number;

	initialize(
		config: TDef['Config'],
		playerIds: string[],
		seed: string,
	): InitializationResult<TDef>;

	projectPlayer(
		player: Player<TDef['PlayerState']>,
	): Player<TDef['PlayerState'], 'public'>;

	projectAction(
		action: Action<TDef['ActionMap'], TDef['PhaseMap']>,
	): Action<TDef['ActionMap'], TDef['PhaseMap'], 'public'>;

	projectTurn(
		turn: Turn<TDef['ActionMap'], TDef['PhaseMap']>,
	): Turn<TDef['ActionMap'], TDef['PhaseMap'], 'public'>;

	validateAction(
		game: Game<TDef>,
		action: Action<TDef['ActionMap'], TDef['PhaseMap']>,
	): ValidateActionResult;

	applyAction(
		game: Game<TDef>,
		action: Action<TDef['ActionMap'], TDef['PhaseMap']>,
	): ApplyActionResult<TDef>;

	checkGameEnd(game: Game<TDef>): CheckGameEndResult;
};

export const projectGame = <TDef extends GameDefinition>(
	engine: Engine<TDef>,
	game: Game<TDef>,
	userId: string,
): Game<TDef, 'public'> => {
	const [player, enemies] = game.players.reduce(
		(acc, item) => {
			if (item.userId === userId && !acc[0]) acc[0] = item;
			else acc[1].push(engine.projectPlayer(item));
			return acc;
		},
		[null as any, []] as [
			Player<TDef['PlayerState']>,
			Player<TDef['PlayerState'], 'public'>[],
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
