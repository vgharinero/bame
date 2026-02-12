import { useCallback, useEffect, useState } from 'react';
import type { Lobby } from '../../engine/types/lobby';
import type { LobbyRealtimeEvent } from '../../storage';
import { useAuth } from '../context/AuthProvider';
import { useStorage } from '../context/StorageProvider';

export interface UseLobbyReturn<TConfig extends object = object> {
	lobby: Lobby<TConfig> | null;
	isLoading: boolean;
	error: Error | null;
	isHost: boolean;
	isMember: boolean;

	createLobby: (config: TConfig, maxPlayers: number) => Promise<Lobby<TConfig>>;
	joinLobby: (lobbyId: string) => Promise<void>;
	leaveLobby: () => Promise<void>;
	startGame: () => Promise<string>; // Returns gameId

	refetch: () => Promise<void>;
}

export function useLobby<TConfig extends object = object>(
	lobbyId?: string,
): UseLobbyReturn<TConfig> {
	const { user } = useAuth();
	const { lobbyStorage, realtimeStorage } = useStorage();

	const [lobby, setLobby] = useState<Lobby<TConfig> | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const fetchLobby = useCallback(async () => {
		if (!lobbyId) return;

		try {
			setIsLoading(true);
			const data = await lobbyStorage.getLobby<TConfig>(lobbyId);
			setLobby(data);
			setError(null);
		} catch (err) {
			setError(err as Error);
		} finally {
			setIsLoading(false);
		}
	}, [lobbyId, lobbyStorage]);

	useEffect(() => {
		fetchLobby();
	}, [fetchLobby]);

	// Subscribe to realtime updates
	useEffect(() => {
		if (!lobbyId) return;

		const subscription = realtimeStorage.subscribeLobby(
			lobbyId,
			(event: LobbyRealtimeEvent) => {
				if (event.type === 'lobby:updated') {
					setLobby(event.lobby as Lobby<TConfig>);
				} else if (
					event.type === 'lobby:member_joined' ||
					event.type === 'lobby:member_left'
				) {
					fetchLobby(); // Refetch to update members
				}
			},
		);

		return () => subscription.unsubscribe();
	}, [lobbyId, realtimeStorage, fetchLobby]);

	// Actions
	const createLobby = async (config: TConfig, maxPlayers: number) => {
		if (!user) throw new Error('Not authenticated');
		const newLobby = await lobbyStorage.createLobby(
			user.id,
			config,
			maxPlayers,
		);
		setLobby(newLobby);
		return newLobby;
	};

	const joinLobby = async (id: string) => {
		if (!user) throw new Error('Not authenticated');
		await lobbyStorage.joinLobby(id, user.id);
		await fetchLobby();
	};

	const leaveLobby = async () => {
		if (!user || !lobbyId) throw new Error('Invalid state');
		await lobbyStorage.leaveLobby(lobbyId, user.id);
		setLobby(null);
	};

	const startGame = async () => {
		// This will be implemented in server actions
		// For now, placeholder
		throw new Error('startGame not implemented - handled by server action');
	};

	const isHost = lobby?.hostId === user?.id;
	const isMember = lobby?.members.some((m) => m.id === user?.id) ?? false;

	return {
		lobby,
		isLoading,
		error,
		isHost,
		isMember,
		createLobby,
		joinLobby,
		leaveLobby,
		startGame,
		refetch: fetchLobby,
	};
}
