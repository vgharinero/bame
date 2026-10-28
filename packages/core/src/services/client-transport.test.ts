import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBameClient } from './network.js';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { resolve, promise };
}
const ok = (data: unknown = null) => Response.json({ ok: true, data });
const url = 'http://localhost/api/bame';
afterEach(() => vi.useRealTimers());

describe('explicit remote subscription identity', () => {
	it('does not infer the caller from profile writes or lobby reads', async () => {
		const calls: string[] = [];
		const client = createBameClient({
			url,
			fetch: async (input, init) => {
				if (init?.method === 'POST') return ok();
				calls.push(String(input));
				return new Response(null, { status: 403 });
			},
		});
		await client.profiles.ensure('bob');
		await client.lobbies.get('room', 'alice');
		const denied = deferred<unknown>();
		const stop = client.lobbies.subscribe('room', () => {}, {
			userId: 'alice',
			onError: denied.resolve,
		});
		expect(await denied.promise).toMatchObject({
			code: 'FORBIDDEN',
			httpStatus: 403,
		});
		expect(new URL(calls[0]).searchParams.get('userId')).toBe('alice');
		stop();
	});
	it('supports a client default identity without inferring previous callers', async () => {
		let streamUrl = '';
		const client = createBameClient({
			url,
			userId: 'alice',
			fetch: async (input) => {
				streamUrl = String(input);
				return new Response(null, { status: 403 });
			},
		});
		const denied = deferred<unknown>();
		const stop = client.lobbies.subscribe('room', () => {}, {
			onError: denied.resolve,
		});
		await denied.promise;
		expect(new URL(streamUrl).searchParams.get('userId')).toBe('alice');
		stop();
	});
	it.each([
		[400, 'INVALID_REQUEST'],
		[401, 'UNAUTHORIZED'],
		[403, 'FORBIDDEN'],
		[404, 'NOT_FOUND'],
	] as const)(
		'normalizes HTTP %s with no JSON body for both RPC and SSE',
		async (status, code) => {
			const client = createBameClient({
				url,
				fetch: async () => new Response(null, { status }),
			});
			await expect(client.lobbies.list()).rejects.toMatchObject({
				code,
				httpStatus: status,
			});
			const denied = deferred<unknown>();
			const stop = client.lobbies.subscribe('room', () => {}, {
				onError: denied.resolve,
			});
			expect(await denied.promise).toMatchObject({ code, httpStatus: status });
			stop();
		},
	);
});

