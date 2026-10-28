import http from 'node:http';
import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createBameNodeHandler } from './node-handler.js';

const servers: http.Server[] = [];
async function serve(
	handler: Parameters<typeof createBameNodeHandler>[0],
	options: Parameters<typeof createBameNodeHandler>[1] = {},
) {
	const server = http.createServer(createBameNodeHandler(handler, options));
	servers.push(server);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	return `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
}
afterEach(async () => {
	for (const server of servers.splice(0)) {
		const closed = new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
		server.closeAllConnections();
		await closed;
	}
});

it('routes exact paths, forwards request headers/body and response cookies', async () => {
	const handler = vi.fn(async (request: Request) => {
		const response = Response.json({
			body: await request.json(),
			identity: request.headers.get('x-bame-user-id'),
		});
		response.headers.append('set-cookie', 'one=1');
		response.headers.append('set-cookie', 'two=2');
		return response;
	});
	const origin = await serve(handler);
	expect((await fetch(`${origin}/api/bame-other`)).status).toBe(404);
	const response = await fetch(`${origin}/api/bame?query=1`, {
		method: 'POST',
		headers: { 'x-bame-user-id': 'guest' },
		body: JSON.stringify({ test: true }),
	});
	expect(await response.json()).toEqual({
		body: { test: true },
		identity: 'guest',
	});
	expect(response.headers.getSetCookie()).toEqual(['one=1', 'two=2']);
	expect(handler).toHaveBeenCalledTimes(1);
});

it.each([true, false])(
	'returns 413 before invoking the handler for oversized bodies (content-length=%s)',
	async (length) => {
		const handler = vi.fn(() => Response.json({ ok: true }));
		const origin = await serve(handler, { maxBodyBytes: 16 });
		const response = await new Promise<{ status: number; text: string }>(
			(resolve, reject) => {
				const request = http.request(
					`${origin}/api/bame`,
					{ method: 'POST', headers: length ? { 'content-length': '32' } : {} },
					(response) => {
						let text = '';
						response.on('data', (chunk) => (text += chunk));
						response.on('end', () =>
							resolve({ status: response.statusCode!, text }),
						);
					},
				);
				request.on('error', reject);
				request.write('x'.repeat(32));
				request.end();
			},
		);
		expect(response.status).toBe(413);
		expect(JSON.parse(response.text).code).toBe('BODY_TOO_LARGE');
		expect(handler).not.toHaveBeenCalled();
	},
);

it('cancels a blocked response stream and aborts its request on disconnect', async () => {
	let cancelled!: () => void;
	const stopped = new Promise<void>((resolve) => (cancelled = resolve));
	let signal!: AbortSignal;
	const origin = await serve((request) => {
		signal = request.signal;
		return new Response(
			new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('ready'));
				},
				cancel() {
					cancelled();
				},
			}),
		);
	});
	const response = await fetch(`${origin}/api/bame`);
	const reader = response.body!.getReader();
	await reader.read();
	await reader.cancel();
	await stopped;
	expect(signal.aborted).toBe(true);
});

it('reports exceptions safely even if the reporter itself throws', async () => {
	const onError = vi.fn(() => {
		throw new Error('Reporting failed');
	});
	const origin = await serve(
		() => {
			throw new Error('Private diagnostic');
		},
		{ onError },
	);
	const response = await fetch(`${origin}/api/bame`);
	expect(response.status).toBe(500);
	expect(await response.json()).toEqual({
		ok: false,
		code: 'INTERNAL_ERROR',
		error: 'Server error',
	});
	expect(onError).toHaveBeenCalledTimes(1);
});

it('applies backpressure rather than exhausting a fast producer for a paused client', async () => {
	let produced = 0;
	let cancel!: () => void;
	const cancelled = new Promise<void>((resolve) => (cancel = resolve));
	const chunk = new Uint8Array(65536);
	const origin = await serve(
		() =>
			new Response(
				new ReadableStream({
					pull(controller) {
						controller.enqueue(chunk);
						if (++produced === 1000) controller.close();
					},
					cancel() {
						cancel();
					},
				}),
			),
	);
	const request = http.get(`${origin}/api/bame`);
	const [response] = (await once(request, 'response')) as [
		http.IncomingMessage,
	];
	response.pause();
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(produced).toBeLessThan(1000);
	request.destroy();
	await cancelled;
});

it('reports a failed producer even when pipeline cleanup closes the response socket', async () => {
	const onError = vi.fn();
	const origin = await serve(
		() =>
			new Response(
				new ReadableStream({
					pull(controller) {
						controller.error(new Error('Producer failed'));
					},
				}),
			),
		{ onError },
	);
	await fetch(`${origin}/api/bame`)
		.then((response) => response.text())
		.catch(() => {});
	expect(onError).toHaveBeenCalledWith(
		expect.objectContaining({ message: 'Producer failed' }),
		{ operation: 'http.node' },
	);
});
