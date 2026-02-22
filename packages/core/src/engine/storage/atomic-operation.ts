import type { KeysOfType } from '../primitives';
import type { TableName, TableRecord } from './schema';

export type InsertOperation<TTable extends TableName = TableName> = {
	type: 'insert';
	table: TTable;
	data: TableRecord<TTable>;
};

export type UpdateOperation<TTable extends TableName = TableName> = {
	type: 'update';
	table: TTable;
	currentVersion: number;
	record: TableRecord<TTable>;
};

export type DeleteOperation<TTable extends TableName = TableName> = {
	type: 'delete';
	table: TTable;
	id: string;
	currentVersion: number;
};

export type DeltaOperation<TTable extends TableName = TableName> = {
	type: 'delta';
	table: TTable;
	id: string;
	currentVersion: number;
	deltas: Partial<Record<KeysOfType<TableRecord<TTable>, number>, number>>;
};

export type AtomicOperation<TTable extends TableName = TableName> =
	| InsertOperation<TTable>
	| UpdateOperation<TTable>
	| DeleteOperation<TTable>
	| DeltaOperation<TTable>;
