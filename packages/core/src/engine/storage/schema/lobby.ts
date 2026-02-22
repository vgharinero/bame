import { getRandomCode } from '../../domain';
import type { JsonValue } from '../../primitives';
import type { TableSchema } from './primitives';
import type { VersionedRecord } from './versioned';

export interface LobbyRecord extends VersionedRecord {
	code: string;
	hostId: string;
	status: string;
	config: JsonValue;
	minPlayers: number;
	maxPlayers: number;
	transitionedAt?: number;
}

export const LOBBIES_SCHEMA = {
	tableName: 'lobbies',
	columns: {
		id: { type: 'TEXT', primaryKey: true },
		version: { type: 'INTEGER' },
		createdAt: { type: 'BIGINT' },
		updatedAt: { type: 'BIGINT' },
		code: { type: 'TEXT', unique: true, default: getRandomCode() },
		hostId: {
			type: 'TEXT',
			references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
		},
		status: { type: 'TEXT' },
		config: { type: 'JSONB' },
		minPlayers: { type: 'INTEGER' },
		maxPlayers: { type: 'INTEGER' },
		transitionedAt: { type: 'BIGINT', null: true },
	},
	_record: {} as LobbyRecord,
} as const satisfies TableSchema<LobbyRecord>;
