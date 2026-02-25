import type { TurnTimer } from '../determinism';
import type { PayloadMap } from '../primitives';
import type {
	DiscriminatedFields,
	FromPerspective,
	Perspective,
	PerspectiveMap,
} from './primitives';

// export type Turn<
// 	TActionPayloadMap extends PayloadMap = PayloadMap,
// 	TPhasePayloadMap extends PayloadMap = PayloadMap,
// > = {
// 	currentPlayerId: string;
// 	allowedActions: Array<keyof TActionPayloadMap>;
// 	requiredActions?: Array<keyof TActionPayloadMap>;
// 	number: number;
// 	startedAt?: number;
// 	timer?: TurnTimer;
// } & DiscriminatedFields<TPhasePayloadMap, 'phase', 'phaseData'>;

type ActionMetadata<
	TActionPayloadMap extends PerspectiveMap,
	TPerspective extends keyof Perspective,
> = TPerspective extends 'private'
	? {
			allowedActions: keyof TActionPayloadMap[];
			requiredActions?: keyof TActionPayloadMap[];
		}
	: {};

export type Turn<
	TActionPayloadMap extends PerspectiveMap = PerspectiveMap,
	TPhasePayloadMap extends PerspectiveMap = PerspectiveMap,
	TPerspective extends keyof Perspective = 'private',
> = {
	currentPlayerId: string;
	number: number;
	startedAt?: number;
	timer?: TurnTimer;
} & ActionMetadata<TActionPayloadMap, TPerspective> &
	{
		[K in keyof TPhasePayloadMap]: {
			phase: K;
			phaseData: FromPerspective<TPhasePayloadMap[K], TPerspective>;
		};
	}[keyof TPhasePayloadMap];
