import type { SupabaseClient } from '@supabase/supabase-js';
import type { AtomicOperation, DataSource } from '../../../engine/storage';
import type { TableName, TableRecord } from '../../../engine/storage/schema';

export class SupabaseDataSource implements DataSource {
	constructor(private supabase: SupabaseClient) {}

	async performGet<TTable extends TableName>(
		table: TTable,
		id: string,
	): Promise<TableRecord<TTable> | null> {
		const { data, error } = await this.supabase
			.from(table)
			.select('*')
			.eq('id', id)
			.single();

		if (error) throw error;
		return data;
	}

	async performGetByField<TTable extends TableName>(
		table: TTable,
		field: keyof TableRecord<TTable>,
		value: unknown,
	): Promise<TableRecord<TTable> | null> {
		const { data, error } = await this.supabase
			.from(table)
			.select('*')
			.eq(String(field), value)
			.single();

		if (error) throw error;
		return data;
	}

	async performGetMany<TTable extends TableName>(
		table: TTable,
		ids: string[],
	): Promise<TableRecord<TTable>[]> {
		const { data, error } = await this.supabase
			.from(table)
			.select('*')
			.in('id', ids);

		if (error) throw error;
		return data || [];
	}

	async performGetManyByField<TTable extends TableName>(
		table: TTable,
		field: keyof TableRecord<TTable>,
		value: unknown,
	): Promise<TableRecord<TTable>[]> {
		const { data, error } = await this.supabase
			.from(table)
			.select('*')
			.eq(String(field), value);

		if (error) throw error;
		return data || [];
	}

	async performInsert<TTable extends TableName>(
		table: TTable,
		entity: TableRecord<TTable>,
	): Promise<void> {
		const { error } = await this.supabase.from(table).insert([entity]);

		if (error) throw error;
	}

	async performUpdate<TTable extends TableName>(
		table: TTable,
		id: string,
		version: number,
		updatedEntity: TableRecord<TTable>,
	): Promise<void> {
		const { error } = await this.supabase
			.from(table)
			.update(updatedEntity)
			.eq('id', id);

		if (error) throw error;
	}

	async performDelete<TTable extends TableName>(
		table: TTable,
		id: string,
	): Promise<void> {
		const { error } = await this.supabase.from(table).delete().eq('id', id);

		if (error) throw error;
	}

	async performAtomic(operations: AtomicOperation<TableName>[]): Promise<void> {
		// Execute operations sequentially within a transaction
		for (const operation of operations) {
			switch (operation.type) {
				case 'insert':
					await this.performInsert(operation.table, operation.entity);
					break;
				case 'update':
					await this.performUpdate(
						operation.table,
						operation.id,
						operation.version,
						operation.entity,
					);
					break;
				case 'delete':
					await this.performDelete(operation.table, operation.id);
					break;
			}
		}
	}
}
