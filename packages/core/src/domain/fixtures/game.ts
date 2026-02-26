import type { Game, GameStatus } from '../game';
import type {
	TestActionPayloadMap,
	TestConfig,
	TestPhasePayloadMap,
	TestPrivateState,
	TestPublicState,
} from './domain';
import { createMockPlayer } from './player';
import { createMockTurn } from './turn';

export const createMockGame = (
	overrides?: Partial<
		Game<
			TestConfig,
			TestPublicState,
			TestPrivateState,
			TestActionPayloadMap,
			TestPhasePayloadMap
		>
	>,
): Game<
	TestConfig,
	TestPublicState,
	TestPrivateState,
	TestActionPayloadMap,
	TestPhasePayloadMap
> => ({
	id: 'game-1',
	version: 1,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	status: 'active',
	config: { maxPlayers: 4 },
	seed: 'test-seed',
	state: { board: [] },
	players: [createMockPlayer('user-1'), createMockPlayer('user-2')],
	turn: createMockTurn(),
	...overrides,
});

export const createMockGameWithStatus = (
	status: GameStatus,
	overrides?: Partial<
		Game<
			TestConfig,
			TestPublicState,
			TestPrivateState,
			TestActionPayloadMap,
			TestPhasePayloadMap
		>
	>,
): Game<
	TestConfig,
	TestPublicState,
	TestPrivateState,
	TestActionPayloadMap,
	TestPhasePayloadMap
> => createMockGame({ status, ...overrides });
