import type { Engine, Lobby, LobbyMember } from '../../engine/types';
import type {
	IGameStorage,
	ILobbyStorage,
	IRealtimeStorage,
} from '../../storage';
import { transitionLobbyToGame } from '../transitions/lobby-to-game';

export const createLobby = async <TConfig extends object>(
	storage: ILobbyStorage,
	realtime: IRealtimeStorage,
	hostId: string,
	config: TConfig,
	minPlayers: number,
	maxPlayers: number,
): Promise<Lobby<TConfig>> => {
	// Create lobby
	const lobby = await storage.createLobby(
		hostId,
		config,
		minPlayers,
		maxPlayers,
	);

	// Broadcast lobby created (for lobby lists)
	await realtime.broadcastLobbyEvent(lobby.id, {
		type: 'lobby:updated',
		payload: { lobby },
	});

	return lobby;
};

export const joinLobby = async (
	storage: ILobbyStorage,
	realtime: IRealtimeStorage,
	lobbyId: string,
	userId: string,
): Promise<LobbyMember> => {
	// Get lobby to check constraints
	const lobby = await storage.getLobby(lobbyId);
	if (!lobby) throw new Error('Lobby not found');
	if (lobby.status !== 'waiting')
		throw new Error('Lobby is not accepting players');
	if (lobby.members.length >= lobby.maxPlayers)
		throw new Error('Lobby is full');

	// Join lobby
	const member = await storage.joinPublicLobby(lobbyId, userId);

	// Update lobby status if ready
	const updatedLobby = await storage.getLobby(lobbyId);
	if (updatedLobby && updatedLobby.members.length === updatedLobby.maxPlayers) {
		await storage.updateLobbyStatus(lobbyId, 'ready');
	}

	// Broadcast member joined
	await realtime.broadcastLobbyEvent(lobbyId, {
		type: 'lobby:member_joined',
		member,
	});

	return member;
};

export const leaveLobby = async (
	storage: ILobbyStorage,
	realtime: IRealtimeStorage,
	lobbyId: string,
	userId: string,
): Promise<void> => {
	try {
		const lobby = await storage.getLobby(lobbyId);
		if (!lobby) throw new Error('Lobby not found');

		// If host leaves, delete lobby (cascade will remove all members)
		if (lobby.hostId === userId) {
			await storage.deleteLobby(lobbyId);
			return;
		}

		// Remove member
		await storage.leaveLobby(lobbyId, userId);

		// Broadcast member left
		await realtime.broadcastLobbyEvent(lobbyId, {
			type: 'lobby:member_left',
			userId,
		});
	} catch (error) {
		console.error('Error in leaveLobby action:', error);
		throw new Error(
			`Failed to leave lobby: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
};

export const startGame = async <
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
	hostId: string,
): Promise<string> => {
	const lobby = await lobbyStorage.getLobby(lobbyId);
	if (!lobby) throw new Error('Lobby not found');
	if (lobby.hostId !== hostId) throw new Error('Only host can start game');
	if (lobby.status !== 'ready') throw new Error('Lobby is not ready');

	// Update to starting status
	await lobbyStorage.updateLobbyStatus(lobbyId, 'starting');

	// Execute atomic transition
	const gameId = await transitionLobbyToGame(
		lobbyStorage,
		gameStorage,
		realtimeStorage,
		gameImplementation,
		lobbyId,
	);

	return gameId;
};
