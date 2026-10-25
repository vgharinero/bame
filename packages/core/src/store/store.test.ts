import { describe, expect, it, vi } from 'vitest';
import {
	MatchFeed,
	memoryRealtime,
	memoryStorage,
	VersionConflictError,
} from './index';

describe('memoryStorage', () => {
	it('should create, get, find, update with CAS, and delete documents', async () => {
		const store = memoryStorage();

		await store.create('lobbies', { id: 'l1', version: 1, status: 'open' });
		const fetched = await store.get<{ status: string }>('lobbies', 'l1');
		expect(fetched).toEqual({ id: 'l1', version: 1, status: 'open' });

		await store.update(
			'lobbies',
			{ id: 'l1', version: 2, status: 'started' },
			1,
		);
		const updated = await store.get<{ status: string }>('lobbies', 'l1');
		expect(updated?.version).toBe(2);

		await expect(
			store.update('lobbies', { id: 'l1', version: 3, status: 'started' }, 1),
		).rejects.toThrow(VersionConflictError);

		const found = await store.find<{ status: string }>('lobbies', {
			status: 'started',
		});
		expect(found).toHaveLength(1);

		await store.delete('lobbies', 'l1');
		expect(await store.get('lobbies', 'l1')).toBeNull();
	});
});

describe('memoryRealtime & MatchFeed', () => {
	it('should publish and unsubscribe cleanly', async () => {
		const rt = memoryRealtime();
		const received: number[] = [];
		const unsub = rt.subscribe<number>('chan', (n) => {
			received.push(n);
		});

		await rt.publish('chan', 1);
		await rt.publish('chan', 2);
		unsub();
		await rt.publish('chan', 3);

		expect(received).toEqual([1, 2]);
	});

	it('should ignore stale/duplicate snapshots and apply newer snapshots in MatchFeed', async () => {
		const changes: Array<{ state: string; version: number }> = [];
		const fetchLatest = vi.fn().mockResolvedValue({
			version: 5,
			view: 'v5-from-server',
		});

		const feed = new MatchFeed<string>({
			fetchLatest,
			onChange: (view, version) => changes.push({ state: view, version }),
		});

		expect(feed.receive({ version: 1, view: 'v1' })).toBe(true);
		expect(feed.receive({ version: 1, view: 'v1-dup' })).toBe(false);
		expect(feed.receive({ version: 0, view: 'v0-stale' })).toBe(false);
		expect(feed.receive({ version: 2, view: 'v2' })).toBe(true);

		await feed.refetch();
		expect(feed.version).toBe(5);
		expect(feed.view).toBe('v5-from-server');
		expect(changes.map((c) => c.version)).toEqual([1, 2, 5]);
	});
});
