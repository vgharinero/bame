import type { Action } from '../../domain';
import type { JsonValue, PayloadMap } from '../../primitives';
import type { ActionRecord } from '../schema/action';

export namespace ActionMapper {
	export const toDomain = <
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		actionRecord: ActionRecord,
	): Action<TActionPayloadMap, TPhasePayloadMap> => {
		return {
			userId: actionRecord.userId,
			timestamp: actionRecord.timestamp,
			type: actionRecord.type,
			payload:
				actionRecord.payload as TActionPayloadMap[keyof TActionPayloadMap],
		} as Action<TActionPayloadMap, TPhasePayloadMap>;
	};

	export const toRecord = <
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		id: string,
		action: Action<TActionPayloadMap, TPhasePayloadMap>,
		gameId: string,
	): ActionRecord => {
		return {
			id,
			gameId: gameId,
			userId: action.userId,
			timestamp: action.timestamp,
			type: action.type as string,
			payload: ('payload' in action ? action.payload : null) as JsonValue,
		};
	};
}
