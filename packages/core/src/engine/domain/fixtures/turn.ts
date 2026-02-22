import type { PayloadMap } from '../../primitives';
import type { Turn } from '../turn';
import type { TestActionPayloadMap, TestPhasePayloadMap } from './domain';

type PhaseOverride<TPhasePayloadMap extends PayloadMap> =
	| { phase?: never; phaseData?: never } // Neither provided
	| {
			[K in keyof TPhasePayloadMap]: {
				phase: K;
				phaseData: TPhasePayloadMap[K];
			};
	  }[keyof TPhasePayloadMap]; // Both provided together

export const createMockTurn = (
	overrides?: Partial<
		Omit<Turn<TestActionPayloadMap, TestPhasePayloadMap>, 'phase' | 'phaseData'>
	> &
		PhaseOverride<TestPhasePayloadMap>,
): Turn<TestActionPayloadMap, TestPhasePayloadMap> => {
	return {
		currentPlayerId: overrides?.currentPlayerId ?? 'user-1',
		allowedActions: overrides?.allowedActions ?? ['move', 'pass'],
		requiredActions: overrides?.requiredActions ?? undefined,
		number: overrides?.number ?? 1,
		phase: overrides?.phase ?? 'play',
		phaseData: overrides?.phaseData ?? { round: 1 },
		startedAt: overrides?.startedAt ?? Date.now(),
	} as Turn<TestActionPayloadMap, TestPhasePayloadMap>;
};
