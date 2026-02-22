import type { TableSchema } from './primitives';
import type { VersionedRecord } from './versioned';

export interface ProfileRecord extends VersionedRecord {
	displayName: string;
	avatarUrl: string | null;
	wins: number;
	losses: number;
	draws: number;
	totalGames: number;
}

export const PROFILES_SCHEMA = {
	tableName: 'profiles',
	columns: {
		id: {
			type: 'TEXT',
			primaryKey: true,
			references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
		},
		version: { type: 'INTEGER' },
		createdAt: { type: 'BIGINT' },
		updatedAt: { type: 'BIGINT' },

		displayName: { type: 'TEXT' },

		avatarUrl: { type: 'TEXT', null: true },

		wins: { type: 'INTEGER', default: 0 },
		losses: { type: 'INTEGER', default: 0 },
		draws: { type: 'INTEGER', default: 0 },
		totalGames: { type: 'INTEGER', default: 0 },
	},
	_record: {} as ProfileRecord,
} as const satisfies TableSchema<ProfileRecord>;
