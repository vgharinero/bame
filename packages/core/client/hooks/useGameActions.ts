import { produce } from 'immer';
import { useCallback, useState } from 'react';
import type { Action } from '../../engine/types/action';
import type { GameEngine } from '../../engine/types/game-engine';
import type { GameState } from '../../engine/types/game-state';
import { useAuth } from '../context/AuthProvider';
import { useStorage } from '../context/StorageProvider';

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

export function useGameActions<
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
): UseGameActionsReturn<TActionType, TActionPayload> {
	const { user } = useAuth();
	const { gameStorage } = useStorage();

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

			// Store original state for rollback
			const previousState = currentState;

			try {
				setIsApplying(true);
				setError(null);

				// 1. Client-side validation
				const isValid = gameImplementation.validateAction(
					currentState,
					fullAction,
				);
				if (!isValid) {
					throw new Error('Invalid action - failed client validation');
				}

				// 2. Apply action optimistically
				const result = gameImplementation.applyAction(currentState, fullAction);
				if (!result.success || !result.newState) {
					throw new Error(result.error || 'Action application failed');
				}

				// 3. Update UI immediately (optimistic)
				onOptimisticUpdate(result.newState);

				// 4. Send to server for validation and broadcast
				await gameStorage.saveAction?.(gameId, fullAction);

				// 5. Server will validate and broadcast canonical state
				// If server state differs, realtime subscription will overwrite
			} catch (err) {
				// 6. Rollback on error
				onOptimisticUpdate(previousState);
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
			onOptimisticUpdate,
		],
	);

	return {
		applyAction,
		isApplying,
		error,
	};
}
