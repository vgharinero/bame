import fs from 'node:fs/promises';
import path from 'node:path';
import type {
	AtomicOperation,
	DataSource,
	TableName,
	TableRecord,
} from '@bame/core/storage';

export class LocalDataSource implements DataSource {
	// Root map: table name -> map of records by id
	private storage: Map<string, Map<string, unknown>> = new Map();
	private filePath?: string;

	constructor(filePath?: string) {
		this.filePath = filePath;
	}

	async initialize() {
		if (this.filePath) {
			try {
				const data = await fs.readFile(this.filePath, 'utf-8');
				const parsed = JSON.parse(data);
				for (const [table, records] of Object.entries(parsed)) {
					const recordMap = new Map<string, unknown>();
					for (const [id, record] of Object.entries(
						records as Record<string, unknown>,
					)) {
						recordMap.set(id, record);
					}
					this.storage.set(table, recordMap);
				}
			} catch (e: any) {
				if (e.code !== 'ENOENT') {
					console.error('Failed to load local DB', e);
				}
			}
		}
	}

	private async persist() {
		if (!this.filePath) return;
		const out: Record<string, Record<string, unknown>> = {};
		for (const [table, records] of this.storage.entries()) {
			out[table] = {};
			for (const [id, record] of records.entries()) {
				out[table][id] = record;
			}
		}
		// Ensure dir exists
		await fs
			.mkdir(path.dirname(this.filePath), { recursive: true })
			.catch(() => {});
		await fs.writeFile(this.filePath, JSON.stringify(out, null, 2), 'utf-8');
	}

	private getTableMap(table: string) {
		let t = this.storage.get(table);
		if (!t) {
			t = new Map();
			this.storage.set(table, t);
		}
		return t;
	}

	async performGet<TTable extends TableName>(
		table: TTable,
		id: string,
	): Promise<TableRecord<TTable> | null> {
		const t = this.getTableMap(table);
		return (t.get(id) as TableRecord<TTable>) || null;
	}

	async performGetByField<TTable extends TableName>(
		table: TTable,
		field: keyof TableRecord<TTable>,
		value: unknown,
	): Promise<TableRecord<TTable> | null> {
		const t = this.getTableMap(table);
		for (const record of t.values()) {
			if ((record as any)[field] === value) {
				return record as TableRecord<TTable>;
			}
		}
		return null;
	}

	async performGetAll<TTable extends TableName>(
		table: TTable,
	): Promise<TableRecord<TTable>[]> {
		return Array.from(
			this.getTableMap(table).values(),
		) as TableRecord<TTable>[];
	}

	async performGetMany<TTable extends TableName>(
		table: TTable,
		ids: string[],
	): Promise<TableRecord<TTable>[]> {
		const t = this.getTableMap(table);
		return ids.map((id) => t.get(id)).filter(Boolean) as TableRecord<TTable>[];
	}

	async performGetManyByField<TTable extends TableName>(
		table: TTable,
		field: keyof TableRecord<TTable>,
		value: unknown,
	): Promise<TableRecord<TTable>[]> {
		const t = this.getTableMap(table);
		const results: TableRecord<TTable>[] = [];
		for (const record of t.values()) {
			if ((record as any)[field] === value) {
				results.push(record as TableRecord<TTable>);
			}
		}
		return results;
	}

	async performInsert<TTable extends TableName>(
		table: TTable,
		entity: TableRecord<TTable>,
	): Promise<void> {
		const t = this.getTableMap(table);
		t.set((entity as any).id, { ...entity });
		await this.persist();
	}

	async performUpdate<TTable extends TableName>(
		table: TTable,
		id: string,
		updatedEntity: TableRecord<TTable>,
	): Promise<void> {
		const t = this.getTableMap(table);
		t.set(id, { ...updatedEntity });
		await this.persist();
	}

	async performDelete<TTable extends TableName>(
		table: TTable,
		id: string,
	): Promise<void> {
		const t = this.getTableMap(table);
		t.delete(id);
		await this.persist();
	}

	async performAtomic(operations: AtomicOperation<TableName>[]): Promise<void> {
		// Extremely naive memory-based "atomic" operation processing
		// We execute line by line, if something fails midway, we don't have true rollback here
		// unless we deep clone the store. For local caching/dev it's usually enough.
		for (const op of operations) {
			const t = this.getTableMap(op.table);
			if (op.type === 'insert') {
				t.set((op.record as any).id, { ...op.record });
			} else if (op.type === 'update') {
				t.set((op.record as any).id, { ...op.record });
			} else if (op.type === 'delete') {
				t.delete(op.id);
			} else if (op.type === 'delta') {
				const existing = t.get(op.id) as any;
				if (existing) {
					for (const [key, amount] of Object.entries(op.deltas)) {
						if (amount != null) {
							existing[key] = (existing[key] || 0) + amount;
						}
					}
				}
			}
		}
		await this.persist();
	}
}
