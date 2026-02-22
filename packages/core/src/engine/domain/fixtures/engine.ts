import type { Action } from '../action';
import type { Engine } from '../engine';
import type { Game } from '../game';
import type {
	ApplyActionResult,
	CheckGameEndResult,
	GameInitializationResult,
	ValidateActionResult,
} from '../results';
import type {
	TestActionPayloadMap,
	TestConfig,
	TestPhasePayloadMap,
	TestPrivateState,
	TestPublicState,
} from './domain';

export const createMockEngine = (
	overrides?: Partial<
		Engine<
			TestConfig,
			TestPublicState,
			TestPrivateState,
			TestActionPayloadMap,
			TestPhasePayloadMap
		>
	>,
): Engine<
	TestConfig,
	TestPublicState,
	TestPrivateState,
	TestActionPayloadMap,
	TestPhasePayloadMap
> => ({
	name: 'TestEngine',
	minPlayers: 2,
	maxPlayers: 4,

	initialize: (
		_config: TestConfig,
		playerIds: string[],
		_seed: string,
	): GameInitializationResult<
		TestPublicState,
		TestPrivateState,
		TestActionPayloadMap,
		TestPhasePayloadMap
	> => ({
		publicState: { board: [] },
		initialPrivateStates: Object.fromEntries(
			playerIds.map((id) => [id, { hand: [] }]),
		),
		initialTurn: {
			currentPlayerId: playerIds[0],
			allowedActions: ['move', 'pass'],
			number: 1,
			phase: 'play',
			phaseData: { round: 1 },
		},
	}),

	validateAction: (
		_state: Game<
			TestConfig,
			TestPublicState,
			TestPrivateState,
			TestActionPayloadMap,
			TestPhasePayloadMap
		>,
		_action: Action<TestActionPayloadMap, TestPhasePayloadMap>,
	): ValidateActionResult => ({
		isValid: true,
	}),

	applyAction: (
		state: Game<
			TestConfig,
			TestPublicState,
			TestPrivateState,
			TestActionPayloadMap,
			TestPhasePayloadMap
		>,
		_action: Action<TestActionPayloadMap, TestPhasePayloadMap>,
	): ApplyActionResult<
		TestConfig,
		TestPublicState,
		TestPrivateState,
		TestActionPayloadMap,
		TestPhasePayloadMap
	> => ({
		success: true,
		newGame: state,
	}),

	checkGameEnd: (
		_state: Game<
			TestConfig,
			TestPublicState,
			TestPrivateState,
			TestActionPayloadMap,
			TestPhasePayloadMap
		>,
	): CheckGameEndResult => ({
		isFinished: false,
	}),

	...overrides,
});
