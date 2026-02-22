import type { LobbyMember, LobbyMemberStatus } from '../lobby-member';

export const createMockLobbyMember = (
	userId: string,
	status: LobbyMemberStatus = 'in_lobby',
	overrides?: Partial<LobbyMember>,
): LobbyMember => ({
	id: { lobbyId: 'lobby-1', userId },
	version: 1,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	displayName: `Player ${userId}`,
	avatarUrl: null,
	status,
	...overrides,
});
