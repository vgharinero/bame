import type { Serializable } from '../../primitives';
import type { TableSchema } from './primitives';
import type { VersionedRecord } from './versioned';

export interface GameRecord extends VersionedRecord {
	status: string;
	config: Serializable;

	currentTurn: Serializable;
	publicState: Serializable;

	seed: string;
	winnerId?: string;

	startedAt?: number;
	finishedAt?: number;
}

export const GAMES_SCHEMA = {
	tableName: 'games',
	columns: {
		id: { type: 'TEXT', primaryKey: true },
		version: { type: 'INTEGER' },
		createdAt: { type: 'BIGINT' },
		updatedAt: { type: 'BIGINT' },

		status: { type: 'TEXT' },
		config: { type: 'JSONB' },

		currentTurn: { type: 'JSONB' },
		publicState: { type: 'JSONB' },

		seed: { type: 'TEXT' },
		winnerId: { type: 'TEXT', null: true },

		startedAt: { type: 'BIGINT', null: true },
		finishedAt: { type: 'BIGINT', null: true },
	},
	_record: {} as GameRecord,
} as const satisfies TableSchema<GameRecord>;
