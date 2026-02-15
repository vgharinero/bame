import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type {
	Action,
	GameState,
	Lobby,
	LobbyMember,
} from '../../../engine/types';
import type {
	GameRealtimeEvent,
	IRealtimeStorage,
	LobbyRealtimeEvent,
	RealtimeSubscription,
} from '../../../storage';

export class SupabaseRealtimeStorage implements IRealtimeStorage {
	constructor(private client: SupabaseClient) {}

	subscribeLobby(
		lobbyId: string,
		callback: (event: LobbyRealtimeEvent) => void,
	): RealtimeSubscription {
		const channel: RealtimeChannel = this.client
			.channel(`lobby:${lobbyId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'lobbies',
					filter: `id=eq.${lobbyId}`,
				},
				(payload) => {
					callback({
						type: 'lobby:updated',
						lobby: payload.new as Lobby,
					});
				},
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'lobbies',
					filter: `status=eq.'transitioned'`,
				},
				(payload) => {
					callback({
						type: 'lobby:transitioned',
						gameId: payload.new.game_id,
					});
				},
			)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'lobby_members',
					filter: `lobby_id=eq.${lobbyId}`,
				},
				(payload) => {
					callback({
						type: 'lobby:member_joined',
						member: payload.new as LobbyMember,
					});
				},
			)
			.on(
				'postgres_changes',
				{
					event: 'DELETE',
					schema: 'public',
					table: 'lobby_members',
					filter: `lobby_id=eq.${lobbyId}`,
				},
				(payload) => {
					callback({
						type: 'lobby:member_left',
						userId: payload.old.user_id,
					});
				},
			)
			.subscribe();

		return {
			unsubscribe: () => {
				this.client.removeChannel(channel);
			},
		};
	}

	subscribeGame(
		gameId: string,
		callback: (event: GameRealtimeEvent) => void,
	): RealtimeSubscription {
		const channel: RealtimeChannel = this.client
			.channel(`game:${gameId}`)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'games',
					filter: `id=eq.${gameId}`,
				},
				(payload) => {
					callback({
						type: 'game:state_updated',
						state: payload.new as GameState,
					});
				},
			)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'game_actions',
					filter: `game_id=eq.${gameId}`,
				},
				(payload) => {
					callback({
						type: 'game:action_applied',
						action: payload.new.action_data as Action,
					});
				},
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'game_players',
					filter: `game_id=eq.${gameId}`,
				},
				(payload) => {
					const newStatus = payload.new.status;
					const oldStatus = payload.old?.status;

					if (newStatus === 'disconnected' && oldStatus !== 'disconnected') {
						callback({
							type: 'game:player_disconnected',
							playerId: payload.new.user_id,
						});
					} else if (oldStatus === 'disconnected' && newStatus === 'active') {
						callback({
							type: 'game:player_reconnected',
							playerId: payload.new.user_id,
						});
					}
				},
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'games',
					filter: `status=eq.'finished'`,
				},
				(payload) => {
					callback({
						type: 'game:finished',
						winner: payload.new.winner,
						isDraw: payload.new.is_draw,
					});
				},
			)
			.subscribe();

		return {
			unsubscribe: () => {
				this.client.removeChannel(channel);
			},
		};
	}

	async broadcastLobbyEvent(
		_lobbyId: string,
		_event: LobbyRealtimeEvent,
	): Promise<void> {
		// No-op: postgres_changes handles broadcasts automatically
	}

	async broadcastGameEvent(
		_gameId: string,
		_event: GameRealtimeEvent,
	): Promise<void> {
		// No-op: postgres_changes handles broadcasts automatically
	}
}
