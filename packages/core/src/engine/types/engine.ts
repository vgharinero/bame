import type { Action, ActionResult } from './action';
import type { Game } from './game';
import type { Turn } from './turn';

export interface Engine<
	TConfig extends object,
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TActionPayload extends object,
	TPhase extends string,
	TPhaseData extends object,
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
		state: Game<
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
		state: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
		action: Action<TActionType, TActionPayload>,
	): ActionResult<
		Game<TConfig, TPublicState, TPrivateState, TActionType, TPhase, TPhaseData>
	>;

	checkGameEnd(
		state: Game<
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
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
> = {
	publicState: TPublicState;
	initialPrivateStates: TPrivateState[]; // One per player, in order
	initialTurn: Turn<TActionType, TPhase, TPhaseData>;
};
