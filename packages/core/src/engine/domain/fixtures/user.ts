/**
 * User fixture for testing.
 */

import type { User } from '../user';

/**
 * Creates a mock user with sensible defaults.
 * @param userId - The user ID
 * @param overrides - Partial user object to override defaults
 * @returns A mock User object
 */
export const createMockUser = (
	userId: string,
	overrides?: Partial<User>,
): User => ({
	id: userId,
	displayName: `User ${userId}`,
	avatarUrl: null,
	...overrides,
});
