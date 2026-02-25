import type { KeysOfType } from '../primitives';
import type { TableName, TableRecord } from './schema';

export type InsertOperation<TTable extends TableName = TableName> = {
	type: 'insert';
	table: TTable;
	record: TableRecord<TTable>;
};

export type UpdateOperation<TTable extends TableName = TableName> = {
	type: 'update';
	table: TTable;
	record: TableRecord<TTable>;
};

export type DeleteOperation<TTable extends TableName = TableName> = {
	type: 'delete';
	table: TTable;
	id: string;
};

export type DeltaOperation<TTable extends TableName = TableName> = {
	type: 'delta';
	table: TTable;
	id: string;
	deltas: Partial<Record<KeysOfType<TableRecord<TTable>, number>, number>>;
};

export type AtomicOperation<TTable extends TableName = TableName> =
	| InsertOperation<TTable>
	| UpdateOperation<TTable>
	| DeleteOperation<TTable>
	| DeltaOperation<TTable>;
