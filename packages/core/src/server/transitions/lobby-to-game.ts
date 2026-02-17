import type { Engine } from '../../engine/types';
import type {
	IGameStorage,
	ILobbyStorage,
	IRealtimeStorage,
} from '../../storage';

export const transitionLobbyToGame = async <
	TConfig extends object,
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TActionPayload extends object,
	TPhase extends string,
	TPhaseData extends object,
>(
	lobbyStorage: ILobbyStorage,
	gameStorage: IGameStorage,
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
	lobbyId: string,
): Promise<string> => {
	// 1. Get lobby and validate
	const lobby = await lobbyStorage.getLobby<TConfig>(lobbyId);
	if (!lobby) throw new Error('Lobby not found');
	if (lobby.status !== 'starting')
		throw new Error('Lobby is not in starting state');
	if (lobby.members.length < gameImplementation.minPlayers) {
		throw new Error(`Need at least ${gameImplementation.minPlayers} players`);
	}

	// 2. Generate seed for deterministic RNG
	const seed = `${lobbyId}_${Date.now()}_${Math.random()}`;

	// 3. Initialize game state
	const playerIds = lobby.members.map((m) => m.id);
	const { publicState, initialPrivateStates, initialTurn } =
		gameImplementation.initialize(lobby.gameConfig, playerIds, seed);

	// Call RPC (this will be implemented in Supabase storage)
	await gameStorage.transitionLobbyToGameAtomically(
		lobbyId,
		publicState,
		initialTurn.currentPlayerId,
		initialTurn.phase,
		initialTurn,
		playerIds,
		initialPrivateStates,
		lobby.gameConfig,
		seed,
	);

	// 7. Broadcast events
	await realtimeStorage.broadcastLobbyEvent(lobbyId, {
		type: 'lobby:transitioned',
		gameId: lobbyId,
	});

	const game = await gameStorage.getGame(lobbyId);
	if (!game) throw new Error('Game not found');

	await realtimeStorage.broadcastGameEvent(game.id, {
		type: 'game:state_updated',
		state: game,
	});

	return lobbyId;
};
