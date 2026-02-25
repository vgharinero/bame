import type { Profile } from '../domain';
import type { ProfileStorageAdapter, RealtimeAdapter } from '../storage';

export const handleGetProfile = async (
	profileStorage: ProfileStorageAdapter,
	userId: string,
): Promise<Profile | null> => {
	return await profileStorage.getProfile(userId);
};

export const handleGetProfiles = async (
	profileStorage: ProfileStorageAdapter,
	userIds: string[],
): Promise<Profile[]> => {
	return await profileStorage.getProfilesByIds(userIds);
};

export const handleUpdateAvatar = async (
	profileStorage: ProfileStorageAdapter,
	realtime: RealtimeAdapter,
	userId: string,
	avatarUrl: string,
): Promise<Profile> => {
	const profile = await profileStorage.getProfile(userId);
	if (!profile) {
		throw new Error('Profile not found');
	}

	profile.avatarUrl = avatarUrl;
	await profileStorage.updateProfile(profile);

	await realtime.broadcastProfileEvent(userId, {
		type: 'profile:new_avatar',
		version: profile.version,
		payload: { avatarUrl },
	});

	return profile;
};
