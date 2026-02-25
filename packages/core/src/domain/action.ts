import type {
	FromPerspective,
	Perspective,
	PerspectiveMap,
} from './primitives';

type PhaseMetadata<
	TPhasePayloadMap extends PerspectiveMap,
	TPerspective extends keyof Perspective,
> = TPerspective extends 'private'
	? {
			advancesPhase?: boolean;
			requiredPhase?: keyof TPhasePayloadMap;
		}
	: {};

export type Action<
	TActionPayloadMap extends PerspectiveMap,
	TPhasePayloadMap extends PerspectiveMap,
	TPerspective extends keyof Perspective = 'private',
> = {
	userId: string;
	timestamp: number;
} & PhaseMetadata<TPhasePayloadMap, TPerspective> &
	{
		[K in keyof TActionPayloadMap]: {
			type: K;
			payload: FromPerspective<TActionPayloadMap[K], TPerspective>;
		};
	}[keyof TActionPayloadMap];
