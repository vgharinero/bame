import type { Action, ActionResult } from './action';
import type { GameState } from './game-state';
import type { TurnState } from './turn';

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
	): GameInitializationResult<
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>;

	validateAction(
		state: GameState<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
		action: Action<TActionType, TActionPayload>,
	): boolean;

	applyAction(
		state: GameState<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
		action: Action<TActionType, TActionPayload>,
	): ActionResult<
		GameState<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>
	>;

	checkGameEnd(
		state: GameState<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
	): {
		isFinished: boolean;
		winner?: string;
		isDraw?: boolean;
	};
}

export type GameInitializationResult<
	TPublicState extends object = object,
	TPrivateState extends object = object,
	TActionType extends string = string,
	TPhase extends string = string,
	TPhaseData extends object = object,
> = {
	publicState: TPublicState;
	initialPrivateStates: TPrivateState[]; // One per player, in order
	initialTurn: TurnState<TActionType, TPhase, TPhaseData>;
};
