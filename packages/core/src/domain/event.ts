import type { Keys, Payload } from '../primitives';
import type { Action } from './action';
import type { Game, GameDefinition, GameStatus } from './game';
import type { LobbyStatus, PublicLobby } from './lobby';
import type { LobbyMember } from './lobby-member';
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

type GamePayloads<TDef extends GameDefinition> = {
	'game:state_updated': { state: TDef['State'] };
	'game:status_updated': { status: GameStatus };
	'game:turn_updated': Turn<TDef['ActionMap'], TDef['PhaseMap']>;
	'game:enemy_turn_updated': Turn<
		TDef['ActionMap'],
		TDef['PhaseMap'],
		'public'
	>;
	'game:player_updated': Player<TDef['PlayerState']>;
	'game:enemy_updated': Player<TDef['PlayerState'], 'public'>;
	'game:action_completed': Action<TDef['ActionMap'], TDef['PhaseMap']>;
	'game:enemy_action_completed': Action<
		TDef['ActionMap'],
		TDef['PhaseMap'],
		'public'
	>;
	'game:invalid_action': { reason: string };
	'game:finished': Game<TDef>; // TODO: leaner event?
};

export type GameDomainEvent<TDef extends GameDefinition> = CreateDomainEvents<
	GamePayloads<TDef>
>;
