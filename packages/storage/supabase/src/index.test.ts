import { VersionConflictError } from '@bame/core';
import { describe, expect, it } from 'vitest';
import {
	type SupabaseClientLike,
	supabaseRealtime,
	supabaseStorage,
} from './index';

const createMockSupabase = (): SupabaseClientLike => {
	const tables = new Map<
		string,
		Map<string, { id: string; version: number; data: unknown }>
	>();
	const channels = new Map<
		string,
		Array<(payload: { payload: unknown }) => void>
	>();

	const getTable = (name: string) => {
		let t = tables.get(name);
		if (!t) {
			t = new Map();
			tables.set(name, t);
		}
		return t;
	};

	return {
		from(table: string) {
			const t = getTable(table);
			return {
				select() {
					const allRows = () => Array.from(t.values());
					return {
						// biome-ignore lint/suspicious/noThenProperty: mock Supabase PromiseLike query builder
						then(onfulfilled) {
							return Promise.resolve({
								data: allRows(),
								error: null,
							}).then(onfulfilled);
						},
						eq(col: string, val: unknown) {
							const filtered = allRows().filter(
								(r) => (r as Record<string, unknown>)[col] === val,
							);
							return {
								// biome-ignore lint/suspicious/noThenProperty: mock Supabase PromiseLike query builder
								then(onfulfilled) {
									return Promise.resolve({
										data: filtered,
										error: null,
									}).then(onfulfilled);
								},
								async maybeSingle() {
									return {
										data: filtered[0] ?? null,
										error: null,
									};
								},
							};
						},
					};
				},
				async insert(row: Record<string, unknown>) {
					const id = row.id as string;
					if (t.has(id)) {
						return {
							error: { message: 'Duplicate primary key', code: '23505' },
						};
					}
					t.set(id, {
						id,
						version: row.version as number,
						data: structuredClone(row.data),
					});
					return { error: null };
				},
				update(row: Record<string, unknown>) {
					return {
						eq(col1: string, val1: unknown) {
							return {
								eq(col2: string, val2: unknown) {
									return {
										async select() {
											const matched: unknown[] = [];
											for (const [id, existing] of t.entries()) {
												const rec = existing as Record<string, unknown>;
												if (rec[col1] === val1 && rec[col2] === val2) {
													t.set(id, {
														id,
														version: row.version as number,
														data: structuredClone(row.data),
													});
													matched.push({ id });
												}
											}
											return { data: matched, error: null };
										},
									};
								},
							};
						},
					};
				},
				delete() {
					return {
						async eq(_col: string, val: unknown) {
							t.delete(val as string);
							return { error: null };
						},
					};
				},
			};
		},
		channel(name: string) {
			return {
				on(_type, _filter, callback) {
					const list = channels.get(name) ?? [];
					list.push(callback);
					channels.set(name, list);
					return {
						subscribe: (ready) => {
							queueMicrotask(() => ready?.('SUBSCRIBED'));
							return {};
						},
					};
				},
				async send(msg) {
					for (const cb of channels.get(name) ?? []) {
						cb({ payload: msg.payload });
					}
				},
				async unsubscribe() {
					channels.delete(name);
				},
			};
		},
	};
};

describe('@bame/storage-supabase', () => {
	it('performs CRUD, CAS version checks, atomic commit, and realtime broadcast pub/sub', async () => {
		const mockClient = createMockSupabase();
		const storage = supabaseStorage(mockClient);
		const realtime = supabaseRealtime(mockClient);

		await storage.create('matches', { id: 'm1', version: 1, turn: 1 });
		expect(await storage.get('matches', 'm1')).toEqual({
			id: 'm1',
			version: 1,
			turn: 1,
		});

		await storage.update('matches', { id: 'm1', version: 2, turn: 2 }, 1);
		await expect(
			storage.update('matches', { id: 'm1', version: 3, turn: 3 }, 1),
		).rejects.toThrow(VersionConflictError);

		await storage.commit([
			{
				type: 'update',
				collection: 'matches',
				doc: { id: 'm1', version: 3, turn: 3 },
				expectedVersion: 2,
			},
			{
				type: 'create',
				collection: 'lobbies',
				doc: { id: 'l1', version: 1, status: 'started' },
			},
		]);
		expect(await storage.get('lobbies', 'l1')).toEqual({
			id: 'l1',
			version: 1,
			status: 'started',
		});

		const received: unknown[] = [];
		const unsub = realtime.subscribe('match:m1', (msg) => {
			received.push(msg);
		});
		await realtime.publish('match:m1', { hello: 'world' });
		expect(received).toEqual([{ hello: 'world' }]);
		unsub();
	});
});
