import type { Player } from './player';
import type { TurnState } from './turn';

export type GameStatus =
	| 'waiting'
	| 'starting'
	| 'active'
	| 'finished'
	| 'aborted';

export interface GameState<
	TConfig extends object = object,
	TPublicState extends object = object,
	TPrivateState extends object = object,
	TActionType extends string = string,
	TPhase extends string = string,
	TPhaseData extends object = object,
> {
	id: string;
	status: GameStatus;

	config: TConfig;
	seed: string;

	publicState: TPublicState;
	players: Player<TPrivateState>[];

	turn: TurnState<TActionType, TPhase, TPhaseData>;

	winner?: string;

	createdAt: number;
	updatedAt: number;
	startedAt?: number;
	finishedAt?: number;
}
