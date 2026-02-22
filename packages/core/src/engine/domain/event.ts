import type { Payload, PayloadMap } from '../primitives';
import type { Action } from './action';
import type { Game } from './game';
import type { Lobby } from './lobby';
import type { LobbyMember } from './lobby-member';
import type { Player } from './player';
import type { ProfileStats } from './profile';

export type DomainEvent<
	TType extends string = string,
	TPayload extends Payload = Payload,
> = {
	type: TType;
	version: number;
	payload: TPayload;
};

type CreateDomainEvents<TMap extends Record<string, Payload>> = {
	[K in keyof TMap & string]: DomainEvent<K, TMap[K]>;
}[keyof TMap & string];

type ProfilePayloads = {
	'profile:new_stats': { stats: ProfileStats };
};

export type ProfileDomainEvent = CreateDomainEvents<ProfilePayloads>;

type LobbyPayloads<TConfig extends Payload> = {
	'lobby:updated': { lobby: Partial<Lobby<TConfig>> };
	'lobby:member_joined': { member: LobbyMember };
	'lobby:member_left': { userId: string };
	'lobby:transitioned': { gameId: string };
};

export type LobbyDomainEvent<TConfig extends Payload> = CreateDomainEvents<
	LobbyPayloads<TConfig>
>;

type LobbiesPayloads = {
	'lobbies:available_public_lobby': { lobbyId: string };
	'lobbies:updated_public_lobby': {
		lobbyId: string;
		lobby: Pick<
			Lobby,
			'id' | 'hostId' | 'minPlayers' | 'maxPlayers' | 'status'
		>;
	};
};

export type LobbiesDomainEvent = CreateDomainEvents<LobbiesPayloads>;

type GamePayloads<
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
> = {
	'game:state_updated': {
		game: Partial<
			Game<
				TConfig,
				TPublicState,
				TPrivateState,
				TActionPayloadMap,
				TPhasePayloadMap
			>
		>;
	};
	'game:player_updated': {
		player: Player<TPrivateState>;
	};
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
