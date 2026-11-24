import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineGame } from '../engine/index.js';
import { createBame } from './create-bame.js';
import { createBameClient, createBameHandler } from './network.js';
import { lobbyPresenceScope, matchPresenceScope } from './presence.js';

const dummyGame = defineGame({
	name: 'presence-dummy',
	players: { min: 2, max: 2 },
	setup: () => ({ ok: true }),
	moves: {
		pass: () => {},
	},
});

afterEach(() => vi.useRealTimers());

describe('presence service & remote transport', () => {
	it('tracks report/get, expires stale entries to offline, and notifies subscribers', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		const bame = createBame({ games: [dummyGame] });
		const seen: Array<Record<string, string>> = [];
		const unsub = bame.presence.subscribe('lobby:r1', (snapshot) => {
			seen.push(
				Object.fromEntries(
					Object.entries(snapshot.entries).map(([id, entry]) => [
						id,
						entry.status,
					]),
				),
			);
		});

		await bame.presence.report({
			scope: 'lobby:r1',
			userId: 'alice',
			status: 'online',
			ttlMs: 10_000,
		});
		await bame.presence.report({
			scope: 'lobby:r1',
			userId: 'bob',
			status: 'away',
			ttlMs: 10_000,
		});

		expect((await bame.presence.get('lobby:r1')).entries.alice.status).toBe(
			'online',
		);
		expect(seen).toEqual([{ alice: 'online' }, { bob: 'away' }]);

		vi.advanceTimersByTime(11_000);
		const expired = await bame.presence.get('lobby:r1');
		expect(expired.entries.alice.status).toBe('offline');
		expect(expired.entries.bob.status).toBe('offline');
		unsub();
	});

	it('authorizes lobby/match members over HTTP+SSE and marks offline on stream close', async () => {
		const bame = createBame({ games: [dummyGame] });
		const handler = createBameHandler(bame, { unsafeTrustClientIds: true });
		const clientFetch = (input: RequestInfo | URL, init?: RequestInit) =>
			handler.fetch(new Request(input, init));

		const alice = createBameClient({
			url: 'http://localhost/api/bame',
			userId: 'alice',
			fetch: clientFetch,
		});
		const bob = createBameClient({
			url: 'http://localhost/api/bame',
			userId: 'bob',
			fetch: clientFetch,
		});
		const outsider = createBameClient({
			url: 'http://localhost/api/bame',
			userId: 'eve',
			fetch: clientFetch,
		});

		const lobby = await alice.lobbies.create({
			userId: 'alice',
			game: dummyGame.name,
		});
		await bob.lobbies.join({ userId: 'bob', lobbyId: lobby.id });

		const scope = lobbyPresenceScope(lobby.id);
		await expect(
			outsider.presence.report({
				scope,
				userId: 'eve',
				status: 'online',
			}),
		).rejects.toMatchObject({ code: 'FORBIDDEN' });

		const bobReceived: Array<Record<string, string>> = [];
		let bobReady = false;
		const stopBob = bob.presence.subscribe(
			scope,
			(snapshot) => {
				bobReceived.push(
					Object.fromEntries(
						Object.entries(snapshot.entries).map(([id, e]) => [id, e.status]),
					),
				);
			},
			{
				onReady: () => {
					bobReady = true;
				},
			},
		);

		let aliceReady = false;
		const stopAlice = alice.presence.subscribe(scope, () => {}, {
			onReady: () => {
				aliceReady = true;
			},
		});

		await vi.waitFor(() => expect(bobReady && aliceReady).toBe(true));

		await alice.presence.report({ scope, userId: 'alice', status: 'online' });
		await vi.waitFor(() =>
			expect(bobReceived.some((r) => r.alice === 'online')).toBe(true),
		);

		// Closing Alice's presence SSE stream triggers offline broadcast
		stopAlice();
		await vi.waitFor(() =>
			expect(bobReceived.some((r) => r.alice === 'offline')).toBe(true),
		);
		stopBob();

		// Match presence scope authorization check
		const match = await alice.lobbies.start({
			userId: 'alice',
			lobbyId: lobby.id,
		});
		const mScope = matchPresenceScope(match.id);
		const snap = await bob.presence.report({
			scope: mScope,
			userId: 'bob',
			status: 'away',
		});
		expect(snap.entries.bob.status).toBe('away');
	});
});
