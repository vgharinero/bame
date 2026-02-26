import type { TurnTimer } from '../determinism';
import type { Keys } from '../primitives';
import type {
	EitherVizFields,
	FromVizUnionFields,
	PerspectiveMap,
	Viz,
} from './perspective';

export type Turn<
	TActionMap extends PerspectiveMap = PerspectiveMap,
	TPhaseMap extends PerspectiveMap = PerspectiveMap,
	TViz extends Viz = 'private',
> = {
	userId: string;
	number: number;
	timer?: TurnTimer;
} & EitherVizFields<
	TViz,
	{
		allowedActions: Keys<TActionMap>[];
		requiredActions?: Keys<TActionMap>[];
	}
> &
	FromVizUnionFields<'phase', 'phaseData', TPhaseMap, TViz>;
