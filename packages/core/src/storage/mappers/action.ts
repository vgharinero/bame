import type { Action } from '../../domain';
import type { PayloadMap } from '../../primitives';
import type { ActionRecord } from '../schema/action';

export namespace ActionMapper {
	export const toDomain = <
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		actionRecord: ActionRecord,
	): Action<TActionPayloadMap, TPhasePayloadMap> => {
		// TODO: Improve type safety
		return {
			userId: actionRecord.userId,
			timestamp: actionRecord.timestamp,
			type: actionRecord.type,
			payload: actionRecord.payload,
		} as unknown as Action<TActionPayloadMap, TPhasePayloadMap>;
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
			payload: action.payload,
		};
	};
}
