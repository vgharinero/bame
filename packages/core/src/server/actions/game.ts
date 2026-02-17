import type { Action, Engine, Game } from '../../engine/types';
import type {
	IGameStorage,
	IProfileStorage,
	IRealtimeStorage,
} from '../../storage';

export const applyGameAction = async <
	TConfig extends object,
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TActionPayload extends object,
	TPhase extends string,
	TPhaseData extends object,
>(
	gameStorage: IGameStorage,
	profileStorage: IProfileStorage,
	realtimeStorage: IRealtimeStorage,
	gameImplementation: Engine<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TActionPayload,
		TPhase,
		TPhaseData
	>,
	gameId: string,
	action: Action<TActionType, TActionPayload>,
): Promise<
	Game<TConfig, TPublicState, TPrivateState, TActionType, TPhase, TPhaseData>
> => {
	// Get current state
	const currentState = await gameStorage.getGame<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>(gameId);
	if (!currentState) throw new Error('Game not found');
	if (currentState.status !== 'active') throw new Error('Game is not active');

	// Server-side validation
	const isValid = gameImplementation.validateAction(currentState, action);
	if (!isValid) throw new Error('Invalid action');

	// Apply action
	const result = gameImplementation.applyAction(currentState, action);
	if (!result.success || !result.newState) {
		throw new Error(result.error || 'Failed to apply action');
	}

	// Check if game ended
	const gameEnd = gameImplementation.checkGameEnd(result.newState);
	if (gameEnd.isFinished) {
		result.newState.status = 'finished';
		result.newState.winner = gameEnd.winner;
		result.newState.finishedAt = Date.now();

		await endGame(
			gameStorage,
			profileStorage,
			realtimeStorage,
			gameId,
			gameEnd.winner,
			gameEnd.isDraw,
		);
	}

	// Call RPC to atomically update state + save action
	await gameStorage.applyGameActionAtomically(gameId, result.newState, action);

	// Broadcast state update
	await realtimeStorage.broadcastGameEvent(gameId, {
		type: 'game:state_updated',
		state: result.newState,
	});

	// Broadcast action applied (for optimistic update confirmation)
	await realtimeStorage.broadcastGameEvent(gameId, {
		type: 'game:action_applied',
		action,
	});

	return result.newState;
};

export const endGame = async (
	gameStorage: IGameStorage,
	profileStorage: IProfileStorage,
	realtimeStorage: IRealtimeStorage,
	gameId: string,
	winner?: string,
	isDraw?: boolean,
): Promise<void> => {
	const game = await gameStorage.getGame(gameId);
	if (!game) throw new Error('Game not found');

	// Update player stats
	const winners = winner ? [winner] : [];
	const losers = game.players
		.filter((p) => !winners.includes(p.id))
		.map((p) => p.id);

	await profileStorage.handleGameEndAtomically({
		winners,
		losers,
		isDraw,
	});

	// Broadcast game finished
	await realtimeStorage.broadcastGameEvent(gameId, {
		type: 'game:finished',
		winner,
		isDraw,
	});
};
