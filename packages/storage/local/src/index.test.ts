import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VersionConflictError } from '@bame/core';
import { describe, expect, it } from 'vitest';
import { localFileStorage } from './index';

describe('@bame/storage-local', () => {
	it('should persist and reload documents across instances with CAS checks', async () => {
		const tmpFile = path.join(
			os.tmpdir(),
			`bame-local-store-${Date.now()}.json`,
		);
		try {
			const store1 = localFileStorage({ file: tmpFile });
			await store1.create('matches', { id: 'm1', version: 1, score: 42 });

			await store1.close();
			const store2 = localFileStorage({ file: tmpFile });
			const loaded = await store2.get<{ score: number }>('matches', 'm1');
			expect(loaded).toEqual({ id: 'm1', version: 1, score: 42 });

			await store2.update('matches', { id: 'm1', version: 2, score: 50 }, 1);
			await expect(
				store2.update('matches', { id: 'm1', version: 3, score: 60 }, 1),
			).rejects.toThrow(VersionConflictError);
			await store2.close();
		} finally {
			fs.rmSync(tmpFile, { force: true });
		}
	});

	it('reuses active writers for normalized paths and drains commits on close when reuseInProcess is enabled', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bame-reuse-'));
		const file = path.join(dir, 'store.json');
		const first = localFileStorage({ file, reuseInProcess: true });
		let reopened = first;
		try {
			expect(
				localFileStorage({
					file: path.join(dir, 'nested', '..', 'store.json'),
					reuseInProcess: true,
				}),
			).toBe(first);
			const write = first.create('profiles', {
				id: 'a',
				version: 1,
				displayName: 'A',
			});
			await Promise.all([write, first.close()]);
			reopened = localFileStorage({ file, reuseInProcess: true });
			expect(reopened).not.toBe(first);
			expect(await reopened.get('profiles', 'a')).toMatchObject({
				displayName: 'A',
			});
		} finally {
			await reopened.close();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
