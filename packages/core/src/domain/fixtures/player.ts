import type { Player, PlayerStatus } from '../player';
import type { TestPrivateState } from './domain';

export const createMockPlayer = (
	userId: string,
	status: PlayerStatus = 'active',
	overrides?: Partial<Player<TestPrivateState>>,
): Player<TestPrivateState> => ({
	id: { gameId: 'game-1', userId },
	version: 1,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	displayName: `Player ${userId}`,
	avatarUrl: null,
	status,
	privateState: { hand: [] },
	...overrides,
});
