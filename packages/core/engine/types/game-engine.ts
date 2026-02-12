import type { Action, ActionResult } from './action';
import type { GameState } from './game-state';

export interface GameEngine<
	TConfig extends object = object,
	TPublicState extends object = object,
	TPrivateState extends object = object,
	TActionType extends string = string,
	TActionPayload extends object = object,
	TPhase extends string = string,
	TPhaseData extends object = object,
> {
	name: string;
	minPlayers: number;
	maxPlayers: number;

	initialize(
		config: TConfig,
		playerIds: string[],
		seed: string,
	): GameState<TConfig, TPublicState, TPrivateState, TPhase, TPhaseData>;

	validateAction(
		state: GameState<TConfig, TPublicState, TPrivateState, TPhase, TPhaseData>,
		action: Action<TActionType, TActionPayload>,
	): boolean;

	applyAction(
		state: GameState<TConfig, TPublicState, TPrivateState, TPhase, TPhaseData>,
		action: Action<TActionType, TActionPayload>,
	): ActionResult<
		GameState<TConfig, TPublicState, TPrivateState, TPhase, TPhaseData>
	>;

	checkGameEnd(
		state: GameState<TConfig, TPublicState, TPrivateState, TPhase, TPhaseData>,
	): {
		isFinished: boolean;
		winner?: string;
		isDraw?: boolean;
	};
}
