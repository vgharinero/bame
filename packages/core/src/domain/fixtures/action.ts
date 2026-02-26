import type { Action } from '../action';
import type { PerspectiveMap } from '../perspective';

import type { TestActionPayloadMap, TestPhasePayloadMap } from './domain';

type ActionOverride<TActionPayloadMap extends PerspectiveMap> =
	| { type?: never; payload?: never } // Neither provided
	| {
			[K in keyof TActionPayloadMap]: {
				type: K;
				payload: TActionPayloadMap[K]['private'];
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
		...
	};
};
