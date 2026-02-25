import type { DataSource } from './data-source';

export abstract class Storage {
	constructor(protected dataSource: DataSource) {}

	protected generateId = () => 'id';
}
