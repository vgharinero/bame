'use server';

import type { Profile } from '../../engine/types';
import type { IProfileStorage } from '../../storage';

export const updateProfileAvatar = async (
	storage: IProfileStorage,
	userId: string,
	avatarUrl: string,
): Promise<Profile> => {
	return await storage.updateAvatar(userId, avatarUrl);
};
