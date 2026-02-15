/** biome-ignore-all lint/suspicious/noExplicitAny: Cannot ensure type safety */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Lobby,
	LobbyMember,
	LobbyMemberStatus,
	LobbyStatus,
} from '../../../engine/types';
import type { ILobbyStorage } from '../../../storage';

export class SupabaseLobbyStorage implements ILobbyStorage {
	constructor(private client: SupabaseClient) {}

	async createLobby<TConfig extends object>(
		hostId: string,
		config: TConfig,
		minPlayers: number,
		maxPlayers: number,
	): Promise<Lobby<TConfig>> {
		// Create lobby
		const { data: lobbyData, error: lobbyError } = await this.client
			.from('lobbies')
			.insert({
				host_id: hostId,
				config: config,
				min_players: minPlayers,
				max_players: maxPlayers,
			})
			.select()
			.single();

		if (lobbyError) throw lobbyError;

		// Auto-join host as member
		const { error: memberError } = await this.client
			.from('lobby_members')
			.insert({
				lobby_id: lobbyData.id,
				user_id: hostId,
			});

		if (memberError) throw memberError;

		const lobby = await this.getLobby<TConfig>(lobbyData.id);
		if (!lobby) throw new Error('Lobby not found');

		return lobby;
	}

	async getLobby<TConfig extends object>(
		lobbyId: string,
	): Promise<Lobby<TConfig> | null> {
		const { data: lobbyData, error: lobbyError } = await this.client
			.from('lobbies')
			.select(`
                *,
                lobby_members (
					user_id,
					status,
					joined_at,
					profiles (
						id,
						display_name,
						avatar_url
					)
                )
            `)
			.eq('id', lobbyId)
			.single();

		if (lobbyError) {
			if (lobbyError.code === 'PGRST116') return null;
			throw lobbyError;
		}

		return this.mapToLobby<TConfig>(lobbyData);
	}

	async listLobbies<TConfig extends object>(filters?: {
		status?: 'waiting' | 'ready';
		hasSpace?: boolean;
	}): Promise<Lobby<TConfig>[]> {
		let query = this.client.from('lobbies').select(`
            *,
            lobby_members (
				user_id,
				status,
				joined_at,
				profiles (
					id,
					display_name,
                    avatar_url
                )
            )
        `);

		if (filters?.status) {
			query = query.eq('status', filters.status);
		} else {
			query = query.in('status', ['waiting', 'ready']);
		}

		const { data, error } = await query.order('created_at', {
			ascending: false,
		});

		if (error) throw error;

		let lobbies = data.map((d) => this.mapToLobby<TConfig>(d));

		if (filters?.hasSpace) {
			lobbies = lobbies.filter((l) => l.members.length < l.maxPlayers);
		}

		return lobbies;
	}

	async updateConfig<TConfig extends object>(
		lobbyId: string,
		config: TConfig,
	): Promise<Lobby<TConfig>> {
		const { error } = await this.client
			.from('lobbies')
			.update({ config })
			.eq('id', lobbyId);

		if (error) throw error;

		const lobby = await this.getLobby<TConfig>(lobbyId);
		if (!lobby) throw new Error('Lobby not found');

		return lobby;
	}

	async updateLobbyStatus(lobbyId: string, status: LobbyStatus): Promise<void> {
		const { error } = await this.client
			.from('lobbies')
			.update({ status })
			.eq('id', lobbyId);

		if (error) throw error;
	}

	async deleteLobby(lobbyId: string): Promise<void> {
		const { error } = await this.client
			.from('lobbies')
			.delete()
			.eq('id', lobbyId);

		if (error) throw error;
	}

	async joinLobby(lobbyId: string, userId: string): Promise<LobbyMember> {
		const { data, error } = await this.client
			.from('lobby_members')
			.insert({
				lobby_id: lobbyId,
				user_id: userId,
			})
			.select(`
                *,
                profiles (
                    id,
                    display_name,
                    avatar_url
                )
            `)
			.single();

		if (error) throw error;

		return this.mapToLobbyMember(data);
	}

	async leaveLobby(lobbyId: string, userId: string): Promise<void> {
		const { error } = await this.client
			.from('lobby_members')
			.delete()
			.eq('lobby_id', lobbyId)
			.eq('user_id', userId);

		if (error) throw error;
	}

	async updateMemberStatus(
		lobbyId: string,
		userId: string,
		status: LobbyMemberStatus,
	): Promise<void> {
		const { error } = await this.client
			.from('lobby_members')
			.update({ status })
			.eq('lobby_id', lobbyId)
			.eq('user_id', userId);

		if (error) throw error;
	}

	private mapToLobby<TConfig extends object>(data: any): Lobby<TConfig> {
		return {
			id: data.id,
			code: data.code,
			hostId: data.host_id,
			status: data.status,
			gameConfig: data.config as TConfig,
			minPlayers: data.min_players,
			maxPlayers: data.max_players,
			members: data.lobby_members.map((m: any) => this.mapToLobbyMember(m)),
			createdAt: new Date(data.created_at).getTime(),
			updatedAt: new Date(data.updated_at).getTime(),
		};
	}

	private mapToLobbyMember(data: any): LobbyMember {
		const profile = data.profiles;
		return {
			lobbyId: data.lobby_id,
			id: profile.id,
			displayName: profile.display_name,
			avatarUrl: profile.avatar_url,
			status: data.status,
			joinedAt: new Date(data.joined_at).getTime(),
		};
	}
}
