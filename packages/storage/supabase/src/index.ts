import {
	type CollectionName,
	type Doc,
	jsonClone,
	type Realtime,
	type Storage,
	type StorageOperation,
	type SubscriptionOptions,
	type Unsubscribe,
	VersionConflictError,
	validateBatch,
} from '@bame/core';

/**
 * Minimal structural interface matching `@supabase/supabase-js` `SupabaseClient`
 * so `@bame/storage-supabase` works with any `@supabase/supabase-js` v2 client
 * using only the three standard tables (`lobbies`, `matches`, `profiles`).
 */
export interface SupabaseClientLike {
	from(table: string): {
		select(columns?: string): {
			eq(
				column: string,
				value: unknown,
			): PromiseLike<{
				data: Array<{ id: string; version: number; data: unknown }> | null;
				error: { message: string } | null;
			}> & {
				maybeSingle(): PromiseLike<{
					data: { id: string; version: number; data: unknown } | null;
					error: { message: string } | null;
				}>;
			};
		} & PromiseLike<{
			data: Array<{ id: string; version: number; data: unknown }> | null;
			error: { message: string } | null;
		}>;
		insert(row: Record<string, unknown>): PromiseLike<{
			error: { message: string; code?: string } | null;
		}>;
		update(row: Record<string, unknown>): {
			eq(
				col1: string,
				val1: unknown,
			): {
				eq(
					col2: string,
					val2: unknown,
				): {
					select(columns?: string): PromiseLike<{
						data: unknown[] | null;
						error: { message: string } | null;
					}>;
				};
			};
		};
		delete(): {
			eq(
				column: string,
				value: unknown,
			): PromiseLike<{ error: { message: string } | null }>;
		};
	};
	channel(
		name: string,
		options?: { config: { private: boolean } },
	): {
		on(
			type: 'broadcast',
			filter: { event: string },
			callback: (payload: { payload: unknown }) => void,
		): {
			subscribe(callback?: (status: string, error?: Error) => void): unknown;
		};
		send(message: {
			type: 'broadcast';
			event: string;
			payload: unknown;
		}): PromiseLike<unknown>;
		unsubscribe(): PromiseLike<unknown>;
	};
}

/**
 * Supabase Storage adapter for Bame (`lobbies`, `matches`, `profiles` tables).
 * Each table requires columns: `(id text primary key, version integer not null, data jsonb not null)`.
 */
