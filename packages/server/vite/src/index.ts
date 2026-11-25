import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import {
	type BameNodeHandlerOptions,
	createBameNodeHandler,
} from '@bame/server-node';

export interface BameFetchHandler {
	fetch(request: Request): Response | Promise<Response>;
}

export interface BameVitePluginOptions extends BameNodeHandlerOptions {
	/** Server module path exporting the handler factory. Default: `'/src/server/handler.ts'`. */
	entry?: string;
	/** Exported factory name returning `{ fetch }`. Default: `'buildBameHandler'`. */
	exportName?: string;
	/** Deduplicated packages passed to Vite's preview `runnerImport`. */
	dedupe?: string[];
}

type ConnectMiddleware = (
	req: IncomingMessage,
	res: ServerResponse,
	next: () => void,
) => void;

interface ViteDevServerLike {
	middlewares: { use(fn: ConnectMiddleware): unknown };
	ssrLoadModule(url: string): Promise<Record<string, unknown>>;
}

interface VitePreviewServerLike {
	config: { root: string };
	middlewares: { use(fn: ConnectMiddleware): unknown };
}

function resolveFactory(
	mod: Record<string, unknown>,
	exportName: string,
	entry: string,
): () => BameFetchHandler {
	const factory = mod[exportName];
	if (typeof factory !== 'function') {
		throw new Error(
			`Expected "${entry}" to export a function named "${exportName}"`,
		);
	}
	return factory as () => BameFetchHandler;
}

/**
 * Vite dev & preview plugin mounting a Bame Fetch handler at `/api/bame`
 * (or `options.path`) via `createBameNodeHandler`.
 */
export function bameVitePlugin(options: BameVitePluginOptions = {}) {
	const {
		entry = '/src/server/handler.ts',
		exportName = 'buildBameHandler',
		dedupe = ['react', 'react-dom', '@bame/core'],
		trustProxy = true,
		...nodeOptions
	} = options;
	const handlerOptions: BameNodeHandlerOptions = {
		...nodeOptions,
		trustProxy,
	};

	return {
		name: 'bame-api',
		configureServer(server: ViteDevServerLike) {
			server.middlewares.use(
				createBameNodeHandler(async (request) => {
					const mod = await server.ssrLoadModule(entry);
					return resolveFactory(mod, exportName, entry)().fetch(request);
				}, handlerOptions),
			);
		},
		async configurePreviewServer(server: VitePreviewServerLike) {
			const vite = (await import('vite' as string)) as {
				runnerImport: <T>(
					id: string,
					opts: {
						root: string;
						configFile: false;
						resolve: { dedupe: string[] };
					},
				) => Promise<{ module: T }>;
			};
			const resolvedEntry = path.resolve(
				server.config.root,
				entry.replace(/^\/+/, ''),
			);
			const { module } = await vite.runnerImport<Record<string, unknown>>(
				resolvedEntry,
				{
					root: server.config.root,
					configFile: false,
					resolve: { dedupe },
				},
			);
			const handler = resolveFactory(module, exportName, entry)();
			server.middlewares.use(
				createBameNodeHandler(
					(request) => handler.fetch(request),
					handlerOptions,
				),
			);
		},
	};
}
