import type { Payload } from '../primitives';
import type {
	EitherVizFields,
	Perspective,
	PerspectiveMap,
	Viz,
} from './perspective';
import type { Player } from './player';
import type { Turn } from './turn';
import type { VersionedEntity } from './versioned';

export type GameStatus =
	| 'waiting'
	| 'active'
	| 'paused'
	| 'finished'
	| 'aborted';

export type Game<
	TConfig extends Payload = Payload,
	TState extends Payload = Payload,
	TPlayerState extends Perspective = Perspective,
	TActionMap extends PerspectiveMap = PerspectiveMap,
	TPhaseMap extends PerspectiveMap = PerspectiveMap,
	TViz extends Viz = 'private',
> = VersionedEntity & {
	readonly id: string;
	readonly config: TConfig;
	readonly seed: string;

	status: GameStatus;
	state: TState;

	winner?: string;
	startedAt?: number; // all players synced
	finishedAt?: number;
} & EitherVizFields<
		TViz,
		{
			players: Player<TPlayerState>[];
			turn: Turn<TActionMap, TPhaseMap>;
		},
		{
			player: Player<TPlayerState>;
			enemies: Player<TPlayerState, 'public'>[];
			turn: Turn<TActionMap, TPhaseMap, Viz>;
		}
	>;
