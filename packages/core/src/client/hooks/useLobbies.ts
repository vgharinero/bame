'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Lobby } from '../../engine/types';
import { useAuth, useStorage } from '../context';

export interface UseLobbiesReturn<TConfig extends object = object> {
	myLobbies: Lobby<TConfig>[];
	availableLobbies: Lobby<TConfig>[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

export const useLobbies = <TConfig extends object = object>(): UseLobbiesReturn<TConfig> => {
	const { user } = useAuth();
	const { lobbyStorage, realtimeStorage } = useStorage();

	const [myLobbies, setMyLobbies] = useState<Lobby<TConfig>[]>([]);
	const [availableLobbies, setAvailableLobbies] = useState<Lobby<TConfig>[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const fetchLobbies = useCallback(async () => {
		if (!user) return;

		try {
			setIsLoading(true);

			const [myLobbiesData, availableLobbiesData] = await Promise.all([
				lobbyStorage.getUserLobbies<TConfig>(user.id, {
					status: ['waiting', 'ready', 'starting'],
				}),
				lobbyStorage.listLobbies<TConfig>({
					status: 'waiting',
					hasSpace: true,
				}),
			]);

			const myLobbyIds = new Set(myLobbiesData.map((l) => l.id));
			const filteredAvailable = availableLobbiesData.filter(
				(l) => !myLobbyIds.has(l.id),
			);

			setMyLobbies(myLobbiesData);
			setAvailableLobbies(filteredAvailable);
			setError(null);
		} catch (err) {
			setError(err as Error);
		} finally {
			setIsLoading(false);
		}
	}, [user, lobbyStorage]);

	useEffect(() => {
		fetchLobbies();
	}, [fetchLobbies]);

	useEffect(() => {
		if (!user) return;

		const subscription = realtimeStorage.subscribeLobbies(() => {
			fetchLobbies();
		});

		return () => subscription.unsubscribe();
	}, [user, realtimeStorage, fetchLobbies]);

	return {
		myLobbies,
		availableLobbies,
		isLoading,
		error,
		refetch: fetchLobbies,
	};
};