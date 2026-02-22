import type { JsonValue } from '../../primitives';
import type { TableSchema } from './primitives';

export interface ActionRecord {
	id: string;
	gameId: string;
	userId: string;
	type: string;
	payload: JsonValue;
	timestamp: number;
}

export const ACTIONS_SCHEMA = {
	tableName: 'actions',
	columns: {
		id: { type: 'TEXT', primaryKey: true },
		gameId: {
			type: 'TEXT',
			references: { table: 'games', column: 'id', onDelete: 'CASCADE' },
		},
		userId: {
			type: 'TEXT',
			references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
		},
		type: { type: 'TEXT' },
		payload: { type: 'JSONB' },
		timestamp: { type: 'BIGINT' },
	},
	_record: {} as ActionRecord,
} as const satisfies TableSchema<ActionRecord>;
