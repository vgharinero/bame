'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '../../engine/types';
import { profileActions } from '../../server/actions';
import { useAuth, useStorage } from '../context';

export interface UseProfileReturn {
	profile: Profile | null;
	isLoading: boolean;
	error: Error | null;

	updateAvatar: (avatarUrl: string) => Promise<void>;

	refetch: () => Promise<void>;
}

export const useProfile = (): UseProfileReturn => {
	const { user } = useAuth();
	const { profileStorage } = useStorage();

	const [profile, setProfile] = useState<Profile | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const fetchProfile = useCallback(async () => {
		if (!user) {
			setProfile(null);
			setIsLoading(false);
			return;
		}

		try {
			setIsLoading(true);
			const profile = await profileStorage.getProfile(user.id);
			setProfile(profile);
			setError(null);
		} catch (err) {
			setError(err as Error);
		} finally {
			setIsLoading(false);
		}
	}, [user, profileStorage]);

	useEffect(() => {
		void fetchProfile();
	}, [fetchProfile]);

	const updateAvatar = async (avatarUrl: string) => {
		if (!user) throw new Error('Not authenticated');
		const updated = await profileActions.updateProfileAvatar(
			profileStorage,
			user.id,
			avatarUrl,
		);
		setProfile(updated);
	};

	return {
		profile,
		isLoading,
		error,
		updateAvatar,
		refetch: fetchProfile,
	};
};
