import type { Player } from './player';
import type { Turn } from './turn';
import type { VersionedEntity } from './versioned-entity';

export type GameStatus =
	| 'waiting'
	| 'starting'
	| 'active'
	| 'finished'
	| 'aborted';

export interface Game<
	TConfig extends object = object,
	TPublicState extends object = object,
	TPrivateState extends object = object,
	TActionType extends string = string,
	TPhase extends string = string,
	TPhaseData extends object = object,
> extends VersionedEntity<string> {
	status: GameStatus;

	config: TConfig;
	seed: string;

	publicState: TPublicState;
	players: Player<TPrivateState>[];

	turn: Turn<TActionType, TPhase, TPhaseData>;

	winner?: string;

	startedAt?: number;
	finishedAt?: number;
}
