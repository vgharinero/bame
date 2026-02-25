import type { KeysOfType } from '../../primitives';
import type {
	DeltaOperation,
	InsertOperation,
	UpdateOperation,
} from '../atomic-operation';
import type { TableName, TableRecord } from '../schema';
import type { VersionedRecord, VersionedTable } from '../schema/versioned';
import { Storage } from '../storage';

export abstract class VersionedStorage extends Storage {
	private createVersionedRecord<TTable extends VersionedTable>(
		id: string,
		data: Omit<TableRecord<TTable>, keyof VersionedRecord>,
	): TableRecord<TTable> {
		const now = Date.now();
		return {
			...data,
			id,
			version: 1,
			createdAt: now,
			updatedAt: now,
		} as TableRecord<TTable>;
	}

	protected async insertVersionedRecord<TTable extends VersionedTable>(
		table: TTable,
		id: string,
		data: Omit<TableRecord<TTable>, keyof VersionedRecord>,
	): Promise<TableRecord<TTable>> {
		const versionedRecord = this.createVersionedRecord(id, data);
		await this.dataSource.performInsert(table, versionedRecord);

		return versionedRecord;
	}

	protected async updateVersionedRecord<
		TTable extends TableName,
		TRecord extends TableRecord<TTable> & VersionedRecord,
	>(table: TTable, record: TRecord): Promise<TRecord> {
		const updatedRecord = {
			...record,
			version: record.version + 1,
			updatedAt: Date.now(),
		};

		await this.dataSource.performUpdate(table, record.id, updatedRecord);

		return updatedRecord;
	}

	protected prepareInsert<TTable extends VersionedTable>(
		table: TTable,
		id: string,
		data: Omit<TableRecord<TTable>, keyof VersionedRecord>,
	): InsertOperation<TTable> {
		const record = this.createVersionedRecord(id, data);
		return { type: 'insert', table, record: record };
	}

	protected prepareUpdate<TTable extends VersionedTable>(
		table: TTable,
		record: TableRecord<TTable>,
	): UpdateOperation<TTable> {
		const updatedRecord = {
			...record,
			version: record.version + 1,
			updatedAt: Date.now(),
		};

		return { type: 'update', table, record: updatedRecord };
	}

	protected prepareDeltaUpdates<TTable extends VersionedTable>(
		table: TTable,
		id: string,
		deltas: Partial<Record<KeysOfType<TableRecord<TTable>, number>, number>>,
	): DeltaOperation<TTable> {
		return {
			type: 'delta',
			table,
			id,
			deltas,
		};
	}
}
