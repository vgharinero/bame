import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '../engine/index.js';
import {
	createWebhookDispatcher,
	getNewlyWaitingPlayers,
	WEBHOOK_TIMEOUT_MS,
} from './notifications.js';

function matchSnapshot(
	waitingFor?: string[],
	status: Match['status'] = 'active',
): Match {
	return {
		id: 'm1',
		version: 1,
		game: 'test',
		seed: 'seed',
		rngState: 1,
		players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
		config: undefined,
		state: {},
		turn: {
			number: 1,
			currentPlayerId: 'a',
			phase: 'play',
			waitingFor,
		},
		status,
		createdAt: 0,
		updatedAt: 0,
	};
}

describe('notifications helpers', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('returns only newly required players, deduplicated and excluding already-notified recipients', () => {
		const previousMatch = matchSnapshot(['a']);
		const match = matchSnapshot(['a', 'b', 'b', 'c']);
		expect(
			getNewlyWaitingPlayers(
				{ playerId: 'a', previousMatch, match },
				new Set(['c']),
			),
		).toEqual(['b']);

		expect(
			getNewlyWaitingPlayers({
				playerId: 'b',
				previousMatch: matchSnapshot(['b', 'c']),
				match: matchSnapshot(['c']),
			}),
		).toEqual([]);

		expect(
			getNewlyWaitingPlayers({
				playerId: 'a',
				previousMatch,
				match: matchSnapshot(['b'], 'finished'),
			}),
		).toEqual([]);
	});

	it('dispatches bounded webhook requests with idempotency keys and rejects failures', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await createWebhookDispatcher(undefined)('turn_reminder', {});
		expect(fetch).not.toHaveBeenCalled();

		const cancel = vi.fn();
		fetch.mockResolvedValueOnce(
			new Response(new ReadableStream({ cancel }), { status: 200 }),
		);
		await createWebhookDispatcher('https://notify.example/events')(
			'match_end',
			{ matchId: 'm1' },
			'evt-1',
		);
		const [url, options] = fetch.mock.calls[0];
		expect(url).toBe('https://notify.example/events');
		expect(options).toMatchObject({
			method: 'POST',
			redirect: 'error',
			headers: { 'Idempotency-Key': 'evt-1' },
		});
		expect(cancel).toHaveBeenCalledOnce();

		const timeout = vi.spyOn(AbortSignal, 'timeout');
		fetch.mockResolvedValueOnce(new Response('fail', { status: 503 }));
		await expect(
			createWebhookDispatcher('https://notify.example')('turn_reminder', {}),
		).rejects.toThrow('HTTP 503');
		expect(timeout).toHaveBeenCalledWith(WEBHOOK_TIMEOUT_MS);
	});
});
