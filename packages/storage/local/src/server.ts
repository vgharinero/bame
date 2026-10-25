import http from 'node:http';
import {
	type BameInstance,
	type CreateBameHandlerOptions,
	createBameHandler,
} from '@bame/core';

export interface ListenBameServerOptions extends CreateBameHandlerOptions {
	port?: number;
	path?: string;
}

/**
 * Start a standalone Node.js HTTP server for a `BameInstance` supporting both
 * JSON-RPC (`POST`) and Server-Sent Events (`GET ?channel=...`).
 */
export const listenBameServer = (
	bame: BameInstance,
	options: ListenBameServerOptions = {},
): Promise<{
	port: number;
	url: string;
	close: () => Promise<void>;
}> => {
	const handler = createBameHandler(bame, options);
	const basePath = options.path ?? '/api/bame';
	const requestedPort = options.port ?? 4000;

	const server = http.createServer(async (req, res) => {
		try {
			const fullUrl = new URL(
				req.url ?? '/',
				`http://${req.headers.host ?? `localhost:${requestedPort}`}`,
			);

			if (fullUrl.pathname !== basePath) {
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Not Found' }));
				return;
			}

			const abortController = new AbortController();
			res.on('close', () => {
				abortController.abort();
			});

			let bodyBuffer: Buffer | undefined;
			if (req.method === 'POST') {
				const chunks: Buffer[] = [];
				let bytes = 0;
				for await (const chunk of req) {
					bytes += Buffer.byteLength(chunk);
					if (bytes > (options.maxBodyBytes ?? 65536)) {
						res.writeHead(413, { 'Content-Type': 'application/json' });
						res.end(
							JSON.stringify({
								ok: false,
								error: 'Request body too large',
								code: 'BODY_TOO_LARGE',
							}),
						);
						return;
					}
					chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
				}
				bodyBuffer = Buffer.concat(chunks);
			}

			const webRequest = new Request(fullUrl.toString(), {
				method: req.method,
				headers: req.headers as Record<string, string>,
				body: bodyBuffer ? new Uint8Array(bodyBuffer) : undefined,
				signal: abortController.signal,
			});

			const webResponse = await handler.fetch(webRequest);

			res.statusCode = webResponse.status;
			webResponse.headers.forEach((value, key) => {
				res.setHeader(key, value);
			});
			res.flushHeaders();

			if (!webResponse.body) {
				res.end();
				return;
			}

			const reader = webResponse.body.getReader();
			try {
				while (!abortController.signal.aborted) {
					const { value, done } = await reader.read();
					if (done) break;
					res.write(value);
				}
			} catch {
				// Client disconnected
			} finally {
				res.end();
			}
		} catch (error) {
			bame.onError?.(error, { operation: 'http.node' });
			if (!res.headersSent) res.writeHead(500);
			res.end();
		}
	});

	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(requestedPort, () => {
			const addr = server.address();
			const actualPort =
				typeof addr === 'object' && addr ? addr.port : requestedPort;
			resolve({
				port: actualPort,
				url: `http://localhost:${actualPort}${basePath}`,
				close: () =>
					new Promise<void>((resClose, rejClose) =>
						server.close((err) => (err ? rejClose(err) : resClose())),
					),
			});
		});
	});
};