describe('request deadlines and cancellation', () => {
	it('times out a custom fetch that ignores abort', async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | undefined;
		const client = createBameClient({
			url,
			requestTimeoutMs: 25,
			fetch: async (_url, init) => {
				signal = init?.signal ?? undefined;
				return new Promise<Response>(() => {});
			},
		});
		const result = expect(client.lobbies.list()).rejects.toMatchObject({
			code: 'REQUEST_TIMEOUT',
		});
		await vi.advanceTimersByTimeAsync(25);
		await result;
		expect(signal?.aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('cancels one scope without poisoning the original client', async () => {
		const controller = new AbortController();
		const started = deferred<void>();
		const fetch = vi.fn(async (_url, init?: RequestInit) => {
			if (init?.signal?.aborted) throw init.signal.reason;
			if (fetch.mock.calls.length === 1) {
				started.resolve();
				return new Promise<Response>(() => {});
			}
			return ok([]);
		});
		const client = createBameClient({ url, fetch });
		const scoped = client.withOptions({ signal: controller.signal });
		const result = expect(scoped.lobbies.list()).rejects.toMatchObject({
			code: 'REQUEST_ABORTED',
		});
		await started.promise;
		controller.abort();
		await result;
		expect(await client.lobbies.list()).toEqual([]);
	});
	it('does not send a request if cancellation occurs while resolving headers', async () => {
		vi.useFakeTimers();
		const headers = deferred<Record<string, string>>();
		const fetch = vi.fn();
		const client = createBameClient({
			url,
			requestTimeoutMs: 25,
			headers: () => headers.promise,
			fetch,
		});
		const result = expect(client.lobbies.list()).rejects.toMatchObject({
			code: 'REQUEST_TIMEOUT',
		});
		await vi.advanceTimersByTimeAsync(25);
		await result;
		headers.resolve({ Authorization: 'Bearer late' });
		await vi.advanceTimersByTimeAsync(0);
		expect(fetch).not.toHaveBeenCalled();
	});
	it('bounds stalled JSON bodies as well as connection establishment', async () => {
		vi.useFakeTimers();
		const body = deferred<unknown>();
		const response = ok();
		response.json = () => body.promise;
		const client = createBameClient({
			url,
			requestTimeoutMs: 25,
			fetch: async () => response,
		});
		const result = expect(client.lobbies.list()).rejects.toMatchObject({
			code: 'REQUEST_TIMEOUT',
		});
		await vi.advanceTimersByTimeAsync(25);
		await result;
		body.resolve({ ok: true, data: [] });
	});
	it('keeps mutation request IDs across retries and on timeout', async () => {
		vi.useFakeTimers();
		const ids: string[] = [];
		const client = createBameClient({
			url,
			requestTimeoutMs: 150,
			fetch: async (_url, init) => {
				ids.push(JSON.parse(String(init?.body)).args[0].requestId);
				throw new Error('offline');
			},
		});
		const result = expect(
			client.matches.move({
				userId: 'alice',
				matchId: 'match',
				move: 'play',
				expectedVersion: 1,
				requestId: 'retry-me',
			}),
		).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', requestId: 'retry-me' });
		await vi.advanceTimersByTimeAsync(150);
		await result;
		expect(ids).toEqual(['retry-me', 'retry-me']);
	});
	it('rejects an already aborted scope without calling fetch', async () => {
		const controller = new AbortController();
		controller.abort();
		const fetch = vi.fn();
		await expect(
			createBameClient({
				url,
				signal: controller.signal,
				fetch,
			}).lobbies.list(),
		).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('streaming auth and connection lifetime', () => {
	it('resolves current headers for RPC and every reconnect, and cancels an idle reader', async () => {
		vi.useFakeTimers();
		let token = 'old';
		const headers: string[] = [];
		const bodies: ReadableStreamDefaultController<Uint8Array>[] = [];
		const cancelled = vi.fn();
		const client = createBameClient({
			url,
			requestTimeoutMs: 25,
			headers: () => ({ Authorization: `Bearer ${token}` }),
			fetch: async (_url, init) => {
				headers.push(new Headers(init?.headers).get('Authorization')!);
				if (init?.method === 'POST') return ok([]);
				return new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							bodies.push(controller);
							controller.enqueue(
								new TextEncoder().encode('event: ready\ndata: {}\n\n'),
							);
						},
						cancel: cancelled,
					}),
					{ headers: { 'Content-Type': 'text/event-stream' } },
				);
			},
		});
		await client.lobbies.list();
		let readyCount = 0;
		const stop = client.lobbies.subscribe('room', () => {}, {
			userId: 'alice',
			onReady: () => {
				readyCount++;
			},
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(readyCount).toBe(1);
		// An established stream must outlive the connection deadline.
		await vi.advanceTimersByTimeAsync(100);
		expect(bodies).toHaveLength(1);
		token = 'new';
		bodies[0].close();
		await vi.advanceTimersByTimeAsync(500);
		expect(readyCount).toBe(2);
		expect(headers).toEqual(['Bearer old', 'Bearer old', 'Bearer new']);
		stop();
		await vi.advanceTimersByTimeAsync(0);
		expect(cancelled).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});
	it('times out a stalled connection and stops reconnecting when its scope is aborted', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const failed = vi.fn();
		const fetch = vi.fn(async () => new Promise<Response>(() => {}));
		const client = createBameClient({
			url,
			requestTimeoutMs: 25,
			signal: controller.signal,
			fetch,
		});
		const stop = client.lobbies.subscribe('room', () => {}, {
			onError: failed,
		});
		await vi.advanceTimersByTimeAsync(25);
		expect(failed).toHaveBeenCalledWith(
			expect.objectContaining({ code: 'REQUEST_TIMEOUT' }),
		);
		controller.abort();
		await vi.advanceTimersByTimeAsync(1000);
		expect(fetch).toHaveBeenCalledOnce();
		stop();
		expect(vi.getTimerCount()).toBe(0);
	});
});