export const supabaseStorage = (client: SupabaseClientLike): Storage => {
	const getDoc = async <T>(
		collection: CollectionName,
		id: string,
	): Promise<Doc<T> | null> => {
		const { data, error } = await client
			.from(collection)
			.select('id, version, data')
			.eq('id', id)
			.maybeSingle();

		if (error) {
			throw new Error(`Supabase get error in ${collection}: ${error.message}`);
		}
		if (!data) return null;

		return {
			...(data.data as T),
			id: data.id,
			version: data.version,
		};
	};

	const createDoc = async <T>(
		collection: CollectionName,
		doc: Doc<T>,
	): Promise<void> => {
		const payload = jsonClone(doc);
		const { error } = await client.from(collection).insert({
			id: payload.id,
			version: payload.version,
			data: payload,
		});
		if (error) {
			if (
				error.code === '23505' ||
				error.message.toLowerCase().includes('duplicate')
			) {
				throw new VersionConflictError(collection, doc.id, 0);
			}
			throw new Error(
				`Supabase create error in ${collection}: ${error.message}`,
			);
		}
	};

	const updateDoc = async <T>(
		collection: CollectionName,
		doc: Doc<T>,
		expectedVersion: number,
	): Promise<void> => {
		const payload = jsonClone(doc);
		const { data, error } = await client
			.from(collection)
			.update({
				version: payload.version,
				data: payload,
			})
			.eq('id', payload.id)
			.eq('version', expectedVersion)
			.select('id');

		if (error) {
			throw new Error(
				`Supabase update error in ${collection}: ${error.message}`,
			);
		}
		if (!data || data.length === 0) {
			throw new VersionConflictError(collection, doc.id, expectedVersion);
		}
	};

	const deleteDoc = async (
		collection: CollectionName,
		id: string,
	): Promise<void> => {
		const { error } = await client.from(collection).delete().eq('id', id);
		if (error) {
			throw new Error(
				`Supabase delete error in ${collection}: ${error.message}`,
			);
		}
	};

	const commit = async (
		operations: readonly StorageOperation[],
	): Promise<void> => {
		if (operations.length === 0) return;
		const ops = jsonClone(operations);
		const existing = await Promise.all(
			ops.map((op) =>
				getDoc(op.collection, op.type === 'delete' ? op.id : op.doc.id),
			),
		);
		validateBatch(ops, existing);

		const applied: Array<() => Promise<void>> = [];
		try {
			for (const [i, op] of ops.entries()) {
				const prev = existing[i];
				if (op.type === 'create') {
					await createDoc(op.collection, op.doc);
					applied.push(() => deleteDoc(op.collection, op.doc.id));
				} else if (op.type === 'update') {
					await updateDoc(op.collection, op.doc, op.expectedVersion);
					if (prev) {
						applied.push(async () => {
							await client
								.from(op.collection)
								.update({ version: prev.version, data: prev })
								.eq('id', prev.id)
								.eq('version', op.doc.version)
								.select('id');
						});
					}
				} else {
					await deleteDoc(op.collection, op.id);
					if (prev) {
						applied.push(async () => {
							await client.from(op.collection).insert({
								id: prev.id,
								version: prev.version,
								data: prev,
							});
						});
					}
				}
			}
		} catch (err) {
			for (const undo of applied.reverse()) {
				try {
					await undo();
				} catch {
					// Best-effort rollback
				}
			}
			throw err;
		}
	};

	return {
		commit,
		get: getDoc,
		async find<T>(
			collection: CollectionName,
			where?: Partial<T>,
		): Promise<Doc<T>[]> {
			const { data, error } = await client
				.from(collection)
				.select('id, version, data');

			if (error) {
				throw new Error(
					`Supabase find error in ${collection}: ${error.message}`,
				);
			}

			const docs = (data ?? []).map((row) => ({
				...(row.data as T),
				id: row.id,
				version: row.version,
			}));

			if (!where) return docs;

			return docs.filter((doc) =>
				Object.entries(where).every(
					([key, expected]) =>
						expected === undefined ||
						(doc as Record<string, unknown>)[key] === expected,
				),
			);
		},
		create: createDoc,
		update: updateDoc,
		delete: deleteDoc,
	};
};

/**
 * Supabase Realtime Broadcast adapter for Bame.
 */
export const supabaseRealtime = (client: SupabaseClientLike): Realtime => ({
	async publish<TPayload = unknown>(
		channelName: string,
		message: TPayload,
	): Promise<void> {
		const ch = client.channel(channelName, { config: { private: true } });
		const result = await ch.send({
			type: 'broadcast',
			event: 'bame:snapshot',
			payload: message,
		});
		await ch.unsubscribe();
		if (result !== undefined && result !== 'ok') {
			throw new Error('Realtime publish failed');
		}
	},

	subscribe<TPayload = unknown>(
		channelName: string,
		callback: (message: TPayload) => void | Promise<void>,
		options?: SubscriptionOptions,
	): Unsubscribe {
		const ch = client.channel(channelName, { config: { private: true } });
		ch.on('broadcast', { event: 'bame:snapshot' }, (envelope) => {
			void Promise.resolve()
				.then(() => callback(envelope.payload as TPayload))
				.catch((error) => options?.onError?.(error));
		}).subscribe((status, error) => {
			if (status === 'SUBSCRIBED') {
				void Promise.resolve()
					.then(() => options?.onReady?.())
					.catch((err) => options?.onError?.(err));
			} else if (
				status === 'CHANNEL_ERROR' ||
				status === 'TIMED_OUT' ||
				status === 'CLOSED'
			) {
				options?.onError?.(error ?? new Error(status));
			}
		});

		return () => {
			void ch.unsubscribe();
		};
	},
});
