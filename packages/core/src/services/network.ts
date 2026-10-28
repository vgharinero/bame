import { BameError } from '../engine/errors.js';
import type {
	GameNotification,
	Match,
	MatchView,
	MoveMap,
} from '../engine/index.js';
import type { Unsubscribe, VersionedSnapshot } from '../store/index.js';
import type { SubscriptionOptions } from '../store/types.js';
import { bestEffort } from './errors.js';
import {
	type BameInstance,
	type BameRuntime,
	type CreateLobbyInput,
	type CloseLobbyInput,
	type RematchLobbyInput,
	type JoinLobbyByCodeInput,
	type JoinLobbyInput,
	type LeaveLobbyInput,
	type ListMatchesFilter,
	type Lobby,
	lobbyChannel,
	type MatchActionInput,
	type MoveInput,
	matchPlayerChannel,
	type Profile,
	profileChannel,
	type SetReadyInput,
	type StartLobbyInput,
	type UpdateProfileInput,
	userNotificationChannel,
} from './index.js';
import type { MoveResult } from './matches.js';
import { HttpError, identifier, validateRpc } from './rpc-validation.js';
import { delay, readSse } from './sse.js';

export type RpcAction =
	| { service: 'lobbies'; method: 'create'; args: [CreateLobbyInput] }
	| {
			service: 'lobbies';
			method: 'get';
			args: [lobbyId: string, userId?: string];
	  }
	| { service: 'lobbies'; method: 'list'; args: [gameName?: string] }
	| { service: 'lobbies'; method: 'join'; args: [JoinLobbyInput] }
	| { service: 'lobbies'; method: 'joinByCode'; args: [JoinLobbyByCodeInput] }
	| { service: 'lobbies'; method: 'setReady'; args: [SetReadyInput] }
	| { service: 'lobbies'; method: 'leave'; args: [LeaveLobbyInput] }
	| { service: 'lobbies'; method: 'start'; args: [StartLobbyInput] }
	| { service: 'lobbies'; method: 'close'; args: [CloseLobbyInput] }
	| { service: 'lobbies'; method: 'rematch'; args: [RematchLobbyInput] }
	| {
			service: 'matches';
			method: 'get';
			args: [matchId: string, userId?: string | null];
	  }
	| {
			service: 'matches';
			method: 'list';
			args: [filter?: ListMatchesFilter];
	  }
	| { service: 'matches'; method: 'move'; args: [MoveInput] }
	| { service: 'matches'; method: 'undo'; args: [MatchActionInput] }
	| { service: 'matches'; method: 'forfeit'; args: [MatchActionInput] }
	| {
			service: 'profiles';
			method: 'ensure';
			args: [userId: string, defaults?: UpdateProfileInput];
	  }
	| { service: 'profiles'; method: 'get'; args: [userId: string] }
	| { service: 'profiles'; method: 'list'; args: [] }
	| {
			service: 'profiles';
			method: 'update';
			args: [userId: string, updates: UpdateProfileInput];
	  };

export interface CreateBameHandlerOptions {
	getUserId?: (req: Request) => string | null | Promise<string | null>;
	unsafeTrustClientIds?: true;
	canSpectate?: (context: {
		request: Request;
		userId: string | null;
		match: Match;
	}) => boolean | Promise<boolean>;
	maxBodyBytes?: number;
	allowedOrigins?: readonly string[];
}
export interface BameServerHandlers {
	fetch: (req: Request) => Promise<Response>;
	GET: (req: Request) => Promise<Response>;
	POST: (req: Request) => Promise<Response>;
}
const profileView = (p: Profile | null) =>
	p
		? {
				id: p.id,
				version: p.version,
				displayName: p.displayName,
				avatarUrl: p.avatarUrl,
				stats: p.stats,
				statsByGame: p.statsByGame,
				createdAt: p.createdAt,
				updatedAt: p.updatedAt,
			}
		: null;
