import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { ErrorReporter } from '@bame/core';

export interface BameNodeHandlerOptions {
	path?: string;
	maxBodyBytes?: number;
	onError?: ErrorReporter;
}

/** Node/Connect bridge with bounded bodies, backpressure, and disconnect cleanup. */
export function createBameNodeHandler(
	fetch: (request: Request) => Response | Promise<Response>,
	options: BameNodeHandlerOptions = {},
) {
	const basePath = options.path ?? '/api/bame';
	const maxBodyBytes = options.maxBodyBytes ?? 65536;
	if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1)
		throw new Error('maxBodyBytes must be a positive safe integer');
	return async (
		req: IncomingMessage,
		res: ServerResponse,
		next?: () => void,
	): Promise<void> => {
		const abort = new AbortController();
		let streamError: unknown;
		const disconnect = () => {
			if (!res.writableFinished) abort.abort();
		};
		res.once('close', disconnect);
		req.once('aborted', disconnect);
		try {
			const url = new URL(
				req.url ?? '/',
				`http://${req.headers.host ?? 'localhost'}`,
			);
			if (url.pathname !== basePath) {
				if (next) next();
				else {
					res.writeHead(404);
					res.end();
				}
				return;
			}
			const tooLarge = () => {
				res.writeHead(413, {
					'Content-Type': 'application/json',
					Connection: 'close',
				});
				res.end(
					JSON.stringify({
						ok: false,
						error: 'Request body too large',
						code: 'BODY_TOO_LARGE',
					}),
				);
				req.resume();
			};
			let body: ArrayBuffer | undefined;
			if (req.method === 'POST') {
				if (Number(req.headers['content-length']) > maxBodyBytes) {
					tooLarge();
					return;
				}
				const chunks: Buffer[] = [];
				let size = 0;
				// Returning from the default iterator destroys the socket before a 413 can flush.
				for await (const chunk of req.iterator({ destroyOnReturn: false })) {
					const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
					size += buffer.length;
					if (size > maxBodyBytes) {
						tooLarge();
						return;
					}
					chunks.push(buffer);
				}
				body = new Uint8Array(Buffer.concat(chunks, size)).buffer;
			}
			const headers = new Headers();
			for (const [name, value] of Object.entries(req.headers)) {
				if (Array.isArray(value))
					for (const item of value) headers.append(name, item);
				else if (value !== undefined) headers.set(name, value);
			}
			const response = await fetch(
				new Request(url, {
					method: req.method,
					headers,
					body,
					signal: abort.signal,
				}),
			);
			if (abort.signal.aborted) {
				await response.body?.cancel();
				return;
			}
			res.statusCode = response.status;
			response.headers.forEach((value, name) => {
				if (name !== 'set-cookie') res.setHeader(name, value);
			});
			const cookies = response.headers.getSetCookie();
			if (cookies.length) res.setHeader('set-cookie', cookies);
			res.flushHeaders();
			if (!response.body) {
				res.end();
				return;
			}
			const source = Readable.fromWeb(
				response.body as NodeReadableStream<Uint8Array>,
			);
			source.once('error', (error) => {
				if (!abort.signal.aborted) streamError = error;
			});
			await pipeline(source, res, { signal: abort.signal });
		} catch (error) {
			if (!abort.signal.aborted || streamError) {
				try {
					options.onError?.(streamError ?? error, { operation: 'http.node' });
				} catch {
					/* Reporting cannot prevent cleanup. */
				}
				if (!res.headersSent) {
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							ok: false,
							error: 'Server error',
							code: 'INTERNAL_ERROR',
						}),
					);
				} else if (!res.destroyed) res.destroy();
			}
		} finally {
			res.removeListener('close', disconnect);
			req.removeListener('aborted', disconnect);
		}
	};
}
