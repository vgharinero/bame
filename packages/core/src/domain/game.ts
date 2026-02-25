import type { Payload, PayloadMap } from '../primitives';
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
	TPublicState extends Payload = Payload,
	TPrivateState extends Payload = Payload,
	TActionPayloadMap extends PayloadMap = PayloadMap,
	TPhasePayloadMap extends PayloadMap = PayloadMap,
> = VersionedEntity & {
	status: GameStatus;

	config: TConfig;
	seed: string;

	publicState: TPublicState;
	players: Player<TPrivateState>[];

	turn: Turn<TActionPayloadMap, TPhasePayloadMap>;

	winner?: string;

	startedAt?: number;
	finishedAt?: number;
};

export type ClientGame<
	TConfig extends Payload = Payload,
	TPublicState extends Payload = Payload,
	TPrivateState extends Payload = Payload,
	TEnemyState extends Payload = Payload,
	TActionPayloadMap extends PayloadMap = PayloadMap,
	TPhasePayloadMap extends PayloadMap = PayloadMap,
> = Omit<
	Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
	'players'
> & {
	player: Player<TPrivateState>;
	enemies: (Omit<Player<TPrivateState>, 'privateState'> & {
		simplifiedPrivateState: TEnemyState;
	})[];
};
