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

export interface GameDefinition {
	Config: Payload;
	State: Payload;
	PlayerState: Perspective;
	ActionMap: PerspectiveMap;
	PhaseMap: PerspectiveMap;
}

export type Game<
	TDef extends GameDefinition,
	TViz extends Viz = 'private',
> = VersionedEntity & {
	id: string;
	config: TDef['Config'];
	seed: string;

	status: GameStatus;
	state: TDef['State'];

	winner?: string;
	startedAt?: number;
	finishedAt?: number;
} & EitherVizFields<
		TViz,
		{
			players: Player<TDef['PlayerState']>[];
			turn: Turn<TDef['ActionMap'], TDef['PhaseMap']>;
		},
		{
			player: Player<TDef['PlayerState']>;
			enemies: Player<TDef['PlayerState'], 'public'>[];
			turn: Turn<TDef['ActionMap'], TDef['PhaseMap'], Viz>;
		}
	>;
