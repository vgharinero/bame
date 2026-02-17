import type { Profile } from '../engine/types';

export interface IProfileStorage {
	getProfile(userId: string): Promise<Profile | null>;

	updateAvatar(userId: string, avatarUrl: string): Promise<Profile>;

	handleGameEndAtomically(result: {
		winners: string[];
		losers: string[];
		isDraw?: boolean; // If true, everyone gets a draw
	}): Promise<void>;
}
