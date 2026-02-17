import type { Action } from '../types/action';
import type { Engine } from '../types/engine';
import type { Game } from '../types/game';

export interface ReplayResult<
	TConfig extends object,
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
> {
	success: boolean;
	finalGame: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	> | null;
	actionsApplied: number;
	error?: string;
}

export interface ReplayConfig<
	TConfig extends object,
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TActionPayload extends object,
	TPhase extends string,
	TPhaseData extends object,
> {
	initialGame: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>;
	actions: Action<TActionType, TActionPayload>[];
	engine: Engine<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TActionPayload,
		TPhase,
		TPhaseData
	>;
}

export function replayGame<
	TConfig extends object,
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TActionPayload extends object,
	TPhase extends string,
	TPhaseData extends object,
>(
	config: ReplayConfig<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TActionPayload,
		TPhase,
		TPhaseData
	>,
): ReplayResult<TConfig, TPublicState, TPrivateState, TActionType, TPhase, TPhaseData> {
	let currentGame = config.initialGame;
	let actionsApplied = 0;

	for (const action of config.actions) {
		// Validate action
		const isValid = config.engine.validateAction(currentGame, action);
		if (!isValid) {
			return {
				success: false,
				finalGame: null,
				actionsApplied,
				error: `Action ${actionsApplied} failed validation: ${action.type}`,
			};
		}

		// Apply action
		const result = config.engine.applyAction(currentGame, action);
		if (!result.success || !result.newState) {
			return {
				success: false,
				finalGame: null,
				actionsApplied,
				error:
					result.error ||
					`Action ${actionsApplied} failed to apply: ${action.type}`,
			};
		}

		currentGame = result.newState;
		actionsApplied++;
	}

	return {
		success: true,
		finalGame: currentGame,
		actionsApplied,
	};
}

export function validateReplay<
	TConfig extends object,
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
>(
	replayed: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>,
	expected: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>,
	compareFn?: (
		a: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
		b: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
	) => boolean,
): boolean {
	if (compareFn) {
		return compareFn(replayed, expected);
	}

	// Default comparison: deep equality on public state
	return JSON.stringify(replayed.publicState) === JSON.stringify(expected.publicState);
}
