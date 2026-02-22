import type { Lobby, LobbyStatus } from '../lobby';
import type { TestConfig } from './domain';
import { createMockLobbyMember } from './lobby-member';

export const createMockLobby = (
	overrides?: Partial<Lobby<TestConfig>>,
): Lobby<TestConfig> => ({
	id: 'lobby-1',
	version: 1,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	code: 'ABCDEF',
	hostId: 'user-1',
	status: 'waiting',
	members: [createMockLobbyMember('user-1')],
	minPlayers: 2,
	maxPlayers: 4,
	gameConfig: { maxPlayers: 4 },
	...overrides,
});

/**
 * Creates a mock lobby with a specific status.
 * @param status - The lobby status
 * @param overrides - Additional overrides
 * @returns A mock Lobby object with the specified status
 */
export const createMockLobbyWithStatus = (
	status: LobbyStatus,
	overrides?: Partial<Lobby<TestConfig>>,
): Lobby<TestConfig> => createMockLobby({ status, ...overrides });
