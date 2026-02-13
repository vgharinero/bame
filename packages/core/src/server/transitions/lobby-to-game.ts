import type { GameEngine } from '../../engine/types';
import type {
	IGameStorage,
	ILobbyStorage,
	IRealtimeStorage,
} from '../../storage';

export async function transitionLobbyToGame<
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
	gameImplementation: GameEngine<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TActionPayload,
		TPhase,
		TPhaseData
	>,
	lobbyId: string,
): Promise<string> {
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
	const initialState = gameImplementation.initialize(
		lobby.gameConfig,
		playerIds,
		seed,
	);

	// Call RPC (this will be implemented in Supabase storage)
	await gameStorage.transitionLobbyToGame?.(
		lobbyId,
		gameId,
		initialState,
		lobby.gameConfig,
		seed,
	);

	// 7. Broadcast events
	await realtimeStorage.broadcastLobbyEvent(lobbyId, {
		type: 'lobby:started',
		gameId: lobbyId,
	});

	await realtimeStorage.broadcastGameEvent(lobbyId, {
		type: 'game:state_updated',
		state: { ...initialState, gameId: lobbyId }
	});

	return lobbyId;
}
