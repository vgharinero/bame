import type { PayloadMap } from '../primitives';
import type { DiscriminatedFields } from './primitives';

export type Action<
	TActionPayloadMap extends PayloadMap = PayloadMap,
	TPhasePayloadMap extends PayloadMap = PayloadMap,
> = {
	userId: string;
	timestamp: number;
	advancesPhase?: boolean;
	requiredPhase?: keyof TPhasePayloadMap;
} & DiscriminatedFields<TActionPayloadMap, 'type', 'payload'>;
