import type { Action } from '../../domain';
import { ActionMapper } from '../mappers';
import { TABLES } from '../schema';
import { Storage } from '../storage';

export class ActionStorageAdapter extends Storage {
	async getActionsByGameId(gameId: string): Promise<Action[]> {
		const actionRecords = await this.dataSource.performGetManyByField(
			TABLES.ACTIONS,
			'gameId',
			gameId,
		);

		return actionRecords.map((a) => ActionMapper.toDomain(a));
	}
}
