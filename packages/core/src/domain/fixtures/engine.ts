import type { Action } from '../action';
import type { Engine } from '../engine';
import type { Game } from '../game';
import type {
	ApplyActionResult,
	CheckGameEndResult,
	InitializationResult,
	ValidateActionResult,
} from '../results';
import type {
	TestActionPayloadMap,
	TestConfig,
	TestGameDef,
	TestPhasePayloadMap
} from './domain';

export const createMockEngine = (
	overrides?: Partial<Engine<TestGameDef>>,
): Engine<TestGameDef> => ({
	name: 'TestEngine',
	minPlayers: 2,
	maxPlayers: 4,

	initialize: (
		_config: TestConfig,
		playerIds: string[],
		_seed: string,
	): InitializationResult<TestGameDef> => ({
		state: { board: [] },
		playerStates: Object.fromEntries(
			playerIds.map((id) => [
				id,
				{ private: { hand: [] }, public: { handCount: 0 } },
			]),
		),
		initialTurn: {
			userId: playerIds[0],
			allowedActions: ['move', 'pass'],
			number: 1,
			phase: 'play',
			phaseData: { round: 1 },
		},
	}),

	projectPlayer: (player) => ({
		...player,
		state: { handCount: player.state.hand.length },
	}),

	projectAction: (action) =>
		action as Action<TestActionPayloadMap, TestPhasePayloadMap, 'public'>,
	
	projectTurn: (turn) => ({
		...turn,
		allowedActions: turn.allowedActions as any,
	}),

	validateAction: (
		_state: Game<TestGameDef>,
		_action: Action<TestActionPayloadMap, TestPhasePayloadMap>,
	): ValidateActionResult => ({
		isValid: true,
	}),

	applyAction: (
		state: Game<TestGameDef>,
		_action: Action<TestActionPayloadMap, TestPhasePayloadMap>,
	): ApplyActionResult<TestGameDef> => ({
		success: true,
		state: state.state,
		playerStates: Object.fromEntries(
			state.players.map((p) => [p.userId, p.state]),
		),
	}),

	checkGameEnd: (_state: Game<TestGameDef>): CheckGameEndResult => ({
		isFinished: false,
	}),

	...overrides,
});
