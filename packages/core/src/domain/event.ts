import type { Payload, PayloadMap } from '../primitives';
import type { Action } from './action';
import type { ClientGame, Game } from './game';
import type { Lobby, PublicLobby } from './lobby';
import type { LobbyMember } from './lobby-member';
import type { Player } from './player';
import type { ProfileStats } from './profile';

export type DomainEvent<
	TType extends string = string,
	TPayload extends Payload | undefined = Payload | undefined,
> = {
	type: TType;
	version: number;
	payload?: TPayload;
};

type CreateDomainEvents<TMap extends Record<string, Payload | undefined>> = {
	[K in keyof TMap & string]: DomainEvent<K, TMap[K]>;
}[keyof TMap & string];

type ProfilePayloads = {
	'profile:new_avatar': { avatarUrl: string };
	'profile:new_stats': { statsDelta: Partial<ProfileStats> };
};

export type ProfileDomainEvent = CreateDomainEvents<ProfilePayloads>;

type LobbyPayloads<TConfig extends Payload> = {
	'lobby:updated': { lobby: Partial<Lobby<TConfig>> };
	'lobby:member_joined': { member: LobbyMember };
	'lobby:member_ready': { userId: string };
	'lobby:member_not_ready': { userId: string };
	'lobby:ready_to_start': undefined;
	'lobby:not_ready_to_start': undefined;
	'lobby:member_left': { userId: string };
	'lobby:transitioned': { gameId: string };
	'lobby:deleted': { lobbyId: string };
};

export type LobbyDomainEvent<TConfig extends Payload> = CreateDomainEvents<
	LobbyPayloads<TConfig>
>;

type LobbiesPayloads = {
	'lobbies:available_public_lobby': { lobby: PublicLobby };
	'lobbies:updated_public_lobby': { lobby: PublicLobby };
	'lobbies:removed_public_lobby': { lobbyId: string };
};

export type LobbiesDomainEvent = CreateDomainEvents<LobbiesPayloads>;

type GamePayloads<
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
> = {
	'game:updated': {
		game: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionPayloadMap,
			TPhasePayloadMap
		>;
	};
	'game:player_updated': { playerId: string; state: TPrivateState };
	'game:action_applied': {
		action: Action<TActionPayloadMap, TPhasePayloadMap>;
	};
	'game:player_disconnected': { playerId: string };
	'game:player_reconnected': { playerId: string };
	'game:finished': { winner?: string; isDraw?: boolean };
};

export type GameDomainEvent<
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
> = CreateDomainEvents<
	GamePayloads<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>
>;