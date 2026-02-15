import type { TurnTimerState } from '../determinism';

export interface TurnState<
	TActionType extends string = string,
	TPhase extends string = string,
	TPhaseData extends object = object,
> {
	currentPlayerId: string;
	phase: TPhase;
	phaseData?: TPhaseData;
	allowedActions: TActionType[];
	requiredActions?: TActionType[];
	number: number;
	startedAt?: number;
	timer?: TurnTimerState;
}
