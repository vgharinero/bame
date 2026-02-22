import type { JsonValue } from '../../primitives';
import type { TableSchema } from './primitives';
import type { VersionedRecord } from './versioned';

export interface PlayerRecord extends VersionedRecord {
	gameId: string;
	userId: string;
	status: string;
	privateState: JsonValue;
}

export const PLAYER_SCHEMA = {
	tableName: 'players',
	columns: {
		id: { type: 'TEXT', primaryKey: true },
		version: { type: 'INTEGER' },
		createdAt: { type: 'BIGINT' },
		updatedAt: { type: 'BIGINT' },
		gameId: {
			type: 'TEXT',
			references: { table: 'games', column: 'id', onDelete: 'CASCADE' },
		},
		userId: {
			type: 'TEXT',
			references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
		},
		status: { type: 'TEXT' },
		privateState: { type: 'JSONB' },
	},
	_record: {} as PlayerRecord,
} as const satisfies TableSchema<PlayerRecord>;