const lobbyView = (l: Lobby | null) =>
	l
		? {
				id: l.id,
				version: l.version,
				game: l.game,
				hostId: l.hostId,
				status: l.status,
				isPublic: l.isPublic,
				code: l.code,
				minPlayers: l.minPlayers,
				maxPlayers: l.maxPlayers,
				config: l.config,
				members: l.members,
				matchId: l.matchId,
				createdAt: l.createdAt,
				updatedAt: l.updatedAt,
			}
		: null;

export const createBameHandler = (
	bame: BameInstance,
	options: CreateBameHandlerOptions = {},
): BameServerHandlers => {
	if (
		(typeof options.getUserId === 'function') ===
		(options.unsafeTrustClientIds === true)
	)
		throw new Error(
			'Provide getUserId or explicitly set unsafeTrustClientIds: true',
		);
	const maxBytes = options.maxBodyBytes ?? 65536;
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
		throw new Error('Invalid maxBodyBytes');
	const fail = (status: number, code: string, message: string): never => {
		throw new HttpError(status, code, message);
	};
	const identity = async (
		req: Request,
		claimed?: string | null,
		required = true,
	) => {
		const user = options.getUserId ? await options.getUserId(req) : claimed;
		if (!user) {
			if (required) fail(401, 'UNAUTHORIZED', 'Unauthorized');
			return null;
		}
		if (!identifier(user))
			fail(401, 'UNAUTHORIZED', 'Invalid session identity');
		if (options.getUserId && claimed && user !== claimed)
			fail(403, 'FORBIDDEN', 'Forbidden: cannot impersonate another player');
		return user as string;
	};
	const authorizeMatch = async (
		req: Request,
		id: string,
		user: string | null,
	) => {
		const match = await bame.storage.get<Match>('matches', id);
		if (!match) return fail(404, 'NOT_FOUND', 'Match not found');
		if (user && match.players.some((p) => p.id === user)) return user;
		if (await options.canSpectate?.({ request: req, userId: user, match }))
			return null;
		return fail(403, 'FORBIDDEN', 'Forbidden: match membership required');
	};
	const dispatch = async (
		req: Request,
		action: RpcAction,
	): Promise<unknown> => {
		if (action.service === 'lobbies') {
			if (action.method === 'list')
				return (await bame.lobbies.list(action.args[0] ?? undefined)).map(
					lobbyView,
				);
			if (action.method === 'get') {
				const user = await identity(req, action.args[1], false);
				const lobby = await bame.storage.get<Lobby>('lobbies', action.args[0]);
				if (
					lobby &&
					!lobby.isPublic &&
					!lobby.members.some((m) => m.userId === user)
				)
					fail(403, 'FORBIDDEN', 'Forbidden: private lobby');
				return lobbyView(lobby);
			}
			const input = action.args[0];
			const user = await identity(req, input.userId);
			const trusted = { ...input, userId: user as string };
			switch (action.method) {
				case 'create':
					return lobbyView(
						await bame.lobbies.create(trusted as CreateLobbyInput),
					);
				case 'join':
					return lobbyView(await bame.lobbies.join(trusted as JoinLobbyInput));
				case 'joinByCode':
					return lobbyView(
						await bame.lobbies.joinByCode(trusted as JoinLobbyByCodeInput),
					);
				case 'setReady':
					return lobbyView(
						await bame.lobbies.setReady(trusted as SetReadyInput),
					);
				case 'leave':
					return lobbyView(
						await bame.lobbies.leave(trusted as LeaveLobbyInput),
					);
				case 'close':
					return lobbyView(
						await bame.lobbies.close(trusted as CloseLobbyInput),
					);
				case 'rematch':
					return lobbyView(
						await bame.lobbies.rematch(trusted as RematchLobbyInput),
					);
				case 'start': {
					const match = await bame.lobbies.start(trusted as StartLobbyInput);
					return bame.matches.get(match.id, user);
				}
			}
		}
		if (action.service === 'matches') {
			if (action.method === 'get') {
				const user = await identity(req, action.args[1], false);
				const viewer = await authorizeMatch(req, action.args[0], user);
				return bame.matches.get(action.args[0], viewer);
			}
			if (action.method === 'list') {
				const filter = action.args[0] ?? {};
				const user = await identity(req, filter.userId);
				if (filter.waitingForUserId && filter.waitingForUserId !== user)
					fail(403, 'FORBIDDEN', 'Forbidden: another player filter');
				return bame.matches.list({ ...filter, userId: user as string });
			}
			const input = action.args[0];
			const user = await identity(req, input.userId);
			const trusted = { ...input, userId: user as string };
			if (action.method === 'move')
				return bame.matches.move(trusted as MoveInput);
			if (action.method === 'undo') return bame.matches.undo(trusted);
			return bame.matches.forfeit(trusted);
		}
		if (action.method === 'list')
			return (await bame.profiles.list()).map(profileView);
		if (action.method === 'get')
			return profileView(await bame.profiles.get(action.args[0]));
		const user = await identity(req, action.args[0]);
		return profileView(
			action.method === 'ensure'
				? await bame.profiles.ensure(
						user as string,
						action.args[1] ?? undefined,
					)
				: await bame.profiles.update(user as string, action.args[1] ?? {}),
		);
	};
	const post = async (req: Request) => {
		if (
			req.headers.get('content-type')?.split(';')[0].trim() !==
			'application/json'
		)
			fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected application/json');
		if (Number(req.headers.get('content-length')) > maxBytes)
			fail(413, 'BODY_TOO_LARGE', 'Request body too large');
		const reader = req.body?.getReader();
		let length = 0;
		const parts: Uint8Array[] = [];
		if (reader)
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					length += value.length;
					if (length > maxBytes) {
						await reader.cancel();
						fail(413, 'BODY_TOO_LARGE', 'Request body too large');
					}
					parts.push(value);
				}
			} finally {
				reader.releaseLock();
			}
		const bytes = new Uint8Array(length);
		let offset = 0;
		for (const part of parts) {
			bytes.set(part, offset);
			offset += part.length;
		}
		let body: unknown;
		try {
			body = JSON.parse(new TextDecoder().decode(bytes));
		} catch {
			fail(400, 'INVALID_JSON', 'Invalid JSON');
		}
		const action = validateRpc(body);
		const data = await dispatch(req, action);
		return Response.json({ ok: true, data });
	};
	const get = async (req: Request) => {
		const url = new URL(req.url);
		const channel = url.searchParams.get('channel') ?? '';
		const match = /^match:([^:]+):player:([^:]+)$/.exec(channel),
			lobby = /^lobby:([^:]+)$/.exec(channel),
			profile = /^profile:([^:]+)$/.exec(channel),
			notification = /^user:([^:]+):notifications$/.exec(channel);
		if (!match && !lobby && !profile && !notification)
			fail(400, 'INVALID_CHANNEL', 'Unknown subscription channel');
		const decode = (value: string) => {
			try {
				return decodeURIComponent(value);
			} catch {
				return fail(400, 'INVALID_CHANNEL', 'Invalid channel identifier');
			}
		};
		const owner = match
			? decode(match[2])
			: notification
				? decode(notification[1])
				: undefined;
		const resource = decode(
			(match ?? lobby ?? profile ?? notification)?.[1] ?? '',
		);
		const authorize = async () => {
			const user = await identity(
				req,
				owner ??
					(options.unsafeTrustClientIds
						? url.searchParams.get('userId')
						: undefined),
				Boolean(owner),
			);
			if (match) {
				const viewer = await authorizeMatch(req, resource, user);
				if (viewer !== owner)
					fail(403, 'FORBIDDEN', 'Forbidden player channel');
			}
			if (lobby) {
				const current = await bame.storage.get<Lobby>('lobbies', resource);
				if (!current) return fail(404, 'NOT_FOUND', 'Lobby not found');
				if (
					!current.isPublic &&
					!current.members.some((m) => m.userId === user)
				)
					fail(403, 'FORBIDDEN', 'Forbidden private lobby');
			}
		};
		await authorize();
		const snapshot = async () =>
			match
				? await bame.matches.get(resource, owner)
				: lobby
					? lobbyView(
							await bame.lobbies.get(
								resource,
								options.unsafeTrustClientIds
									? (url.searchParams.get('userId') ?? undefined)
									: ((await options.getUserId?.(req)) ?? undefined),
							),
						)
					: profile
						? profileView(await bame.profiles.get(resource))
						: undefined;
		let unsub: Unsubscribe = () => {};
		let closed = false;
		let timer: ReturnType<typeof setInterval> | undefined;
		let dispose = () => {};
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				const send = (data: unknown, event?: string) => {
					if (!closed)
						controller.enqueue(
							encoder.encode(
								(event ? `event: ${event}\n` : '') +
									'data: ' +
									JSON.stringify(data) +
									'\n\n',
							),
						);
				};
				dispose = () => {
					if (closed) return;
					closed = true;
					unsub();
					clearInterval(timer);
					req.signal.removeEventListener('abort', dispose);
					try {
						controller.close();
					} catch {}
				};
				const error = (err: unknown) => {
					if (closed) return;
					send(
						{ code: err instanceof HttpError ? err.code : 'STREAM_ERROR' },
						'error',
					);
					dispose();
				};
				let serial = Promise.resolve();
				const emit = (payload?: unknown) => {
					serial = serial
						.then(async () => {
							if (closed) return;
							await authorize();
							if (notification) {
								if (payload) send(payload);
							} else {
								const current = await snapshot();
								if (match) {
									const view = current as MatchView;
									send({ version: view.version, view });
								} else send(current);
							}
						})
						.catch(error);
					return serial;
				};
				unsub = bame.realtime.subscribe(channel, (payload) => emit(payload), {
					onReady: async () => {
						await emit();
						send({}, 'ready');
					},
					onError: error,
				});
				timer = setInterval(() => {
					void authorize()
						.then(() => {
							if (!closed)
								controller.enqueue(encoder.encode(': heartbeat\n\n'));
						})
						.catch(error);
				}, 15000);
				req.signal.addEventListener('abort', dispose, { once: true });
				if (req.signal.aborted) dispose();
			},
			cancel() {
				dispose();
			},
		});
		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
			},
		});
	};
	const fetch = async (req: Request): Promise<Response> => {
		const origin = req.headers.get('origin');
		const permitted =
			!origin ||
			origin === new URL(req.url).origin ||
			options.allowedOrigins?.includes(origin);
		if (!permitted)
			return Response.json(
				{ ok: false, error: 'Origin not allowed', code: 'FORBIDDEN' },
				{ status: 403 },
			);
		let response: Response;
		try {
			if (req.method === 'OPTIONS')
				response = new Response(null, { status: 204 });
			else if (req.method === 'GET') response = await get(req);
			else if (req.method === 'POST') response = await post(req);
			else
				response = Response.json(
					{
						ok: false,
						error: 'Method not allowed',
						code: 'METHOD_NOT_ALLOWED',
					},
					{ status: 405, headers: { Allow: 'GET, POST, OPTIONS' } },
				);
		} catch (error) {
			if (!(error instanceof HttpError) && !(error instanceof BameError))
				await bestEffort(
					() => {
						throw error;
					},
					{ operation: 'http.request' },
					bame.onError,
				);
			response = Response.json(
				{
					ok: false,
					error:
						error instanceof HttpError || error instanceof BameError
							? error.message
							: 'Server error',
					code:
						error instanceof HttpError || error instanceof BameError
							? error.code
							: 'INTERNAL_ERROR',
					...(error instanceof BameError && error.params !== undefined
						? { params: error.params }
						: {}),
				},
				{
					status:
						error instanceof HttpError
							? error.status
							: error instanceof BameError
								? 400
								: 500,
				},
			);
		}
		if (origin) {
			response.headers.set('Access-Control-Allow-Origin', origin);
			response.headers.set('Vary', 'Origin');
			response.headers.set('Access-Control-Allow-Credentials', 'true');
			response.headers.set(
				'Access-Control-Allow-Methods',
				'GET, POST, OPTIONS',
			);
			response.headers.set(
				'Access-Control-Allow-Headers',
				'Content-Type, Authorization, Accept',
			);
		}
		return response;
	};
	return { fetch, GET: fetch, POST: fetch };
};

