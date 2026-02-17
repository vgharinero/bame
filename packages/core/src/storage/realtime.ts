import type {
	GameRealtimeEvent,
	LobbiesRealtimeEvent,
	LobbyRealtimeEvent,
} from '../engine';

export interface RealtimeSubscription {
	unsubscribe: () => void;
}

export interface IRealtimeStorage {
	subscribeLobby(
		lobbyId: string,
		callback: (event: LobbyRealtimeEvent) => void,
	): RealtimeSubscription;

	subscribeLobbies(
		callback: (event: LobbiesRealtimeEvent) => void,
	): RealtimeSubscription;

	subscribeGame(
		gameId: string,
		callback: (event: GameRealtimeEvent) => void,
	): RealtimeSubscription;

	broadcastLobbyEvent(
		lobbyId: string,
		event: LobbyRealtimeEvent,
	): Promise<void>;

	broadcastLobbiesEvent(
		lobbyId: string,
		event: LobbiesRealtimeEvent,
	): Promise<void>;

	broadcastGameEvent(gameId: string, event: GameRealtimeEvent): Promise<void>;
}
