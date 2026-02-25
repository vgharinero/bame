import type { Action, ActionPayloadMap } from '../action';

import type { TestActionPayloadMap, TestPhasePayloadMap } from './domain';

type ActionOverride<TActionPayloadMap extends ActionPayloadMap> =
	| { type?: never; payload?: never } // Neither provided
	| {
			[K in keyof TActionPayloadMap]: {
				type: K;
				payload: TActionPayloadMap[K]['complete'];
			};
	  }[keyof TActionPayloadMap]; // Both provided together

export const createMockAction = (
	overrides?: Partial<
		Omit<Action<TestActionPayloadMap, TestPhasePayloadMap>, 'type' | 'payload'>
	> &
		ActionOverride<TestActionPayloadMap>,
): Action<TestActionPayloadMap, TestPhasePayloadMap> => {
	return {
		userId: overrides?.userId ?? 'user-1',
		timestamp: overrides?.timestamp ?? Date.now(),
		type: overrides?.type ?? ('move' as keyof TestActionPayloadMap),
		payload:
			overrides?.payload ??
			({ position: 0 } as unknown as TestActionPayloadMap[keyof TestActionPayloadMap]),
	} as Action<TestActionPayloadMap, TestPhasePayloadMap>;
};
