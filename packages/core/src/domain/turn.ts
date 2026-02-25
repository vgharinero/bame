import type { TurnTimer } from '../determinism';
import type { PayloadMap } from '../primitives';
import type { DiscriminatedFields } from './primitives';

export type Turn<
	TActionPayloadMap extends PayloadMap = PayloadMap,
	TPhasePayloadMap extends PayloadMap = PayloadMap,
> = {
	currentPlayerId: string;
	allowedActions: Array<keyof TActionPayloadMap>;
	requiredActions?: Array<keyof TActionPayloadMap>;
	number: number;
	startedAt?: number;
	timer?: TurnTimer;
} & DiscriminatedFields<TPhasePayloadMap, 'phase', 'phaseData'>;
