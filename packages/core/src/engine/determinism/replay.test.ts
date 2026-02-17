import { describe, expect, it } from 'vitest';
import type { Action, ActionResult } from '../types/action';
import type { Engine } from '../types/engine';
import type { Game } from '../types/game';
import { replayGame, validateReplay, type ReplayConfig } from './replay';

// Mock game types for testing
interface TestConfig {
	startingValue: number;
}

interface TestPublicState {
	counter: number;
	history: string[];
}

interface TestPrivateState {
	secret: number;
}

type TestActionType = 'increment' | 'decrement' | 'reset';

interface TestActionPayload {
	amount?: number;
}

type TestPhase = 'playing' | 'finished';

interface TestPhaseData {
	round: number;
}

type TestGame = Game<
	TestConfig,
	TestPublicState,
	TestPrivateState,
	TestActionType,
	TestPhase,
	TestPhaseData
>;

type TestAction = Action<TestActionType, TestActionPayload>;

// Mock engine implementation
const createMockEngine = (
	shouldValidate: (state: TestGame, action: TestAction) => boolean = () => true,
	shouldSucceed: (state: TestGame, action: TestAction) => boolean = () => true,
): Engine<
	TestConfig,
	TestPublicState,
	TestPrivateState,
	TestActionType,
	TestActionPayload,
	TestPhase,
	TestPhaseData
> => ({
	name: 'test-engine',
	minPlayers: 2,
	maxPlayers: 4,

	initialize: (config, playerIds, seed) => ({
		publicState: { counter: config.startingValue, history: [] },
		initialPrivateStates: playerIds.map((_, i) => ({ secret: i })),
		initialTurn: {
			currentPlayerId: playerIds[0],
			allowedActions: ['increment', 'decrement', 'reset'] as TestActionType[],
			phase: 'playing' as TestPhase,
			phaseData: { round: 1 },
		},
	}),

	validateAction: shouldValidate,

	applyAction: (
		state: TestGame,
		action: TestAction,
	): ActionResult<TestGame> => {
		if (!shouldSucceed(state, action)) {
			return {
				success: false,
				error: `Action ${action.type} failed to apply`,
			};
		}

		const newState = { ...state };
		newState.publicState = { ...state.publicState };
		newState.publicState.history = [...state.publicState.history, action.type];

		switch (action.type) {
			case 'increment':
				newState.publicState.counter += action.payload.amount ?? 1;
				break;
			case 'decrement':
				newState.publicState.counter -= action.payload.amount ?? 1;
				break;
			case 'reset':
				newState.publicState.counter = 0;
				break;
		}

		return {
			success: true,
			newState,
		};
	},

	checkGameEnd: (state) => ({
		isFinished: state.publicState.counter >= 100,
		winner: state.publicState.counter >= 100 ? state.players[0].id : undefined,
	}),
});

const createMockGame = (
	counter = 0,
	history: string[] = [],
): TestGame => ({
	id: 'test-game-1',
	version: 1,
	createdAt: 1000,
	updatedAt: 1000,
	status: 'active',
	config: { startingValue: 0 },
	seed: 'test-seed',
	publicState: { counter, history },
	players: [
		{ id: 'player1', privateState: { secret: 0 } },
		{ id: 'player2', privateState: { secret: 1 } },
	],
	turn: {
		currentPlayerId: 'player1',
		allowedActions: ['increment', 'decrement', 'reset'],
		phase: 'playing',
		phaseData: { round: 1 },
	},
	startedAt: 1000,
});

const createAction = (
	type: TestActionType,
	playerId = 'player1',
	amount?: number,
	timestamp = 2000,
): TestAction => ({
	type,
	playerId,
	payload: { amount },
	timestamp,
});

