import type { Action, Engine, Game } from '../domain';
import type { Payload, PayloadMap } from '../primitives';
import type {
	GameStorageAdapter,
	LobbyStorageAdapter,
	RealtimeAdapter,
} from '../storage';

export const transitionLobbyToGame = async <
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
>(
	lobbyStorage: LobbyStorageAdapter,
	gameStorage: GameStorageAdapter,
	realtime: RealtimeAdapter,
	engine: Engine<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
	lobbyId: string,
	hostId: string,
) => {
	const lobby = await lobbyStorage.getLobby<TConfig>(lobbyId);
	if (!lobby) {
		throw new Error('Lobby not found');
	}
	if (lobby.hostId !== hostId) {
		throw new Error('Only host can start game');
	}
	if (lobby.status !== 'ready') {
		throw new Error('Lobby is not ready');
	}

	lobby.status = 'starting';
	await lobbyStorage.updateLobby(lobby);

	const seed = `${lobbyId}_${Date.now()}_${Math.random()}`;

	const playerIds = lobby.members.map((m) => m.id.userId);
	const {
		state: publicState,
		playerStates: initialPrivateStates,
		initialTurn,
	} = engine.initialize(lobby.gameConfig, playerIds, seed);

	const game = await gameStorage.createGameFromLobby<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>(lobby, initialTurn, publicState, initialPrivateStates, seed);

	await realtime.broadcastLobbyEvent(lobbyId, {
		type: 'lobby:transitioned',
		version: lobby.version,
		payload: { gameId: lobbyId },
	});

	await realtime.broadcastGameEvent(game.id, {
		type: 'game:updated',
		version: game.version,
		payload: { game },
	});

	return game.id;
};

export const handleGetGame = async <
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
>(
	gameStorage: GameStorageAdapter,
	engine: Engine<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
	gameId: string,
	userId: string,
): Promise<
	Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>
> => {
	const game = await gameStorage.getGame<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>(gameId);

	if (!game) {
		throw new Error('Game not found');
	}

	const isPlayer = game.players.some((p) => p.id.userId === userId);
	if (!isPlayer) {
		throw new Error('You do not have permission to view this game');
	}

	game.players = game.players.map((p) => {
		if (p.id.userId !== userId) {
			return {
				...p,
				state: engine.getSimplifiedPrivateState(p.state) as TPrivateState,
			};
		}
		return p;
	});

	return game;
};

export const handleApplyAction = async <
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
>(
	gameStorage: GameStorageAdapter,
	realtime: RealtimeAdapter,
	engine: Engine<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
	gameId: string,
	action: Action<TActionPayloadMap, TPhasePayloadMap>,
): Promise<
	Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>
> => {
	const game = await gameStorage.getGame<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>(gameId);

	if (!game) {
		throw new Error('Game not found');
	}
	if (game.status !== 'active') {
		// allow 'waiting' because the first few actions might happen while players are still syncing
		if (game.status !== 'waiting') {
			throw new Error('Game is not active or waiting');
		}
	}

	const validateResult = engine.validateAction(game, action);
	if (!validateResult.isValid) {
		throw new Error(`Invalid action: ${validateResult.reason}`);
	}

	const applyResult = engine.applyAction(game, action);
	if (!applyResult.success) {
		throw new Error(`Action failed: ${applyResult.error}`);
	}

	const newGame = applyResult.newGame;
	const checkEndResult = engine.checkGameEnd(newGame);

	if (checkEndResult.isFinished) {
		newGame.status = 'finished';
		newGame.winner = checkEndResult.winner;
		newGame.finishedAt = Date.now();

		// Record the action and update the game
		await gameStorage.applyAction(newGame, action);

		// Record stats atomically
		const playerResults = Object.fromEntries(
			newGame.players.map((p) => [
				p.id.userId,
				p.id.userId === checkEndResult.winner,
			]),
		);
		const isDraw = checkEndResult.isDraw ?? false;

		await gameStorage.endGame(newGame, playerResults, isDraw);

		for (const player of newGame.players) {
			await realtime.broadcastProfileEvent(player.id.userId, {
				type: 'profile:new_stats',
				version: player.version,
				// TODO
				payload: { statsDelta: {} },
			});
		}

		await realtime.broadcastGameEvent(game.id, {
			type: 'game:finished',
			version: newGame.version,
			payload: {
				winner: checkEndResult.winner,
				isDraw,
			},
		});

		return newGame;
	}

	// Just a normal action application
	await gameStorage.applyAction(newGame, action);

	// Broadcast personalized game states
	for (const player of newGame.players) {
		const personalizedGame = {
			...newGame,
			players: newGame.players.map((p) => {
				if (p.id.userId !== player.id.userId) {
					return {
						...p,
						privateState: engine.getSimplifiedPrivateState(
							p.privateState,
						) as TPrivateState,
					};
				}
				return p;
			}),
		};

		await realtime.broadcastGamePlayerEvent(gameId, player.id.userId, {
			type: 'game:updated',
			version: personalizedGame.version,
			payload: { game: personalizedGame },
		});
	}

	await realtime.broadcastGameEvent(gameId, {
		type: 'game:action_applied',
		version: newGame.version,
		payload: { action },
	});

	return newGame;
};
