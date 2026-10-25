import {
	type CollectionName,
	type Doc,
	jsonClone,
	type Storage,
	type StorageOperation,
	validateBatch,
} from '@bame/core';

export interface FirestoreDocumentSnapLike {
	exists: boolean;
	data(): Record<string, unknown> | undefined;
}

export interface FirestoreDocRefLike {
	get(): Promise<FirestoreDocumentSnapLike>;
	set(data: Record<string, unknown>): Promise<unknown>;
	delete(): Promise<unknown>;
}

export interface FirestoreQueryLike {
	where(field: string, op: '==', value: unknown): FirestoreQueryLike;
	get(): Promise<{ docs: FirestoreDocumentSnapLike[] }>;
}

export interface FirestoreCollectionLike extends FirestoreQueryLike {
	doc(id: string): FirestoreDocRefLike;
}

export interface FirestoreTransactionLike {
	delete(ref: FirestoreDocRefLike): unknown;
	get(ref: FirestoreDocRefLike): Promise<FirestoreDocumentSnapLike>;
	set(ref: FirestoreDocRefLike, data: Record<string, unknown>): unknown;
}

export interface FirestoreLike {
	collection(name: string): FirestoreCollectionLike;
	runTransaction<T>(
		updateFn: (tx: FirestoreTransactionLike) => Promise<T>,
	): Promise<T>;
}

/**
 * Firestore Storage adapter for Bame (`lobbies`, `matches`, `profiles` collections)
 * with transactional optimistic concurrency (`expectedVersion`).
 */
export const firestoreStorage = (db: FirestoreLike): Storage => {
	const commit = async (operations: readonly StorageOperation[]) => {
		const ops = jsonClone(operations);
		const refs = ops.map((op) =>
			db
				.collection(op.collection)
				.doc(op.type === 'delete' ? op.id : op.doc.id),
		);
		await db.runTransaction(async (tx) => {
			const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
			validateBatch(
				ops,
				snapshots.map((snap) =>
					snap.exists ? (snap.data() as Doc<unknown>) : null,
				),
			);
			ops.forEach((op, i) => {
				if (op.type === 'delete') tx.delete(refs[i]);
				else tx.set(refs[i], op.doc);
			});
		});
	};
	return {
		commit,
		async get<T>(
			collection: CollectionName,
			id: string,
		): Promise<Doc<T> | null> {
			const snap = await db.collection(collection).doc(id).get();
			if (!snap.exists) return null;
			const data = snap.data();
			return data ? (structuredClone(data) as unknown as Doc<T>) : null;
		},

		async find<T>(
			collection: CollectionName,
			where?: Partial<T>,
		): Promise<Doc<T>[]> {
			let query: FirestoreQueryLike = db.collection(collection);
			if (where) {
				for (const [key, value] of Object.entries(where)) {
					if (value !== undefined) {
						query = query.where(key, '==', value);
					}
				}
			}
			const snap = await query.get();
			return snap.docs
				.map((d) => d.data())
				.filter((d): d is Record<string, unknown> => Boolean(d))
				.map((d) => structuredClone(d) as unknown as Doc<T>);
		},

		create: (collection, doc) => commit([{ type: 'create', collection, doc }]),
		update: (collection, doc, expectedVersion) =>
			commit([{ type: 'update', collection, doc, expectedVersion }]),
		async delete(collection, id) {
			const snap = await db.collection(collection).doc(id).get();
			if (snap.exists)
				await commit([
					{
						type: 'delete',
						collection,
						id,
						expectedVersion: snap.data()?.version as number,
					},
				]);
		},
	};
};
