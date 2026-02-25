// import type { Action, Engine, Game } from '../../engine/domain';
// import type { PayloadMap } from '../../engine/primitives';
// import type {
// 	IGameStorage,
// 	IProfileStorage,
// 	IRealtimeStorage,
// } from '../../storage';

// export const handleApplyAction = async <
// 	TConfig extends object,
// 	TPublicState extends object,
// 	TPrivateState extends object,
// 	TActionPayloadMap extends PayloadMap,
// 	TPhasePayloadMap extends PayloadMap,
// >(
// 	gameStorage: IGameStorage,
// 	profileStorage: IProfileStorage,
// 	realtimeStorage: IRealtimeStorage,
// 	engine: Engine<
// 		TConfig,
// 		TPublicState,
// 		TPrivateState,
// 		TActionPayloadMap,
// 		TPhasePayloadMap
// 	>,
// 	gameId: string,
// 	action: Action<TActionPayloadMap, TPhasePayloadMap>,
// ): Promise<
// 	Game<
// 		TConfig,
// 		TPublicState,
// 		TPrivateState,
// 		TActionPayloadMap,
// 		TPhasePayloadMap
// 	>
// > => {
// 	const game = await gameStorage.getGame<
// 		TConfig,
// 		TPublicState,
// 		TPrivateState,
// 		TActionPayloadMap,
// 		TPhasePayloadMap
// 	>(gameId);
// 	if (!game) {
// 		throw new Error('GAME_NOT_FOUND');
// 	}
// 	if (game.status !== 'active') {
// 		throw new Error('GAME_NOT_ACTIVE');
// 	}

// 	// Server-side validation
// 	const validateActionResult = engine.validateAction(game, action);
// 	if (!validateActionResult.isValid) {
// 		throw new Error('ACTION_INVALID');
// 	}

// 	// Apply action
// 	const applyActionResult = engine.applyAction(game, action);
// 	if (!applyActionResult.success) {
// 		throw new Error('ACTION_FAILED');
// 	}

// 	// Check if game ended
// 	const checkGameEndResult = engine.checkGameEnd(applyActionResult.newGame);
// 	if (checkGameEndResult.isFinished) {
// 		applyActionResult.newGame.status = 'finished';
// 		applyActionResult.newGame.winner = checkGameEndResult.winner;
// 		applyActionResult.newGame.finishedAt = Date.now();
// 	}

// 	// Call RPC to atomically update state + save action
// 	await gameStorage.applyGameActionAtomically(
// 		gameId,
// 		applyActionResult.newGame,
// 		action,
// 	);

// 	if (checkGameEndResult.isFinished) {
// 		// Update player stats
// 		const winners = checkGameEndResult.winner
// 			? [checkGameEndResult.winner]
// 			: [];
// 		const losers = game.players
// 			.filter((p) => !winners.includes(p.id.userId))
// 			.map((p) => p.id.userId);
// 		await profileStorage.handleGameEndedAtomically({
// 			winners,
// 			losers,
// 			isDraw: checkGameEndResult.isDraw,
// 		});

// 		// Broadcast game finished
// 		await realtimeStorage.broadcastGameEvent(game.id, {
// 			type: 'game:finished',
// 			version: game.version,
// 			payload: {
// 				winner: checkGameEndResult.winner,
// 				isDraw: checkGameEndResult.isDraw,
// 			},
// 		});

// 		// No need to broadcast state update or action applied since game is finished
// 		return applyActionResult.newGame;
// 	}

// 	// Broadcast state update
// 	await realtimeStorage.broadcastGameEvent(gameId, {
// 		type: 'game:state_updated',
// 		version: applyActionResult.newGame.version,
// 		payload: { game: applyActionResult.newGame },
// 	});

// 	// Broadcast action applied (for optimistic update confirmation)
// 	await realtimeStorage.broadcastGameEvent(gameId, {
// 		type: 'game:action_applied',
// 		version: applyActionResult.newGame.version,
// 		payload: { action },
// 	});

// 	return applyActionResult.newGame;
// };
