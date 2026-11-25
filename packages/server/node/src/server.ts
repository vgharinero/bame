import http from 'node:http';
import {
	type BameInstance,
	type CreateBameHandlerOptions,
	createBameHandler,
} from '@bame/core';
import { createBameNodeHandler } from './node-handler.js';

export interface ListenBameServerOptions extends CreateBameHandlerOptions {
	port?: number;
	path?: string;
	trustProxy?: boolean;
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

	const server = http.createServer(
		createBameNodeHandler(handler.fetch, {
			path: basePath,
			maxBodyBytes: options.maxBodyBytes,
			onError: bame.onError,
			trustProxy: options.trustProxy,
		}),
	);

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
					new Promise<void>((resClose, rejClose) => {
						server.close((err) => (err ? rejClose(err) : resClose()));
						server.closeAllConnections();
					}),
			});
		});
	});
};
