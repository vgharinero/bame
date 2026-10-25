import { VersionConflictError } from '@bame/core';
import { describe, expect, it } from 'vitest';
import {
	type FirestoreDocRefLike,
	type FirestoreDocumentSnapLike,
	type FirestoreLike,
	firestoreStorage,
} from './index';

const createMockFirestore = (): FirestoreLike => {
	const store = new Map<string, Map<string, Record<string, unknown>>>();
	const getCol = (name: string) => {
		let col = store.get(name);
		if (!col) {
			col = new Map();
			store.set(name, col);
		}
		return col;
	};

	const makeDocRef = (colName: string, id: string): FirestoreDocRefLike => ({
		async get(): Promise<FirestoreDocumentSnapLike> {
			const data = getCol(colName).get(id);
			return {
				exists: Boolean(data),
				data: () => (data ? structuredClone(data) : undefined),
			};
		},
		async set(data: Record<string, unknown>) {
			getCol(colName).set(id, structuredClone(data));
		},
		async delete() {
			getCol(colName).delete(id);
		},
	});

	return {
		collection(name: string) {
			const filters: Array<[string, unknown]> = [];
			const buildQuery = () => ({
				where(field: string, _op: '==', value: unknown) {
					filters.push([field, value]);
					return buildQuery();
				},
				async get() {
					const docs = Array.from(getCol(name).values())
						.filter((doc) => filters.every(([k, v]) => doc[k] === v))
						.map((doc) => ({
							exists: true,
							data: () => structuredClone(doc),
						}));
					return { docs };
				},
				doc(id: string) {
					return makeDocRef(name, id);
				},
			});
			return buildQuery();
		},
		async runTransaction(updateFn) {
			return updateFn({
				get: (ref) => ref.get(),
				delete: (ref) => ref.delete(),
				set: (ref, data) => {
					void ref.set(data);
				},
			});
		},
	};
};

describe('@bame/storage-firestore', () => {
	it('performs CRUD and enforces expectedVersion CAS in transactions', async () => {
		const storage = firestoreStorage(createMockFirestore());

		await storage.create('lobbies', { id: 'l1', version: 1, status: 'open' });
		expect(await storage.get('lobbies', 'l1')).toEqual({
			id: 'l1',
			version: 1,
			status: 'open',
		});

		await storage.update(
			'lobbies',
			{ id: 'l1', version: 2, status: 'started' },
			1,
		);
		await expect(
			storage.update('lobbies', { id: 'l1', version: 3, status: 'started' }, 1),
		).rejects.toThrow(VersionConflictError);

		const found = await storage.find<{ status: string }>('lobbies', {
			status: 'started',
		});
		expect(found).toHaveLength(1);

		await storage.delete('lobbies', 'l1');
		expect(await storage.get('lobbies', 'l1')).toBeNull();
	});
});
