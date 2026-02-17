import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '../../../engine/types';
import type { IProfileStorage } from '../../../storage/profile';

export class SupabaseProfileStorage implements IProfileStorage {
	constructor(private client: SupabaseClient) {}

	async getProfile(userId: string): Promise<Profile | null> {
		const { data, error } = await this.client
			.from('profiles')
			.select('*')
			.eq('id', userId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') return null; // Not found
			throw error;
		}

		return this.mapToProfile(data);
	}

	async updateAvatar(userId: string, avatarUrl: string): Promise<Profile> {
		const { data, error } = await this.client
			.from('profiles')
			.update({ avatar_url: avatarUrl })
			.eq('id', userId)
			.select()
			.single();

		if (error) throw error;

		return this.mapToProfile(data);
	}

	async handleGameEndAtomically(result: {
		winners: string[];
		losers: string[];
		isDraw?: boolean;
	}): Promise<void> {
		const { error } = await this.client.rpc('handle_game_end', {
			p_winners: result.winners,
			p_losers: result.losers,
			p_is_draw: result.isDraw ?? false,
		});

		if (error) throw error;
	}

	private mapToProfile(data: any): Profile {
		return {
			id: data.id,
			displayName: data.display_name,
			avatarUrl: data.avatar_url,
			wins: data.wins,
			losses: data.losses,
			draws: data.draws,
			totalGames: data.total_games,
			winRate: parseFloat(data.win_rate),
			createdAt: data.created_at,
			updatedAt: data.updated_at,
		};
	}
}
