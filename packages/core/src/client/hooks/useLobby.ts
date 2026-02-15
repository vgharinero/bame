'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GameEngine, Lobby } from '../../engine/types';
import { lobbyActions } from '../../server/actions';
import type { LobbyRealtimeEvent } from '../../storage';
import { useAuth, useStorage } from '../context';

export interface UseLobbyReturn<TConfig extends object = object> {
	lobby: Lobby<TConfig> | null;
	isLoading: boolean;
	error: Error | null;
	isHost: boolean;
	isMember: boolean;

	createLobby: (
		config: TConfig,
		minPlayers: number,
		maxPlayers: number,
	) => Promise<Lobby<TConfig>>;
	joinLobby: (lobbyId: string) => Promise<void>;
	leaveLobby: () => Promise<void>;
	startGame: <
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TActionPayload extends object,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameImplementation: GameEngine<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TActionPayload,
			TPhase,
			TPhaseData
		>,
	) => Promise<string>; // Returns gameId

	refetch: () => Promise<void>;
}

export const useLobby = <TConfig extends object = object>(
	lobbyId?: string,
): UseLobbyReturn<TConfig> => {
	const { user } = useAuth();
	const { lobbyStorage, gameStorage, realtimeStorage } = useStorage();

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
	const createLobby = async (
		config: TConfig,
		minPlayers: number,
		maxPlayers: number,
	) => {
		if (!user) throw new Error('Not authenticated');
		const newLobby = await lobbyActions.createLobby(
			lobbyStorage,
			realtimeStorage,
			user.id,
			config,
			minPlayers,
			maxPlayers,
		);
		setLobby(newLobby);
		return newLobby;
	};

	const joinLobby = async (id: string) => {
		if (!user) throw new Error('Not authenticated');
		await lobbyActions.joinLobby(lobbyStorage, realtimeStorage, id, user.id);
		// await fetchLobby(); // TODO: check if realtime handles it or not
	};

	const leaveLobby = async () => {
		if (!user || !lobbyId) throw new Error('Invalid state');
		await lobbyActions.leaveLobby(
			lobbyStorage,
			realtimeStorage,
			lobbyId,
			user.id,
		);
		setLobby(null);
	};

	const startGame = async <
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TActionPayload extends object,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameImplementation: GameEngine<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TActionPayload,
			TPhase,
			TPhaseData
		>,
	) => {
		if (!user || !lobbyId) throw new Error('Invalid state');
		const gameId = await lobbyActions.startGame(
			lobbyStorage,
			gameStorage,
			realtimeStorage,
			gameImplementation,
			lobbyId,
			user.id,
		);
		return gameId;
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
};
