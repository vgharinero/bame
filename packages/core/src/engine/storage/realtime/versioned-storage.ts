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
	): Promise<void> {
		const versionedRecord = this.createVersionedRecord(id, data);
		await this.dataSource.performInsert(table, versionedRecord);
	}

	protected async updateVersionedRecord<
		TTable extends TableName,
		TRecord extends TableRecord<TTable> & VersionedRecord,
	>(table: TTable, record: TRecord): Promise<void> {
		const currentVersion = record.version;

		record.version += 1;
		record.updatedAt = Date.now();

		await this.dataSource.performUpdate(
			table,
			record.id,
			currentVersion,
			record,
		);
	}

	protected prepareInsert<TTable extends VersionedTable>(
		table: TTable,
		id: string,
		data: Omit<TableRecord<TTable>, keyof VersionedRecord>,
	): InsertOperation<TTable> {
		const record = this.createVersionedRecord(id, data);
		return { type: 'insert', table, data: record };
	}

	protected prepareUpdate<TTable extends VersionedTable>(
		table: TTable,
		record: TableRecord<TTable>,
	): UpdateOperation<TTable> {
		const currentVersion = record.version;

		record.version += 1;
		record.updatedAt = Date.now();

		return { type: 'update', table, record, currentVersion };
	}

	protected prepareDeltaUpdates<TTable extends VersionedTable>(
		table: TTable,
		id: string,
		currentVersion: number,
		deltas: Partial<Record<KeysOfType<TableRecord<TTable>, number>, number>>,
	): DeltaOperation<TTable> {
		return {
			type: 'delta',
			table,
			id,
			currentVersion,
			deltas,
		};
	}
}
