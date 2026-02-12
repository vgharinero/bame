import type { LobbyMember } from '../engine/types';
import type { Action } from '../engine/types/action';
import type { GameState } from '../engine/types/game-state';
import type { Lobby } from '../engine/types/lobby';

// Lobby events
export type LobbyRealtimeEvent =
	| { type: 'lobby:updated'; lobby: Lobby<any> }
	| { type: 'lobby:member_joined'; member: LobbyMember }
	| { type: 'lobby:member_left'; userId: string }
	| { type: 'lobby:started'; gameId: string };

// Game events
export type GameRealtimeEvent =
	| { type: 'game:state_updated'; state: GameState<any, any, any, any, any> }
	| { type: 'game:action_applied'; action: Action }
	| { type: 'game:player_disconnected'; playerId: string }
	| { type: 'game:player_reconnected'; playerId: string }
	| { type: 'game:finished'; winner?: string; isDraw?: boolean };

export interface RealtimeSubscription {
	unsubscribe: () => void;
}

export interface IRealtimeStorage {
	subscribeLobby(
		lobbyId: string,
		callback: (event: LobbyRealtimeEvent) => void,
	): RealtimeSubscription;

	subscribeGame(
		gameId: string,
		callback: (event: GameRealtimeEvent) => void,
	): RealtimeSubscription;

	broadcastLobbyEvent(
		lobbyId: string,
		event: LobbyRealtimeEvent,
	): Promise<void>;

	broadcastGameEvent(gameId: string, event: GameRealtimeEvent): Promise<void>;
}
