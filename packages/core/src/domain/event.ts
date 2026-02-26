import type { Keys, Payload } from '../primitives';
import type { Action } from './action';
import type { Game, GameStatus } from './game';
import type { LobbyStatus, PublicLobby } from './lobby';
import type { LobbyMember } from './lobby-member';
import type { Perspective, PerspectiveMap } from './perspective';
import type { Player } from './player';
import type { ProfileStats } from './profile';
import type { Turn } from './turn';

export type DomainEvent<
	TType extends string = string,
	TPayload extends Payload = Payload,
> = {
	type: TType;
	version: number;
	payload?: TPayload;
};

type CreateDomainEvents<TMap extends Record<string, Payload>> = {
	[K in Keys<TMap>]: DomainEvent<K, TMap[K]>;
}[Keys<TMap>];

type ProfilePayloads = {
	'profile:avatar_updated': { avatarUrl: string };
	'profile:stats_updated': { statsDelta: Partial<ProfileStats> };
};

export type ProfileDomainEvent = CreateDomainEvents<ProfilePayloads>;

type LobbyPayloads<TConfig extends Payload> = {
	'lobby:status_updated': { status: LobbyStatus };
	'lobby:transitioned': null;
	'lobby:config_updated': { config: TConfig };
	'lobby:member_joined': { member: LobbyMember };
	'lobby:member_left': { userId: string };
	'lobby:member_ready': { userId: string };
	'lobby:member_not_ready': { userId: string };
};

export type LobbyDomainEvent<TConfig extends Payload> = CreateDomainEvents<
	LobbyPayloads<TConfig>
>;

type LobbiesPayloads = {
	'lobbies:available': { lobby: PublicLobby };
	'lobbies:with_room': { lobbyId: string };
	'lobbies:full': { lobbyId: string };
	'lobbies:removed': { lobbyId: string };
};

export type LobbiesDomainEvent = CreateDomainEvents<LobbiesPayloads>;

type GamePayloads<
	TConfig extends Payload,
	TState extends Payload,
	TPlayerState extends Perspective,
	TActionMap extends PerspectiveMap,
	TPhaseMap extends PerspectiveMap,
> = {
	'game:state_updated': { state: TState };
	'game:status_updated': { status: GameStatus };
	'game:player_st': Player<TPlayerState>;
	'game:enemy_updated': Player<TPlayerState, 'public'>;
	'game:turn_updated': Turn<TActionMap, TPhaseMap>;
	'game:enemy_turn_updated': Turn<TActionMap, TPhaseMap, 'public'>;
	'game:action_completed': Action<TActionMap, TPhaseMap>;
	'game:enemy_action_completed': Action<TActionMap, TPhaseMap, 'public'>;
	'game:invalid_action': { reason: string };
	'game:finished': Game<TConfig, TState, TPlayerState, TActionMap, TPhaseMap>; // TODO: leaner event?
};

export type GameDomainEvent<
	TConfig extends Payload,
	TState extends Payload,
	TPlayerState extends Perspective,
	TActionMap extends PerspectiveMap,
	TPhaseMap extends PerspectiveMap,
> = CreateDomainEvents<
	GamePayloads<TConfig, TState, TPlayerState, TActionMap, TPhaseMap>
>;
