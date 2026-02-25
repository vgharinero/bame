import type { AtomicOperation } from './atomic-operation';
import type { TableName, TableRecord } from './schema';

export interface DataSource {
	performGet<TTable extends TableName>(
		table: TTable,
		id: string,
	): Promise<TableRecord<TTable> | null>;

	performGetByField<TTable extends TableName>(
		table: TTable,
		field: keyof TableRecord<TTable>,
		value: unknown,
	): Promise<TableRecord<TTable> | null>;

	performGetAll<TTable extends TableName>(
		table: TTable,
	): Promise<TableRecord<TTable>[]>;

	performGetMany<TTable extends TableName>(
		table: TTable,
		ids: string[],
	): Promise<TableRecord<TTable>[]>;

	performGetManyByField<TTable extends TableName>(
		table: TTable,
		field: keyof TableRecord<TTable>,
		value: unknown,
	): Promise<TableRecord<TTable>[]>;

	performInsert<TTable extends TableName>(
		table: TTable,
		entity: TableRecord<TTable>,
	): Promise<void>;

	performUpdate<TTable extends TableName>(
		table: TTable,
		id: string,
		updatedEntity: TableRecord<TTable>,
	): Promise<void>;

	performDelete<TTable extends TableName>(
		table: TTable,
		id: string,
	): Promise<void>;

	performAtomic(operations: AtomicOperation<TableName>[]): Promise<void>;
}
