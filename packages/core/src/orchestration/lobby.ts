import {
	getRandomCode,
	isPublicLobby,
	type Lobby,
	type LobbyMemberStatus,
	type LobbyStatus,
} from '../domain';
import type { Payload } from '../primitives';
import type { LobbyStorageAdapter, RealtimeAdapter } from '../storage';

export const handleGetLobby = async <TConfig extends Payload>(
	lobbyStorage: LobbyStorageAdapter,
	lobbyId: string,
	userId: string,
): Promise<Lobby<TConfig>> => {
	const lobby = await lobbyStorage.getLobby<TConfig>(lobbyId);
	if (!lobby) {
		throw new Error('Lobby not found');
	}

	if (!isPublicLobby(lobby)) {
		const isMember = lobby.members.some((m) => m.id.userId === userId);
		if (!isMember) {
			throw new Error('You do not have permission to view this lobby');
		}
	}

	return lobby;
};

export const handleNewLobby = async <TConfig extends Payload>(
	lobbyStorage: LobbyStorageAdapter,
	realtime: RealtimeAdapter,
	gameConfig: TConfig,
	hostId: string,
	minPlayers: number,
	maxPlayers: number,
	isPrivate = false,
): Promise<Lobby<TConfig>> => {
	if (minPlayers < 1) {
		throw new Error('minPlayers must be at least 1');
	}
	if (maxPlayers < minPlayers) {
		throw new Error('maxPlayers must be at least minPlayers');
	}

	const code = isPrivate ? null : getRandomCode();
	const lobbyData = {
		code,
		config: gameConfig,
		hostId,
		minPlayers,
		maxPlayers,
		status: 'waiting' satisfies LobbyStatus,
	};

	const lobby = await lobbyStorage.createLobby<TConfig>(lobbyData, 'in_lobby');

	if (!isPrivate) {
		await realtime.broadcastLobbiesEvent({
			type: 'lobbies:available_public_lobby',
			version: lobby.version,
			payload: {
				lobby: {
					id: lobby.id,
					hostId: lobby.hostId,
					minPlayers: lobby.minPlayers,
					maxPlayers: lobby.maxPlayers,
					status: lobby.status,
				},
			},
		});
	}

	return lobby;
};

export const handleJoinLobbyById = async <TConfig extends Payload>(
	lobbyStorage: LobbyStorageAdapter,
	realtime: RealtimeAdapter,
	lobbyId: string,
	userId: string,
): Promise<Lobby<TConfig>> => {
	const lobby = await lobbyStorage.getLobby<TConfig>(lobbyId);

	if (!lobby) {
		throw new Error('Lobby not found');
	}
	if (lobby.status !== 'waiting') {
		throw new Error('Lobby is not accepting players');
	}
	if (lobby.members.some((m) => m.id.userId === userId)) {
		throw new Error('User is already in the lobby');
	}
	if (lobby.members.length >= lobby.maxPlayers) {
		throw new Error('Lobby is full');
	}

	const lobbyMemberData = {
		lobbyId,
		userId,
		status: 'in_lobby' satisfies LobbyMemberStatus,
	};

	const member = await lobbyStorage.createLobbyMember(lobbyMemberData);
	lobby.members.push(member);

	await realtime.broadcastLobbyEvent(lobbyId, {
		type: 'lobby:member_joined',
		version: member.version,
		payload: { member },
	});

	return lobby;
};

export const handleJoinLobbyByCode = async <TConfig extends Payload>(
	lobbyStorage: LobbyStorageAdapter,
	realtime: RealtimeAdapter,
	code: string,
	userId: string,
): Promise<Lobby<TConfig>> => {
	const lobby = await lobbyStorage.getLobbyByCode<TConfig>(code);

	if (!lobby) {
		throw new Error('Lobby not found');
	}

	return handleJoinLobbyById(lobbyStorage, realtime, lobby.id, userId);
};

export const handleMemberIsReady = async <TConfig extends Payload>(
	lobbyStorage: LobbyStorageAdapter,
	realtime: RealtimeAdapter,
	lobbyId: string,
	userId: string,
): Promise<Lobby<TConfig>> => {
	const lobby = await lobbyStorage.getLobby<TConfig>(lobbyId);
	if (!lobby) {
		throw new Error('Lobby not found');
	}

	const member = lobby.members.find((m) => m.id.userId === userId);
	if (!member) {
		throw new Error('Member not found');
	}

	member.status = 'ready';
	await lobbyStorage.updateLobbyMember(member);

	await realtime.broadcastLobbyEvent(lobbyId, {
		type: 'lobby:member_ready',
		version: member.version,
		payload: { userId },
	});

	if (lobby.members.every((m) => m.status === 'ready')) {
		lobby.status = 'ready';
		await lobbyStorage.updateLobby(lobby);

		await realtime.broadcastLobbyEvent(lobbyId, {
			type: 'lobby:ready_to_start',
			version: lobby.version,
		});
	}

	return lobby;
};

export const handleMemberIsNotReady = async <TConfig extends Payload>(
	lobbyStorage: LobbyStorageAdapter,
	realtime: RealtimeAdapter,
	lobbyId: string,
	userId: string,
): Promise<Lobby<TConfig>> => {
	const lobby = await lobbyStorage.getLobby<TConfig>(lobbyId);
	if (!lobby) {
		throw new Error('Lobby not found');
	}

	const member = lobby.members.find((m) => m.id.userId === userId);
	if (!member) {
		throw new Error('Member not found');
	}

	member.status = 'in_lobby';
	await lobbyStorage.updateLobbyMember(member);

	await realtime.broadcastLobbyEvent(lobbyId, {
		type: 'lobby:member_not_ready',
		version: member.version,
		payload: { userId },
	});

	if (lobby.status === 'ready') {
		lobby.status = 'waiting';
		await lobbyStorage.updateLobby(lobby);

		await realtime.broadcastLobbyEvent(lobbyId, {
			type: 'lobby:not_ready_to_start',
			version: lobby.version,
		});
	}

	return lobby;
};

export const handleLeaveLobby = async <TConfig extends Payload>(
	lobbyStorage: LobbyStorageAdapter,
	realtime: RealtimeAdapter,
	lobbyId: string,
	userId: string,
): Promise<Lobby<TConfig> | null> => {
	const lobby = await lobbyStorage.getLobby<TConfig>(lobbyId);
	if (!lobby) {
		throw new Error('Lobby not found');
	}

	if (lobby.hostId === userId) {
		await lobbyStorage.deleteLobby(lobbyId);

		if (isPublicLobby(lobby)) {
			await realtime.broadcastLobbiesEvent({
				type: 'lobbies:removed_public_lobby',
				version: lobby.version,
				payload: {
					lobbyId: lobby.id,
				},
			});
		}

		await realtime.broadcastLobbyEvent(lobbyId, {
			type: 'lobby:deleted',
			version: lobby.version,
			payload: {
				lobbyId: lobby.id,
			},
		});

		return null;
	}

	await lobbyStorage.deleteLobbyMember(lobbyId, userId);

	lobby.members = lobby.members.filter((m) => m.id.userId !== userId);
	await realtime.broadcastLobbyEvent(lobbyId, {
		type: 'lobby:member_left',
		version: lobby.version,
		payload: { userId },
	});

	return lobby;
};
