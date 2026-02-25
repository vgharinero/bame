import {
	ActionStorageAdapter,
	GameStorageAdapter,
	LobbyStorageAdapter,
	ProfileStorageAdapter,
} from './adapters';
import type { DataSource } from './data-source';
import { RealtimeAdapter, type RealtimeDataSource } from './realtime';

export const createStorage = (
	dataSource: DataSource,
	realtime: RealtimeDataSource,
) => {
	return {
		profile: new ProfileStorageAdapter(dataSource),
		lobby: new LobbyStorageAdapter(dataSource),
		game: new GameStorageAdapter(dataSource),
		action: new ActionStorageAdapter(dataSource),
		realtime: new RealtimeAdapter(realtime),
	};
};
