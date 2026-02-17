import type { TurnTimer } from '../determinism';

export interface Turn<
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
> {
	currentPlayerId: string;
	phase: TPhase;
	phaseData?: TPhaseData;
	allowedActions: TActionType[];
	requiredActions?: TActionType[];
	number: number;
	startedAt?: number;
	timer?: TurnTimer;
}
