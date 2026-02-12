import { useCallback, useEffect, useState } from 'react';
import type { GameState } from '../../engine/types/game-state';
import type { Player } from '../../engine/types/player';
import type { GameRealtimeEvent } from '../../storage';
import { useAuth } from '../context/AuthProvider';
import { useStorage } from '../context/StorageProvider';

export interface UseGameReturn<
	TConfig extends object = object,
	TPublicState extends object = object,
	TPrivateState extends object = object,
	TPhase extends string = string,
	TPhaseData extends object = object,
> {
	game: GameState<
		TConfig,
		TPublicState,
		TPrivateState,
		TPhase,
		TPhaseData
	> | null;
	myPlayer: Player<TPrivateState> | null;
	isLoading: boolean;
	error: Error | null;
	isMyTurn: boolean;

	// For optimistic updates
	setOptimisticState: (
		state: GameState<TConfig, TPublicState, TPrivateState, TPhase, TPhaseData>,
	) => void;

	refetch: () => Promise<void>;
}

export function useGame<
	TConfig extends object = object,
	TPublicState extends object = object,
	TPrivateState extends object = object,
	TPhase extends string = string,
	TPhaseData extends object = object,
>(
	gameId?: string,
): UseGameReturn<TConfig, TPublicState, TPrivateState, TPhase, TPhaseData> {
	const { user } = useAuth();
	const { gameStorage, realtimeStorage } = useStorage();

	// Canonical state from server
	const [canonicalGame, setCanonicalGame] = useState<GameState<
		TConfig,
		TPublicState,
		TPrivateState,
		TPhase,
		TPhaseData
	> | null>(null);

	// Optimistic state (overrides canonical while pending)
	const [optimisticGame, setOptimisticGame] = useState<GameState<
		TConfig,
		TPublicState,
		TPrivateState,
		TPhase,
		TPhaseData
	> | null>(null);

	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Display optimistic if available, otherwise canonical
	const game = optimisticGame ?? canonicalGame;

	const fetchGame = useCallback(async () => {
		if (!gameId) return;

		try {
			setIsLoading(true);
			const data = await gameStorage.getGame<
				TConfig,
				TPublicState,
				TPrivateState,
				TPhase,
				TPhaseData
			>(gameId);
			setCanonicalGame(data);
			setOptimisticGame(null); // Clear optimistic on refetch
			setError(null);
		} catch (err) {
			setError(err as Error);
		} finally {
			setIsLoading(false);
		}
	}, [gameId, gameStorage]);

	useEffect(() => {
		fetchGame();
	}, [fetchGame]);

	// Subscribe to realtime game updates
	useEffect(() => {
		if (!gameId) return;

		const subscription = realtimeStorage.subscribeGame(
			gameId,
			(event: GameRealtimeEvent) => {
				if (event.type === 'game:state_updated') {
					// Server state arrives - this is the canonical truth
					setCanonicalGame(
						event.state as GameState<
							TConfig,
							TPublicState,
							TPrivateState,
							TPhase,
							TPhaseData
						>,
					);
					setOptimisticGame(null); // Clear optimistic, server wins
				} else {
					fetchGame();
				}
			},
		);

		return () => subscription.unsubscribe();
	}, [gameId, realtimeStorage, fetchGame]);

	const myPlayer = game?.players.find((p) => p.id === user?.id) ?? null;
	const isMyTurn = game?.turn.currentPlayerId === user?.id;

	return {
		game,
		myPlayer,
		isLoading,
		error,
		isMyTurn,
		setOptimisticState: setOptimisticGame,
		refetch: fetchGame,
	};
}
