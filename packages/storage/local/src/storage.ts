import fs from 'node:fs';
import path from 'node:path';
import {
	type CollectionName,
	type Doc,
	memoryStorage,
	type Storage,
	type StorageOperation,
} from '@bame/core';

export interface LocalFileStorageOptions {
	file: string;
}

export interface LocalFileStorage extends Storage {
	close(): Promise<void>;
}

/** Single writer. Close before reopening; stale PID locks are recovered on restart. */
export const localFileStorage = (
	options: LocalFileStorageOptions,
): LocalFileStorage => {
	const file = path.resolve(options.file);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const lock = `${file}.lock`;
	if (fs.existsSync(lock)) {
		const owner = JSON.parse(fs.readFileSync(lock, 'utf8')) as { pid: number };
		let alive = true;
		try {
			process.kill(owner.pid, 0);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false;
		}
		if (alive) throw new Error('Storage file already has an active writer');
		fs.unlinkSync(lock);
	}
	const token = JSON.stringify({
		pid: process.pid,
		id: globalThis.crypto.randomUUID(),
	});
	fs.writeFileSync(lock, token, { flag: 'wx' });
	const release = () => {
		if (fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === token)
			fs.unlinkSync(lock);
	};
	let store: Storage;
	try {
		const raw = fs.existsSync(file)
			? JSON.parse(fs.readFileSync(file, 'utf8'))
			: {};
		if (!raw || typeof raw !== 'object' || Array.isArray(raw))
			throw new Error('Invalid storage file');
		const initial: Partial<Record<CollectionName, Doc<unknown>[]>> = {};
		for (const col of ['lobbies', 'matches', 'profiles'] as const) {
			if (
				raw[col] !== undefined &&
				(!raw[col] || typeof raw[col] !== 'object' || Array.isArray(raw[col]))
			)
				throw new Error('Invalid storage collection');
			initial[col] = Object.entries(raw[col] ?? {}).map(([id, doc]) => {
				if ((doc as Doc<unknown>)?.id !== id)
					throw new Error('Invalid document key');
				return doc as Doc<unknown>;
			});
		}
		store = memoryStorage(initial);
	} catch (error) {
		release();
		throw error;
	}
	let queue = Promise.resolve();
	let closed = false;
	const commit = (operations: readonly StorageOperation[]): Promise<void> => {
		if (closed) return Promise.reject(new Error('Storage is closed'));
		const ops = structuredClone(operations);
		const task = queue.then(async () => {
			const initial: Partial<Record<CollectionName, Doc<unknown>[]>> = {};
			for (const col of ['lobbies', 'matches', 'profiles'] as const)
				initial[col] = await store.find(col);
			const next = memoryStorage(initial);
			await next.commit(ops);
			const snapshot: Record<string, unknown> = {};
			for (const col of ['lobbies', 'matches', 'profiles'] as const)
				snapshot[col] = Object.fromEntries(
					(await next.find(col)).map((doc) => [doc.id, doc]),
				);
			const temporary = `${file}.${globalThis.crypto.randomUUID()}.tmp`;
			try {
				const handle = await fs.promises.open(temporary, 'wx');
				try {
					await handle.writeFile(JSON.stringify(snapshot));
					await handle.sync();
				} finally {
					await handle.close();
				}
				await fs.promises.rename(temporary, file);
				store = next;
			} finally {
				await fs.promises.rm(temporary, { force: true });
			}
		});
		queue = task.catch(() => {});
		return task;
	};
	return {
		commit,
		get: (collection, id) => store.get(collection, id),
		find: (collection, where) => store.find(collection, where),
		create: (collection, doc) => commit([{ type: 'create', collection, doc }]),
		update: (collection, doc, expectedVersion) =>
			commit([{ type: 'update', collection, doc, expectedVersion }]),
		async delete(collection, id) {
			const doc = await store.get(collection, id);
			if (doc)
				await commit([
					{ type: 'delete', collection, id, expectedVersion: doc.version },
				]);
		},
		async close() {
			closed = true;
			await queue;
			release();
		},
	};
};
