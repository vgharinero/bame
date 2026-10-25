import { validateBatch } from './batch.js';
import { jsonClone } from './json.js';
import type {
	CollectionName,
	Doc,
	Realtime,
	Storage,
	StorageOperation,
	SubscriptionOptions,
	Unsubscribe,
} from './types.js';

export const memoryStorage = (
	initial?: Partial<Record<CollectionName, Doc<unknown>[]>>,
): Storage => {
	const collections: Record<CollectionName, Map<string, Doc<unknown>>> = {
		lobbies: new Map(),
		matches: new Map(),
		profiles: new Map(),
	};
	for (const collection of ['lobbies', 'matches', 'profiles'] as const)
		for (const doc of initial?.[collection] ?? []) {
			if (
				!doc.id ||
				!Number.isSafeInteger(doc.version) ||
				doc.version < 1 ||
				collections[collection].has(doc.id)
			)
				throw new Error('Invalid stored document');
			collections[collection].set(doc.id, jsonClone(doc));
		}
	const commit = async (operations: readonly StorageOperation[]) => {
		const ops = jsonClone(operations);
		validateBatch(
			ops,
			ops.map(
				(op) =>
					collections[op.collection].get(
						op.type === 'delete' ? op.id : op.doc.id,
					) ?? null,
			),
		);
		for (const op of ops) {
			if (op.type === 'delete') collections[op.collection].delete(op.id);
			else collections[op.collection].set(op.doc.id, op.doc);
		}
	};
	return {
		commit,
		async get<T>(collection: CollectionName, id: string) {
			return jsonClone(
				collections[collection].get(id) ?? null,
			) as Doc<T> | null;
		},
		async find<T>(collection: CollectionName, where?: Partial<T>) {
			return [...collections[collection].values()]
				.filter(
					(doc) =>
						!where ||
						Object.entries(where).every(
							([k, v]) =>
								v === undefined || (doc as Record<string, unknown>)[k] === v,
						),
				)
				.map((doc) => jsonClone(doc) as Doc<T>);
		},
		create: (collection, doc) => commit([{ type: 'create', collection, doc }]),
		update: (collection, doc, expectedVersion) =>
			commit([{ type: 'update', collection, doc, expectedVersion }]),
		async delete(collection, id) {
			const doc = collections[collection].get(id);
			if (doc)
				await commit([
					{ type: 'delete', collection, id, expectedVersion: doc.version },
				]);
		},
	};
};

/**
 * Pure in-memory Realtime implementation using a Map of subscriber Sets
 * (zero `node:events` dependency; works in browsers, Edge workers, and Node).
 */
export const memoryRealtime = (): Realtime => {
	// biome-ignore lint/suspicious/noExplicitAny: internal listener set
	const channels = new Map<string, Set<(payload: any) => void>>();

	return {
		async publish<TPayload = unknown>(
			channel: string,
			message: TPayload,
		): Promise<void> {
			const listeners = channels.get(channel);
			if (!listeners) return;
			for (const listener of listeners) {
				listener(structuredClone(message));
			}
		},

		subscribe<TPayload = unknown>(
			channel: string,
			callback: (message: TPayload) => void | Promise<void>,
			options?: SubscriptionOptions,
		): Unsubscribe {
			let listeners = channels.get(channel);
			if (!listeners) {
				listeners = new Set();
				channels.set(channel, listeners);
			}
			const wrapped = (payload: TPayload) => {
				void Promise.resolve()
					.then(() => callback(payload))
					.catch((error) => options?.onError?.(error));
			};
			listeners.add(wrapped);
			queueMicrotask(() => {
				if (listeners?.has(wrapped))
					void Promise.resolve()
						.then(() => options?.onReady?.())
						.catch((error) => options?.onError?.(error));
			});
			return () => {
				listeners?.delete(wrapped);
				if (listeners && listeners.size === 0) {
					channels.delete(channel);
				}
			};
		},
	};
};
