import type { TableSchema } from './primitives';
import type { VersionedRecord } from './versioned';

export interface LobbyMemberRecord extends VersionedRecord {
	lobbyId: string;
	userId: string;
	status: string;
}

export const LOBBY_MEMBERS_SCHEMA = {
	tableName: 'lobby_members',
	columns: {
		id: { type: 'TEXT', primaryKey: true },
		version: { type: 'INTEGER' },
		createdAt: { type: 'BIGINT' },
		updatedAt: { type: 'BIGINT' },
		lobbyId: {
			type: 'TEXT',
			references: { table: 'lobbies', column: 'id', onDelete: 'CASCADE' },
		},
		userId: {
			type: 'TEXT',
			references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
		},
		status: { type: 'TEXT' },
	},
	_record: {} as LobbyMemberRecord,
} as const satisfies TableSchema<LobbyMemberRecord>;
