import type { TurnTimerState } from '../determinism';

export interface TurnState<
	TPhase extends string = string,
	TPhaseData extends object = object,
> {
	currentPlayerId: string;
	phase: TPhase;
	phaseData?: TPhaseData;
	allowedActions: string[];
	requiredActions?: string[];
	number: number;
	startedAt: number;
	timer?: TurnTimerState;
}
