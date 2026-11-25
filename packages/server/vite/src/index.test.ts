import { once } from 'node:events';
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { bameVitePlugin } from './index.js';

const servers: http.Server[] = [];
afterEach(async () => {
	for (const server of servers.splice(0)) {
		const closed = new Promise<void>((resolve, reject) =>
			server.close((err) => (err ? reject(err) : resolve())),
		);
		server.closeAllConnections();
		await closed;
	}
});

it('mounts the SSR handler module on configureServer with trustProxy enabled by default', async () => {
	const middlewares: Array<
		(
			req: http.IncomingMessage,
			res: http.ServerResponse,
			next: () => void,
		) => void
	> = [];
	const buildBameHandler = vi.fn(() => ({
		fetch: async (request: Request) =>
			Response.json({ url: request.url, method: request.method }),
	}));
	const plugin = bameVitePlugin({ entry: '/src/custom/handler.ts' });
	plugin.configureServer({
		middlewares: { use: (fn) => middlewares.push(fn) },
		ssrLoadModule: async (id) => {
			expect(id).toBe('/src/custom/handler.ts');
			return { buildBameHandler };
		},
	});

	const server = http.createServer((req, res) => {
		middlewares[0](req, res, () => {
			res.writeHead(404);
			res.end();
		});
	});
	servers.push(server);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const port = (server.address() as import('node:net').AddressInfo).port;

	const res = await fetch(`http://127.0.0.1:${port}/api/bame`, {
		headers: {
			'x-forwarded-proto': 'https',
			'x-forwarded-host': 'proxy.example',
		},
	});
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({
		url: 'https://proxy.example/api/bame',
		method: 'GET',
	});
	expect(buildBameHandler).toHaveBeenCalledOnce();
});