describe('replay', () => {
	describe('replayGame', () => {
		it('should replay a sequence of actions successfully', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(0, []);
			const actions = [
				createAction('increment', 'player1', 5, 2000),
				createAction('increment', 'player1', 3, 3000),
				createAction('decrement', 'player1', 2, 4000),
			];

			const config: ReplayConfig<
				TestConfig,
				TestPublicState,
				TestPrivateState,
				TestActionType,
				TestActionPayload,
				TestPhase,
				TestPhaseData
			> = {
				initialGame,
				actions,
				engine,
			};

			const result = replayGame(config);

			expect(result.success).toBe(true);
			expect(result.actionsApplied).toBe(3);
			expect(result.finalGame).not.toBeNull();
			expect(result.finalGame?.publicState.counter).toBe(6); // 5 + 3 - 2
			expect(result.finalGame?.publicState.history).toEqual([
				'increment',
				'increment',
				'decrement',
			]);
			expect(result.error).toBeUndefined();
		});

		it('should handle empty action list', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(10, []);

			const result = replayGame({
				initialGame,
				actions: [],
				engine,
			});

			expect(result.success).toBe(true);
			expect(result.actionsApplied).toBe(0);
			expect(result.finalGame).toEqual(initialGame);
		});

		it('should stop and return error when action validation fails', () => {
			const engine = createMockEngine((state, action) => {
				// First two actions pass, third fails
				return state.publicState.history.length < 2;
			});

			const initialGame = createMockGame(0, []);
			const actions = [
				createAction('increment', 'player1', 1, 2000),
				createAction('increment', 'player1', 1, 3000),
				createAction('increment', 'player1', 1, 4000), // This will fail
			];

			const result = replayGame({
				initialGame,
				actions,
				engine,
			});

			expect(result.success).toBe(false);
			expect(result.actionsApplied).toBe(2); // Only first two applied
			expect(result.finalGame).toBeNull();
			expect(result.error).toContain('Action 2 failed validation');
			expect(result.error).toContain('increment');
		});

		it('should stop and return error when action application fails', () => {
			const engine = createMockEngine(
				() => true, // Validation passes
				(state, action) => {
					// First action succeeds, second fails
					return state.publicState.history.length < 1;
				},
			);

			const initialGame = createMockGame(0, []);
			const actions = [
				createAction('increment', 'player1', 5, 2000),
				createAction('increment', 'player1', 3, 3000), // This will fail
			];

			const result = replayGame({
				initialGame,
				actions,
				engine,
			});

			expect(result.success).toBe(false);
			expect(result.actionsApplied).toBe(1);
			expect(result.finalGame).toBeNull();
			expect(result.error).toContain('Action 1 failed to apply');
			expect(result.error).toContain('increment');
		});

		it('should handle action that returns success false with custom error', () => {
			const engine = createMockEngine(
				() => true,
				() => false, // Always fail
			);

			const initialGame = createMockGame(0, []);
			const actions = [createAction('increment', 'player1', 1, 2000)];

			const result = replayGame({
				initialGame,
				actions,
				engine,
			});

			expect(result.success).toBe(false);
			expect(result.actionsApplied).toBe(0);
			expect(result.finalGame).toBeNull();
			expect(result.error).toBe('Action increment failed to apply');
		});

		it('should apply actions in correct order', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(0, []);
			const actions = [
				createAction('increment', 'player1', 10, 2000),
				createAction('reset', 'player1', undefined, 3000),
				createAction('increment', 'player1', 5, 4000),
			];

			const result = replayGame({
				initialGame,
				actions,
				engine,
			});

			expect(result.success).toBe(true);
			expect(result.finalGame?.publicState.counter).toBe(5); // 10, reset to 0, then 5
			expect(result.finalGame?.publicState.history).toEqual([
				'increment',
				'reset',
				'increment',
			]);
		});

		it('should replay deterministically with same inputs', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(0, []);
			const actions = [
				createAction('increment', 'player1', 3, 2000),
				createAction('increment', 'player1', 7, 3000),
			];

			const result1 = replayGame({ initialGame, actions, engine });
			const result2 = replayGame({ initialGame, actions, engine });

			expect(result1.success).toBe(true);
			expect(result2.success).toBe(true);
			expect(result1.finalGame?.publicState).toEqual(
				result2.finalGame?.publicState,
			);
			expect(result1.actionsApplied).toBe(result2.actionsApplied);
		});

		it('should handle large number of actions', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(0, []);
			const actions: TestAction[] = [];

			// Create 100 increment actions
			for (let i = 0; i < 100; i++) {
				actions.push(createAction('increment', 'player1', 1, 2000 + i));
			}

			const result = replayGame({
				initialGame,
				actions,
				engine,
			});

			expect(result.success).toBe(true);
			expect(result.actionsApplied).toBe(100);
			expect(result.finalGame?.publicState.counter).toBe(100);
			expect(result.finalGame?.publicState.history.length).toBe(100);
		});

		it('should preserve game metadata during replay', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(0, []);
			initialGame.seed = 'unique-seed-123';
			initialGame.id = 'game-xyz';
			initialGame.version = 5;

			const actions = [createAction('increment', 'player1', 1, 2000)];

			const result = replayGame({
				initialGame,
				actions,
				engine,
			});

			expect(result.success).toBe(true);
			expect(result.finalGame?.seed).toBe('unique-seed-123');
			expect(result.finalGame?.id).toBe('game-xyz');
			expect(result.finalGame?.version).toBe(5);
		});

		it('should handle actions with different payload structures', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(0, []);
			const actions = [
				createAction('increment', 'player1', 5, 2000),
				createAction('increment', 'player1', undefined, 3000), // No amount, should default to 1
				createAction('reset', 'player1', undefined, 4000),
			];

			const result = replayGame({
				initialGame,
				actions,
				engine,
			});

			expect(result.success).toBe(true);
			expect(result.finalGame?.publicState.counter).toBe(0); // 5 + 1, then reset
		});
	});

	describe('validateReplay', () => {
		it('should return true for identical public states (default comparison)', () => {
			const game1 = createMockGame(10, ['increment', 'increment']);
			const game2 = createMockGame(10, ['increment', 'increment']);

			const isValid = validateReplay(game1, game2);

			expect(isValid).toBe(true);
		});

		it('should return false for different public states (default comparison)', () => {
			const game1 = createMockGame(10, ['increment']);
			const game2 = createMockGame(15, ['increment']);

			const isValid = validateReplay(game1, game2);

			expect(isValid).toBe(false);
		});

		it('should use custom comparison function when provided', () => {
			const game1 = createMockGame(10, ['increment']);
			const game2 = createMockGame(15, ['increment']);

			// Custom comparison that only checks counter
			const customCompare = (a: TestGame, b: TestGame) =>
				a.publicState.counter === b.publicState.counter;

			const isValid = validateReplay(game1, game2, customCompare);

			expect(isValid).toBe(false);
		});

		it('should allow custom comparison to ignore certain fields', () => {
			const game1 = createMockGame(10, ['increment', 'increment']);
			const game2 = createMockGame(10, ['increment', 'decrement']); // Different history

			// Custom comparison that ignores history
			const customCompare = (a: TestGame, b: TestGame) =>
				a.publicState.counter === b.publicState.counter;

			const isValid = validateReplay(game1, game2, customCompare);

			expect(isValid).toBe(true);
		});

		it('should handle complex nested state structures', () => {
			const game1 = createMockGame(5, ['a', 'b', 'c']);
			const game2 = createMockGame(5, ['a', 'b', 'c']);

			const isValid = validateReplay(game1, game2);

			expect(isValid).toBe(true);
		});

		it('should detect differences in array order', () => {
			const game1 = createMockGame(5, ['a', 'b', 'c']);
			const game2 = createMockGame(5, ['a', 'c', 'b']);

			const isValid = validateReplay(game1, game2);

			expect(isValid).toBe(false);
		});

		it('should handle empty public states', () => {
			const game1 = createMockGame(0, []);
			const game2 = createMockGame(0, []);

			const isValid = validateReplay(game1, game2);

			expect(isValid).toBe(true);
		});
	});

	describe('integration: replay and validate', () => {
		it('should validate a successfully replayed game', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(0, []);
			const actions = [
				createAction('increment', 'player1', 5, 2000),
				createAction('increment', 'player1', 3, 3000),
			];

			const replayResult = replayGame({
				initialGame,
				actions,
				engine,
			});

			const expectedGame = createMockGame(8, ['increment', 'increment']);

			expect(replayResult.success).toBe(true);
			expect(replayResult.finalGame).not.toBeNull();

			if (replayResult.finalGame) {
				const isValid = validateReplay(replayResult.finalGame, expectedGame);
				expect(isValid).toBe(true);
			}
		});

		it('should detect replay mismatch with expected state', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(0, []);
			const actions = [createAction('increment', 'player1', 5, 2000)];

			const replayResult = replayGame({
				initialGame,
				actions,
				engine,
			});

			const wrongExpectedGame = createMockGame(10, ['increment']); // Wrong counter value

			expect(replayResult.success).toBe(true);
			expect(replayResult.finalGame).not.toBeNull();

			if (replayResult.finalGame) {
				const isValid = validateReplay(replayResult.finalGame, wrongExpectedGame);
				expect(isValid).toBe(false);
			}
		});
	});

	describe('edge cases', () => {
		it('should handle game with no players', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(0, []);
			initialGame.players = [];

			const actions = [createAction('increment', 'player1', 1, 2000)];

			const result = replayGame({
				initialGame,
				actions,
				engine,
			});

			expect(result.success).toBe(true);
			expect(result.finalGame?.players.length).toBe(0);
		});

		it('should handle zero-increment actions', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(10, []);
			const actions = [createAction('increment', 'player1', 0, 2000)];

			const result = replayGame({
				initialGame,
				actions,
				engine,
			});

			expect(result.success).toBe(true);
			expect(result.finalGame?.publicState.counter).toBe(10); // 10 + 0
		});

		it('should handle negative increments (decrements)', () => {
			const engine = createMockEngine();
			const initialGame = createMockGame(10, []);
			const actions = [createAction('increment', 'player1', -3, 2000)];

			const result = replayGame({
				initialGame,
				actions,
				engine,
			});

			expect(result.success).toBe(true);
			expect(result.finalGame?.publicState.counter).toBe(7); // 10 + (-3)
		});
	});
});
