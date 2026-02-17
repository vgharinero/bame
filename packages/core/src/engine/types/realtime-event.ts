import type { Action } from './action';
import type { Game } from './game';
import type { Lobby } from './lobby';
import type { LobbyMember } from './lobby-member';

export type RealtimeEvent<TType extends string, TPayload> = {
	type: TType;
	version: number;
	payload: TPayload;
};

type CreateRealtimeEvents<TMap extends Record<string, unknown>> = {
	[K in keyof TMap]: RealtimeEvent<K & string, TMap[K]>;
}[keyof TMap];

type LobbyPayloads = {
	'lobby:updated': { lobby: Partial<Lobby> };
	'lobby:member_joined': { member: LobbyMember };
	'lobby:member_left': { userId: string };
	'lobby:transitioned': { gameId: string };
};

export type LobbyRealtimeEvent = CreateRealtimeEvents<LobbyPayloads>;

type LobbiesPayloads = {
	'lobbies:available_public_lobby': { lobbyId: string };
	'lobbies:updated_public_lobby': { lobbyId: string; lobby: Partial<Lobby> };
};

export type LobbiesRealtimeEvent = CreateRealtimeEvents<LobbiesPayloads>;

type GamePayloads = {
	'game:state_updated': { state: Game };
	'game:action_applied': { action: Action };
	'game:player_disconnected': { playerId: string };
	'game:player_reconnected': { playerId: string };
	'game:finished': { winner?: string; isDraw?: boolean };
};

export type GameRealtimeEvent = CreateRealtimeEvents<GamePayloads>;
