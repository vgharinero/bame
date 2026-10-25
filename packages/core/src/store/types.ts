export type CollectionName = 'lobbies' | 'matches' | 'profiles';

export type Doc<T> = T & {
	id: string;
	version: number;
};

export class VersionConflictError extends Error {
	constructor(
		public readonly collection: CollectionName,
		public readonly id: string,
		public readonly expectedVersion: number,
		public readonly actualVersion?: number,
	) {
		super(
			`Version conflict in ${collection}/${id}: expected version ${expectedVersion}${
				actualVersion !== undefined ? `, got ${actualVersion}` : ''
			}`,
		);
		this.name = 'VersionConflictError';
	}
}

export interface Storage {
	commit(operations: readonly StorageOperation[]): Promise<void>;
	get<T>(collection: CollectionName, id: string): Promise<Doc<T> | null>;
	find<T>(collection: CollectionName, where?: Partial<T>): Promise<Doc<T>[]>;
	create<T>(collection: CollectionName, doc: Doc<T>): Promise<void>;
	update<T>(
		collection: CollectionName,
		doc: Doc<T>,
		expectedVersion: number,
	): Promise<void>;
	delete(collection: CollectionName, id: string): Promise<void>;
}

export type Unsubscribe = () => void;

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous batch docs
export type StorageOperation<T = any> =
	| { type: 'create'; collection: CollectionName; doc: Doc<T> }
	| {
			type: 'update';
			collection: CollectionName;
			doc: Doc<T>;
			expectedVersion: number;
	  }
	| {
			type: 'delete';
			collection: CollectionName;
			id: string;
			expectedVersion: number;
	  };

export interface SubscriptionOptions {
	onReady?: () => void | Promise<void>;
	onError?: (error: unknown) => void;
}

export interface Realtime {
	publish<TPayload = unknown>(
		channel: string,
		message: TPayload,
	): Promise<void>;
	subscribe<TPayload = unknown>(
		channel: string,
		callback: (message: TPayload) => void | Promise<void>,
		options?: SubscriptionOptions,
	): Unsubscribe;
}
