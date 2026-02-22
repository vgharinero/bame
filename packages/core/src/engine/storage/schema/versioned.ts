import type { TableName, TableRecord } from '.';

export interface VersionedRecord {
	id: string;
	version: number;
	createdAt: number;
	updatedAt: number;
}

export type VersionedTable = {
	[K in TableName]: TableRecord<K> extends VersionedRecord ? K : never;
}[TableName];
