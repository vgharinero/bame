import type { Profile } from '../engine/types/profile';

export interface IProfileStorage {
	getProfile(userId: string): Promise<Profile | null>;

	updateAvatar(userId: string, avatarUrl: string): Promise<Profile>;

	handleGameEnd(result: {
		winners: string[];
		losers: string[];
		draw?: boolean; // If true, everyone gets a draw
	}): Promise<void>;
}
