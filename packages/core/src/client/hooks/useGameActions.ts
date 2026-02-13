'use client';

import { useCallback, useState } from 'react';
import type { Action, GameEngine, GameState } from '../../engine/types';
import * as gameActions from '../../server/actions/game-actions';
import { useAuth, useStorage } from '../context';

export interface UseGameActionsReturn<
	TActionType extends string = string,
	TActionPayload extends object = object,
> {
	applyAction: (
		action: Omit<Action<TActionType, TActionPayload>, 'playerId' | 'timestamp'>,
	) => Promise<void>;
	isApplying: boolean;
	error: Error | null;
}

export const useGameActions = <
	TConfig extends object = object,
	TPublicState extends object = object,
	TPrivateState extends object = object,
	TActionType extends string = string,
	TActionPayload extends object = object,
	TPhase extends string = string,
	TPhaseData extends object = object,
>(
	gameId: string,
	gameImplementation: GameEngine<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TActionPayload,
		TPhase,
		TPhaseData
	>,
	currentState: GameState<
		TConfig,
		TPublicState,
		TPrivateState,
		TPhase,
		TPhaseData
	> | null,
	onOptimisticUpdate: (
		state: GameState<TConfig, TPublicState, TPrivateState, TPhase, TPhaseData>,
	) => void,
): UseGameActionsReturn<TActionType, TActionPayload> => {
	const { user } = useAuth();
	const { gameStorage, profileStorage, realtimeStorage } = useStorage();

	const [isApplying, setIsApplying] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const applyAction = useCallback(
		async (
			action: Omit<
				Action<TActionType, TActionPayload>,
				'playerId' | 'timestamp'
			>,
		) => {
			if (!user) throw new Error('Not authenticated');
			if (!currentState) throw new Error('No game state');

			const fullAction: Action<TActionType, TActionPayload> = {
				...action,
				playerId: user.id,
				timestamp: Date.now(),
			};

			const previousState = currentState;

			try {
				setIsApplying(true);
				setError(null);

				// 1. Validate
				if (!gameImplementation.validateAction(currentState, fullAction)) {
					throw new Error('Invalid action');
				}

				// 2. Apply optimistically
				const result = gameImplementation.applyAction(currentState, fullAction);
				if (!result.success || !result.newState) {
					throw new Error(result.error || 'Failed to apply action');
				}

				// 3. Update UI immediately
				onOptimisticUpdate(result.newState);

				// 4. Send to server
				await gameActions.applyGameAction(
					gameStorage,
					profileStorage,
					realtimeStorage,
					gameImplementation,
					gameId,
					fullAction,
				);

				// Server validates & broadcasts
				// Realtime subscription will overwrite with canonical state
			} catch (err) {
				onOptimisticUpdate(previousState); // Rollback
				setError(err as Error);
				throw err;
			} finally {
				setIsApplying(false);
			}
		},
		[
			user,
			gameId,
			currentState,
			gameImplementation,
			gameStorage,
			profileStorage,
			realtimeStorage,
			onOptimisticUpdate,
		],
	);

	return {
		applyAction,
		isApplying,
		error,
	};
};
