import type { Serializable } from '../../primitives';

type ForeignKeyRef = {
	table: string;
	column: string;
	onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
	onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
};

type InferColumnType<T> = T extends string
	? 'TEXT' // Variable-length string
	: T extends number
		? 'INTEGER' | 'BIGINT' // Depending on size/precision needs
		: T extends boolean
			? 'BOOLEAN' // True/false
			: T extends Serializable
				? 'JSONB' // JSON with indexing support
				: never;

type ColumnDef<TValue = unknown> = {
	type: InferColumnType<TValue>;
	primaryKey?: boolean;
	null?: boolean;
	unique?: boolean;
	references?: ForeignKeyRef;
	check?: string;
};

export type TableSchema<TRecord = Record<string, unknown>> = {
	tableName: string;
	columns: {
		[K in keyof TRecord]: ColumnDef<TRecord[K]>;
	};
	_record: TRecord; // For type inference only, not used at runtime
};