export class BameTransportError extends Error {
	constructor(
		message: string,
		public requestId?: string,
		public code?: string,
		public params?: Record<string, unknown>,
	) {
		super(message);
	}
}
export interface BameClientRuntime extends BameRuntime {
	lobbies: Omit<BameRuntime['lobbies'], 'start'> & {
		start(input: StartLobbyInput): Promise<MatchView>;
	};
}
export interface CreateBameClientOptions {
	/** Base URL of the Bame server endpoint (e.g., 'http://localhost:4000/api/bame' or '/api/bame') */
	url: string;
	/** Optional custom fetch implementation (useful for testing or custom headers) */
	fetch?: typeof globalThis.fetch;
	/** Optional static or dynamic request headers (e.g. `{ Authorization: 'Bearer ...' }`) */
	headers?:
		| Record<string, string>
		| (() => Record<string, string> | Promise<Record<string, string>>);
	/** Optional fetch credentials mode (e.g. `'include'` or `'same-origin'` for cookies) */
	credentials?: RequestInit['credentials'];
}

/**
 * Create a remote client implementing `BameRuntime` that talks to a `createBameHandler`
 * endpoint over standard `fetch` + SSE streaming.
 * Works in both browsers (`@bame/ui-react`) and Node.js terminals (`@bame/ui-console`).
 */
