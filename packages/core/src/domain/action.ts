import type { Keys } from '../primitives';
import type {
	EitherVizFields,
	FromVizUnionFields,
	Perspective,
	PerspectiveMap,
} from './perspective';

export type Action<
	TActionPayloadMap extends PerspectiveMap = PerspectiveMap,
	TPhasePayloadMap extends PerspectiveMap = PerspectiveMap,
	TPerspectiveKey extends keyof Perspective = 'private',
> = {
	userId: string;
	timestamp: number;
} & EitherVizFields<
	TPerspectiveKey,
	{
		advancesPhase?: boolean;
		requiredPhase?: Keys<TPhasePayloadMap>;
	}
> &
	FromVizUnionFields<'type', 'data', TActionPayloadMap, TPerspectiveKey>;
