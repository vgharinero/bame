import type { SupabaseClient } from '@supabase/supabase-js';
import type { Action, Game, Player, Turn } from '../../../engine/types';
import type { IGameStorage } from '../../../storage';

export class SupabaseGameStorage implements IGameStorage {
	constructor(private client: SupabaseClient) {}

	async getGame<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameId: string,
	): Promise<Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	> | null> {
		const { data, error } = await this.client
			.from('games')
			.select(`
				*,
				game_players (
					user_id,
					status,
					private_state,
					joined_at,
					profiles (
						id,
						display_name,
						avatar_url
					)
				)
			`)
			.eq('id', gameId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') return null;
			throw error;
		}

		return this.mapToGameState<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>(data);
	}

	async updateGameState<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameId: string,
		state: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
	): Promise<void> {
		const { error } = await this.client
			.from('games')
			.update({
				public_state: state.publicState,
				status: state.status,
				winner: state.winner,
				finished_at: state.finishedAt
					? new Date(state.finishedAt).toISOString()
					: null,
			})
			.eq('id', gameId);

		if (error) throw error;
	}

	async updateGameStatus(
		gameId: string,
		status: 'waiting' | 'starting' | 'active' | 'finished' | 'aborted',
	): Promise<void> {
		const { error } = await this.client
			.from('games')
			.update({ status })
			.eq('id', gameId);

		if (error) throw error;
	}

	async updatePlayerStatus(
		gameId: string,
		playerId: string,
		status: 'active' | 'eliminated' | 'disconnected',
	): Promise<void> {
		const { error } = await this.client
			.from('game_players')
			.update({ status })
			.eq('game_id', gameId)
			.eq('user_id', playerId);

		if (error) throw error;
	}

	async saveAction(gameId: string, action: Action): Promise<void> {
		const { error } = await this.client.from('game_actions').insert({
			game_id: gameId,
			action_data: action,
		});

		if (error) throw error;
	}

	async getActionHistory(gameId: string): Promise<Action[]> {
		const { data, error } = await this.client
			.from('game_actions')
			.select('action_data')
			.eq('game_id', gameId)
			.order('created_at', { ascending: true });

		if (error) throw error;

		return data.map((d) => d.action_data as Action);
	}

	async transitionLobbyToGameAtomically<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TPhase extends string,
		TPhaseData extends object,
	>(
		lobbyId: string,
		publicState: TPublicState,
		currentPlayerId: string,
		currentPhase: TPhase,
		turnData: Turn<TActionType, TPhase, TPhaseData>,
		playerIds: string[],
		privateStates: TPrivateState[],
		config: TConfig,
		seed: string,
	): Promise<void> {
		const { error } = await this.client.rpc('transition_lobby_to_game', {
			p_lobby_id: lobbyId,
			p_public_state: publicState,
			p_current_player_id: currentPlayerId,
			p_current_phase: currentPhase,
			p_turn_data: turnData,
			p_player_ids: playerIds,
			p_private_states: privateStates,
			p_config: config,
			p_seed: seed,
		});

		if (error) throw error;
	}

	async applyGameActionAtomically<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameId: string,
		newState: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
		action: Action,
	): Promise<void> {
		const { error } = await this.client.rpc('apply_game_action', {
			p_game_id: gameId,
			p_new_state: newState.publicState,
			p_action: action,
		});

		if (error) throw error;
	}

	async syncPlayerToGameAtomically(
		gameId: string,
		userId: string,
	): Promise<void> {
		const { error } = await this.client.rpc('sync_player_to_game', {
			p_game_id: gameId,
			p_user_id: userId,
		});

		if (error) throw error;
	}

	private mapToGameState<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TPhase extends string,
		TPhaseData extends object,
	>(
		data: any,
	): Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	> {
		return {
			id: data.id,
			status: data.status,
			config: data.config as TConfig,
			seed: data.seed,
			publicState: data.public_state as TPublicState,
			players:
				data.game_players?.map((p: any) =>
					this.mapToPlayer<TPrivateState>(p),
				) || [],
			turn: data.turn, // Assuming turn is stored in public_state
			winner: data.winner,
			createdAt: new Date(data.created_at).getTime(),
			updatedAt: new Date(data.updated_at).getTime(),
			startedAt: data.started_at
				? new Date(data.started_at).getTime()
				: undefined,
			finishedAt: data.finished_at
				? new Date(data.finished_at).getTime()
				: undefined,
		};
	}

	private mapToPlayer<TPrivateState extends object>(
		data: any,
	): Player<TPrivateState> {
		const profile = data.profiles;
		return {
			id: profile.id,
			displayName: profile.display_name,
			avatarUrl: profile.avatar_url,
			status: data.status,
			privateState: data.private_state as TPrivateState,
			joinedAt: new Date(data.joined_at).getTime(),
		};
	}
}