export const createBameClient = (
	options: CreateBameClientOptions,
): BameClientRuntime => {
	const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

	const resolveHeaders = async (
		base: Record<string, string>,
	): Promise<Record<string, string>> => {
		if (!options.headers) return base;
		const custom =
			typeof options.headers === 'function'
				? await options.headers()
				: options.headers;
		return { ...base, ...custom };
	};

	let lastUserId: string | undefined;
	const rpc = async <TResult>(action: RpcAction): Promise<TResult> => {
		const isAction =
			action.service === 'matches' &&
			['move', 'undo', 'forfeit'].includes(action.method);
		if (isAction) {
			const input = action.args[0] as MatchActionInput;
			const next = {
				...input,
				requestId: input.requestId ?? crypto.randomUUID(),
			};
			if (next.expectedVersion === undefined) {
				const latest = await rpc<MatchView>({
					service: 'matches',
					method: 'get',
					args: [input.matchId, input.userId],
				});
				next.expectedVersion = latest.version;
			}
			action = { ...action, args: [next] } as RpcAction;
		}
		if (
			action.service === 'lobbies' &&
			!['get', 'list'].includes(action.method)
		)
			lastUserId = (action.args[0] as CreateLobbyInput).userId;
		if (isAction) lastUserId = (action.args[0] as MatchActionInput).userId;
		if (
			action.service === 'profiles' &&
			['ensure', 'update'].includes(action.method)
		)
			lastUserId = action.args[0] as string;
		const body = JSON.stringify(action);
		const requestId = isAction
			? (action.args[0] as MatchActionInput).requestId
			: undefined;
		for (let attempt = 0; ; attempt++) {
			let res: Response;
			try {
				res = await fetchImpl(options.url, {
					method: 'POST',
					headers: await resolveHeaders({ 'Content-Type': 'application/json' }),
					credentials: options.credentials,
					body,
				});
			} catch (error) {
				if (isAction && attempt < 2) {
					await delay(100 * 2 ** attempt);
					continue;
				}
				throw new BameTransportError(
					error instanceof Error ? error.message : 'Network failure',
					requestId,
					'TRANSPORT_ERROR',
				);
			}
			if (isAction && [502, 503, 504].includes(res.status)) {
				await res.body?.cancel();
				if (attempt < 2) {
					await delay(100 * 2 ** attempt);
					continue;
				}
				throw new BameTransportError(
					'Service unavailable; retry using the same request ID',
					requestId,
					'TRANSPORT_ERROR',
				);
			}
			let json: {
				ok: boolean;
				data: TResult;
				error?: string;
				code?: string;
				params?: Record<string, unknown>;
			};
			try {
				json = (await res.json()) as typeof json;
			} catch {
				if (isAction && attempt < 2) {
					await delay(100 * 2 ** attempt);
					continue;
				}
				throw new BameTransportError(
					'Invalid server response',
					requestId,
					'TRANSPORT_ERROR',
				);
			}
			if (!res.ok || !json.ok)
				throw new BameTransportError(
					json.error ?? 'Request failed',
					requestId,
					json.code,
					json.params,
				);
			return json.data;
		}
	};
	const subscribeChannel = <TPayload>(
		channel: string,
		callback: (payload: TPayload) => void | Promise<void>,
		subscription?: SubscriptionOptions,
	): Unsubscribe => {
		const controller = new AbortController();
		const separator = options.url.includes('?') ? '&' : '?';
		const streamUrl =
			options.url +
			separator +
			'channel=' +
			encodeURIComponent(channel) +
			(lastUserId ? `&userId=${encodeURIComponent(lastUserId)}` : '');
		void (async () => {
			let attempt = 0;
			while (!controller.signal.aborted) {
				try {
					const response = await fetchImpl(streamUrl, {
						headers: await resolveHeaders({ Accept: 'text/event-stream' }),
						credentials: options.credentials,
						signal: controller.signal,
					});
					if ([400, 401, 403, 404].includes(response.status)) {
						await response.body?.cancel();
						subscription?.onError?.(
							new BameTransportError(
								'Subscription denied',
								undefined,
								String(response.status),
							),
						);
						return;
					}
					if (!response.ok || !response.body) {
						await response.body?.cancel();
						throw new Error('Stream unavailable');
					}
					for await (const event of readSse(response.body)) {
						if (controller.signal.aborted) return;
						if (event.event === 'ready') {
							attempt = 0;
							await subscription?.onReady?.();
							continue;
						}
						if (event.event === 'error') {
							const details = JSON.parse(event.data) as { code: string };
							if (
								['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(
									details.code,
								)
							) {
								subscription?.onError?.(
									new BameTransportError(
										'Subscription access ended',
										undefined,
										details.code,
									),
								);
								return;
							}
							throw new Error('Stream interrupted');
						}
						try {
							await callback(JSON.parse(event.data) as TPayload);
						} catch (error) {
							subscription?.onError?.(error);
						}
					}
					if (!controller.signal.aborted)
						subscription?.onError?.(
							new Error('Stream disconnected; reconnecting'),
						);
				} catch (error) {
					if (controller.signal.aborted) return;
					try {
						subscription?.onError?.(error);
					} catch {}
				}
				await delay(
					Math.min(30000, 500 * 2 ** Math.min(attempt++, 6)) *
						(0.8 + Math.random() * 0.2),
					controller.signal,
				);
			}
		})();
		return () => controller.abort();
	};

	return {
		lobbies: {
			create: <TConfig = unknown>(input: CreateLobbyInput<TConfig>) =>
				rpc<Lobby<TConfig>>({
					service: 'lobbies',
					method: 'create',
					args: [input as CreateLobbyInput],
				}),
			get: <TConfig = unknown>(lobbyId: string, userId?: string) =>
				rpc<Lobby<TConfig> | null>({
					service: 'lobbies',
					method: 'get',
					args: [lobbyId, userId],
				}),
			list: (gameName?: string) =>
				rpc<Lobby[]>({
					service: 'lobbies',
					method: 'list',
					args: [gameName],
				}),
			join: (input: JoinLobbyInput) =>
				rpc<Lobby>({
					service: 'lobbies',
					method: 'join',
					args: [input],
				}),
			joinByCode: (input: JoinLobbyByCodeInput) =>
				rpc<Lobby>({
					service: 'lobbies',
					method: 'joinByCode',
					args: [input],
				}),
			setReady: (input: SetReadyInput) =>
				rpc<Lobby>({
					service: 'lobbies',
					method: 'setReady',
					args: [input],
				}),
			leave: (input: LeaveLobbyInput) =>
				rpc<Lobby | null>({
					service: 'lobbies',
					method: 'leave',
					args: [input],
				}),
			close: (input: CloseLobbyInput) =>
				rpc<Lobby>({ service: 'lobbies', method: 'close', args: [input] }),
			rematch: (input: RematchLobbyInput) =>
				rpc<Lobby>({ service: 'lobbies', method: 'rematch', args: [input] }),
			start: (input: StartLobbyInput) =>
				rpc<MatchView>({
					service: 'lobbies',
					method: 'start',
					args: [input],
				}),
			subscribe: (
				lobbyId: string,
				callback: (lobby: Lobby) => void | Promise<void>,
				subscription?: SubscriptionOptions,
			) =>
				subscribeChannel<Lobby>(lobbyChannel(lobbyId), callback, subscription),
		},

		matches: {
			get: <TView = unknown>(matchId: string, userId: string | null = null) =>
				rpc<MatchView<TView> | null>({
					service: 'matches',
					method: 'get',
					args: [matchId, userId],
				}),
			list: <TView = unknown>(filter: ListMatchesFilter = {}) =>
				rpc<MatchView<TView>[]>({
					service: 'matches',
					method: 'list',
					args: [filter],
				}),
			move: <
				TView = unknown,
				// biome-ignore lint/suspicious/noExplicitAny: generic default
				TMoves extends MoveMap<any> = MoveMap<any>,
				K extends keyof TMoves & string = keyof TMoves & string,
			>(
				input: MoveInput<TMoves, K>,
			) =>
				rpc<MoveResult<TView>>({
					service: 'matches',
					method: 'move',
					args: [input as MoveInput],
				}),
			undo: <TView = unknown>(input: MatchActionInput) =>
				rpc<MoveResult<TView>>({
					service: 'matches',
					method: 'undo',
					args: [input],
				}),
			forfeit: <TView = unknown>(input: MatchActionInput) =>
				rpc<MoveResult<TView>>({
					service: 'matches',
					method: 'forfeit',
					args: [input],
				}),
			subscribe: <TView = unknown>(
				matchId: string,
				userId: string,
				callback: (
					view: MatchView<TView>,
					version: number,
				) => void | Promise<void>,
				subscription?: SubscriptionOptions,
			) =>
				subscribeChannel<VersionedSnapshot<MatchView<TView>>>(
					matchPlayerChannel(matchId, userId),
					(snapshot) => callback(snapshot.view, snapshot.version),
					subscription,
				),
			subscribeNotifications: <TData = unknown>(
				userId: string,
				callback: (
					notification: GameNotification<TData>,
				) => void | Promise<void>,
				subscription?: SubscriptionOptions,
			) =>
				subscribeChannel<GameNotification<TData>>(
					userNotificationChannel(userId),
					callback,
					subscription,
				),
		},

		profiles: {
			ensure: (userId: string, defaults?: UpdateProfileInput) =>
				rpc<Profile>({
					service: 'profiles',
					method: 'ensure',
					args: [userId, defaults],
				}),
			get: (userId: string) =>
				rpc<Profile | null>({
					service: 'profiles',
					method: 'get',
					args: [userId],
				}),
			list: () =>
				rpc<Profile[]>({
					service: 'profiles',
					method: 'list',
					args: [],
				}),
			update: (userId: string, updates: UpdateProfileInput) =>
				rpc<Profile>({
					service: 'profiles',
					method: 'update',
					args: [userId, updates],
				}),
			subscribe: (
				userId: string,
				callback: (profile: Profile) => void | Promise<void>,
				subscription?: SubscriptionOptions,
			) =>
				subscribeChannel<Profile>(
					profileChannel(userId),
					callback,
					subscription,
				),
		},
	};
};
