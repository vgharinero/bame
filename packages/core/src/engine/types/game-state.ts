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
	TPhase extends string = string,
	TPhaseData extends object = object,
> {
	gameId: string;
	status: GameStatus;

	config: TConfig;

	publicState: TPublicState;
	players: Player<TPrivateState>[];

	turn: TurnState<TPhase, TPhaseData>;

	winner?: string;

	createdAt: number;
	updatedAt: number;
	startedAt?: number;
	finishedAt?: number;

	// For determinism
	seed: string;
}
