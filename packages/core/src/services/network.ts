import { requestScope } from './request-scope.js';
import { BameTransportError } from './transport-error.js';

export { BameTransportError } from './transport-error.js';

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
	type CloseLobbyInput,
	type CreateLobbyInput,
	type JoinLobbyByCodeInput,
	type JoinLobbyInput,
	type KickLobbyInput,
	type LeaveLobbyInput,
	type ListMatchesFilter,
	type Lobby,
	type LobbyPreview,
	lobbyChannel,
	lobbyPresenceScope,
	type MatchActionInput,
	type MoveInput,
	matchPlayerChannel,
	matchPresenceScope,
	type PresenceSnapshot,
	type PresenceStatus,
	type Profile,
	presenceChannel,
	profileChannel,
	type RematchLobbyInput,
	type ReportPresenceInput,
	type SetReadyInput,
	type StartLobbyInput,
	type UpdateProfileInput,
	userNotificationChannel,
} from './index.js';
import type { MoveResult } from './matches.js';
import { HttpError, identifier, validateRpc } from './rpc-validation.js';
import { delay, readSse } from './sse.js';

export type RpcAction =
	| { service: 'lobbies'; method: 'previewByCode'; args: [code: string] }
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
	| { service: 'lobbies'; method: 'kick'; args: [KickLobbyInput] }
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
			service: 'presence';
			method: 'report';
			args: [ReportPresenceInput];
	  }
	| {
			service: 'presence';
			method: 'get';
			args: [scope: string, userId?: string];
	  }
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

export type AllowedOriginsOption =
	| readonly string[]
	| ((origin: string, request: Request) => boolean | Promise<boolean>);

export async function isOriginPermitted(
	request: Request,
	allowedOrigins?: AllowedOriginsOption,
): Promise<boolean> {
	const origin = request.headers.get('origin');
	if (!origin || origin === new URL(request.url).origin) return true;
	if (!allowedOrigins) return false;
	if (typeof allowedOrigins === 'function')
		return Boolean(await allowedOrigins(origin, request));
	return allowedOrigins.includes(origin);
}

export interface CreateBameHandlerOptions {
	getUserId?: (req: Request) => string | null | Promise<string | null>;
	unsafeTrustClientIds?: true;
	canSpectate?: (context: {
		request: Request;
		userId: string | null;
		match: Match;
	}) => boolean | Promise<boolean>;
	maxBodyBytes?: number;
	allowedOrigins?: AllowedOriginsOption;
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

const presenceStreamsByBame = new WeakMap<BameInstance, Map<string, number>>();
const pendingOfflineByBame = new WeakMap<
	BameInstance,
	Map<string, ReturnType<typeof setTimeout>>
>();

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
	let activePresenceStreams = presenceStreamsByBame.get(bame);
	if (!activePresenceStreams) {
		activePresenceStreams = new Map<string, number>();
		presenceStreamsByBame.set(bame, activePresenceStreams);
	}
	let pendingOffline = pendingOfflineByBame.get(bame);
	if (!pendingOffline) {
		pendingOffline = new Map<string, ReturnType<typeof setTimeout>>();
		pendingOfflineByBame.set(bame, pendingOffline);
	}
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
	const authorizePresenceScope = async (
		req: Request,
		scope: string,
		claimedUser?: string | null,
	) => {
		const user = (await identity(req, claimedUser, true)) as string;
		const colon = scope.indexOf(':');
		const kind = scope.slice(0, colon);
		let resource: string;
		try {
			resource = decodeURIComponent(scope.slice(colon + 1));
		} catch {
			return fail(400, 'INVALID_CHANNEL', 'Invalid presence scope');
		}
		if (kind === 'match') {
			const match = await bame.storage.get<Match>('matches', resource);
			if (!match) return fail(404, 'NOT_FOUND', 'Match not found');
			if (!match.players.some((p) => p.id === user))
				fail(403, 'FORBIDDEN', 'Forbidden: match membership required');
			return user;
		}
		if (kind === 'lobby') {
			const lobby = await bame.storage.get<Lobby>('lobbies', resource);
			if (!lobby) return fail(404, 'NOT_FOUND', 'Lobby not found');
			if (!lobby.members.some((m) => m.userId === user))
				fail(403, 'FORBIDDEN', 'Forbidden: lobby membership required');
			return user;
		}
		return fail(400, 'INVALID_CHANNEL', 'Unknown presence scope');
	};
	const dispatch = async (
		req: Request,
		action: RpcAction,
	): Promise<unknown> => {
		if (action.service === 'lobbies') {
			if (action.method === 'previewByCode')
				return bame.lobbies.previewByCode(action.args[0]);
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
				case 'kick':
					return lobbyView(await bame.lobbies.kick(trusted as KickLobbyInput));
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
		if (action.service === 'presence') {
			if (action.method === 'get') {
				await authorizePresenceScope(req, action.args[0], action.args[1]);
				return bame.presence.get(action.args[0]);
			}
			const input = action.args[0];
			const user = await authorizePresenceScope(req, input.scope, input.userId);
			return bame.presence.report({
				scope: input.scope,
				userId: user,
				status: input.status as PresenceStatus,
			});
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
		const mux = url.searchParams.get('mux') === '1';
		const rawChannels = mux
			? [...new Set(url.searchParams.getAll('channel'))]
			: [url.searchParams.get('channel') ?? ''];
		if (rawChannels.length === 0)
			fail(400, 'INVALID_CHANNEL', 'Missing subscription channel');
		const decode = (value: string) => {
			try {
				return decodeURIComponent(value);
			} catch {
				return fail(400, 'INVALID_CHANNEL', 'Invalid channel identifier');
			}
		};
		interface StreamEntry {
			channel: string;
			isMatch: boolean;
			isNotification: boolean;
			isPresence: boolean;
			presenceScope?: string;
			presenceUserId?: string;
			presenceStreamKey?: string;
			authorize: () => Promise<void>;
			snapshot: () => Promise<unknown>;
			unsub: Unsubscribe;
			disposed: boolean;
			serial: Promise<void>;
		}
		const parseEntry = (channel: string): StreamEntry => {
			const match = /^match:([^:]+):player:([^:]+)$/.exec(channel),
				lobby = /^lobby:([^:]+)$/.exec(channel),
				profile = /^profile:([^:]+)$/.exec(channel),
				notification = /^user:([^:]+):notifications$/.exec(channel),
				presence = /^presence:((?:match|lobby):[^:]+)$/.exec(channel);
			if (!match && !lobby && !profile && !notification && !presence)
				fail(400, 'INVALID_CHANNEL', 'Unknown subscription channel');
			const owner = match
				? decode(match[2])
				: notification
					? decode(notification[1])
					: undefined;
			const resource = decode(
				(match ?? lobby ?? profile ?? notification)?.[1] ?? '',
			);
			const presenceScope = presence
				? presence[1]
				: match
					? matchPresenceScope(resource)
					: lobby
						? lobbyPresenceScope(resource)
						: undefined;
			const isPresence = Boolean(presence);
			const entry: StreamEntry = {
				channel,
				isMatch: Boolean(match),
				isNotification: Boolean(notification),
				isPresence,
				presenceScope,
				unsub: () => {},
				disposed: false,
				serial: Promise.resolve(),
				authorize: async () => {
					if (isPresence && presenceScope) {
						entry.presenceUserId = await authorizePresenceScope(
							req,
							presenceScope,
							options.unsafeTrustClientIds
								? url.searchParams.get('userId')
								: undefined,
						);
						return;
					}
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
						if (viewer) entry.presenceUserId = viewer;
					}
					if (lobby) {
						const current = await bame.storage.get<Lobby>('lobbies', resource);
						if (!current) return fail(404, 'NOT_FOUND', 'Lobby not found');
						if (
							!current.isPublic &&
							!current.members.some((m) => m.userId === user)
						)
							fail(403, 'FORBIDDEN', 'Forbidden private lobby');
						if (user) entry.presenceUserId = user;
					}
				},
				snapshot: async () =>
					isPresence && presenceScope
						? await bame.presence.get(presenceScope)
						: match
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
									: undefined,
			};
			return entry;
		};
		const entries = rawChannels.map(parseEntry);
		let initialErrors: Array<unknown | null> = entries.map(() => null);
		if (!mux) {
			await entries[0].authorize();
		} else {
			const settled = await Promise.allSettled(
				entries.map((entry) => entry.authorize()),
			);
			initialErrors = settled.map((res) =>
				res.status === 'rejected' ? res.reason : null,
			);
			if (initialErrors.every((err) => err !== null)) {
				throw initialErrors[0];
			}
		}
		const acquirePresence = (entry: StreamEntry) => {
			if (!entry.presenceScope || !entry.presenceUserId) return;
			const key = `${entry.presenceScope}::${entry.presenceUserId}`;
			entry.presenceStreamKey = key;
			const pending = pendingOffline.get(key);
			if (pending) {
				clearTimeout(pending);
				pendingOffline.delete(key);
			}
			activePresenceStreams.set(key, (activePresenceStreams.get(key) ?? 0) + 1);
		};
		const releasePresence = (entry: StreamEntry) => {
			const key = entry.presenceStreamKey;
			const scope = entry.presenceScope;
			const uid = entry.presenceUserId;
			if (!key || !scope || !uid) return;
			entry.presenceStreamKey = undefined;
			const remaining = (activePresenceStreams.get(key) ?? 1) - 1;
			if (remaining <= 0) {
				activePresenceStreams.delete(key);
				const prev = pendingOffline.get(key);
				if (prev) clearTimeout(prev);
				const timer = setTimeout(() => {
					pendingOffline.delete(key);
					if ((activePresenceStreams.get(key) ?? 0) <= 0) {
						void bame.presence.report({
							scope,
							userId: uid,
							status: 'offline',
						});
					}
				}, 150);
				pendingOffline.set(key, timer);
			} else {
				activePresenceStreams.set(key, remaining);
			}
		};
		for (let i = 0; i < entries.length; i++) {
			if (!initialErrors[i]) acquirePresence(entries[i]);
		}
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
				const disposeEntry = (entry: StreamEntry) => {
					if (entry.disposed) return;
					entry.disposed = true;
					entry.unsub();
					releasePresence(entry);
				};
				dispose = () => {
					if (closed) return;
					closed = true;
					for (const entry of entries) disposeEntry(entry);
					clearInterval(timer);
					req.signal.removeEventListener('abort', dispose);
					try {
						controller.close();
					} catch {}
				};
				const entryError = (entry: StreamEntry, err: unknown) => {
					if (closed || entry.disposed) return;
					const code = err instanceof HttpError ? err.code : 'STREAM_ERROR';
					if (mux) {
						send({ channel: entry.channel, code }, 'channel_error');
						disposeEntry(entry);
						if (entries.every((item) => item.disposed)) dispose();
					} else {
						send({ code }, 'error');
						dispose();
					}
				};
				const emitEntry = (entry: StreamEntry, payload?: unknown) => {
					entry.serial = entry.serial
						.then(async () => {
							if (closed || entry.disposed) return;
							await entry.authorize();
							let out: unknown;
							if (entry.isNotification || entry.isPresence) {
								if (payload) out = payload;
								else if (entry.isPresence) out = await entry.snapshot();
							} else {
								const current = await entry.snapshot();
								if (entry.isMatch) {
									const view = current as MatchView;
									out = { version: view.version, view };
								} else out = current;
							}
							if (out !== undefined && !closed && !entry.disposed) {
								send(mux ? { channel: entry.channel, data: out } : out);
							}
						})
						.catch((err) => entryError(entry, err));
					return entry.serial;
				};
				for (let i = 0; i < entries.length; i++) {
					const entry = entries[i];
					const initErr = initialErrors[i];
					if (initErr) {
						entryError(entry, initErr);
						continue;
					}
					entry.unsub = bame.realtime.subscribe(
						entry.channel,
						(payload) => emitEntry(entry, payload),
						{
							onReady: async () => {
								await emitEntry(entry);
								if (!closed && !entry.disposed) {
									send(mux ? { channel: entry.channel } : {}, 'ready');
								}
							},
							onError: (err) => entryError(entry, err),
						},
					);
				}
				timer = setInterval(() => {
					for (const entry of entries) {
						if (entry.disposed) continue;
						void entry.authorize().catch((err) => entryError(entry, err));
					}
					if (!closed) controller.enqueue(encoder.encode(': heartbeat\n\n'));
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
				'X-Accel-Buffering': 'no',
			},
		});
	};
	const fetch = async (req: Request): Promise<Response> => {
		const origin = req.headers.get('origin');
		if (!(await isOriginPermitted(req, options.allowedOrigins)))
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
		if (!response.headers.has('Cache-Control'))
			response.headers.set('Cache-Control', 'no-store');
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

export interface BameRequestOptions {
	/** Cancels requests and subscriptions created through this client scope. */
	signal?: AbortSignal;
	/** RPC deadline and SSE connection deadline in ms; default 15000. False disables it. */
	requestTimeoutMs?: number | false;
}
export interface BameClientRuntime extends BameRuntime {
	/** Create an independent request scope without mutating an existing client. */
	withOptions(options: BameRequestOptions): BameClientRuntime;
	lobbies: Omit<BameRuntime['lobbies'], 'start'> & {
		start(input: StartLobbyInput): Promise<MatchView>;
	};
}
export interface CreateBameClientOptions extends BameRequestOptions {
	/** Explicit default subscription identity. React hooks pass their provider identity instead. */
	userId?: string;
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
	const timeoutMs = options.requestTimeoutMs ?? 15000;
	if (timeoutMs !== false && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
		throw new Error(
			'requestTimeoutMs must be a positive finite number or false',
		);
	}
	const httpCode = (status: number) =>
		(
			({
				400: 'INVALID_REQUEST',
				401: 'UNAUTHORIZED',
				403: 'FORBIDDEN',
				404: 'NOT_FOUND',
			}) as Record<number, string>
		)[status] ?? 'TRANSPORT_ERROR';
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

	const rpcRequest = async <TResult>(
		action: RpcAction,
		signal: AbortSignal,
	): Promise<TResult> => {
		signal.throwIfAborted();
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
				const latest = await rpcRequest<MatchView>(
					{
						service: 'matches',
						method: 'get',
						args: [input.matchId, input.userId],
					},
					signal,
				);
				next.expectedVersion = latest.version;
			}
			action = { ...action, args: [next] } as RpcAction;
		}
		const body = JSON.stringify(action);
		const requestId = isAction
			? (action.args[0] as MatchActionInput).requestId
			: undefined;
		for (let attempt = 0; ; attempt++) {
			signal.throwIfAborted();
			let res: Response;
			try {
				const headers = await resolveHeaders({
					'Content-Type': 'application/json',
				});
				signal.throwIfAborted();
				res = await fetchImpl(options.url, {
					method: 'POST',
					headers,
					signal,
					credentials: options.credentials,
					body,
				});
			} catch (error) {
				if (signal.aborted) throw signal.reason;
				if (isAction && attempt < 2) {
					await delay(100 * 2 ** attempt, signal);
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
					await delay(100 * 2 ** attempt, signal);
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
				if (signal.aborted) throw signal.reason;
				if ([400, 401, 403, 404].includes(res.status))
					throw new BameTransportError(
						'Request denied',
						requestId,
						httpCode(res.status),
						undefined,
						res.status,
					);
				if (isAction && attempt < 2) {
					await delay(100 * 2 ** attempt, signal);
					continue;
				}
				throw new BameTransportError(
					'Invalid server response',
					requestId,
					'TRANSPORT_ERROR',
				);
			}
			if (!json || typeof json.ok !== 'boolean')
				throw new BameTransportError(
					'Invalid server response',
					requestId,
					'TRANSPORT_ERROR',
					undefined,
					res.status,
				);
			if (!res.ok || !json.ok)
				throw new BameTransportError(
					json.error ?? 'Request failed',
					requestId,
					json.code ?? httpCode(res.status),
					json.params,
					res.status,
				);
			return json.data;
		}
	};
	const rpc = async <TResult>(action: RpcAction): Promise<TResult> => {
		const isAction =
			action.service === 'matches' &&
			['move', 'undo', 'forfeit'].includes(action.method);
		const requestId = isAction
			? ((action.args[0] as MatchActionInput).requestId ?? crypto.randomUUID())
			: undefined;
		if (isAction)
			action = {
				...action,
				args: [{ ...(action.args[0] as MatchActionInput), requestId }],
			} as RpcAction;
		const scope = requestScope(options.signal, timeoutMs, requestId);
		try {
			return await scope.run(() => rpcRequest<TResult>(action, scope.signal));
		} finally {
			scope.dispose();
		}
	};
	interface MuxSubscriber {
		id: number;
		channel: string;
		callback: (payload: unknown) => void | Promise<void>;
		subscription?: SubscriptionOptions;
	}
	interface ActiveStream {
		key: string;
		controller: AbortController;
		readyChannels: Set<string>;
		notifiedReady: Set<number>;
		abort: () => void;
	}
	interface ChannelGroup {
		identityKey: string;
		effectiveUserId: string | undefined;
		subs: Map<number, MuxSubscriber>;
		syncScheduled: boolean;
		activeStream?: ActiveStream;
		onClientAbort: () => void;
	}
	let nextSubscriberId = 1;
	const streamGroups = new Map<string, ChannelGroup>();
	const fatalCodes = new Set(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND']);

	const startGroupStream = (
		group: ChannelGroup,
		channels: string[],
		key: string,
	): ActiveStream => {
		const controller = new AbortController();
		const isMux = channels.length > 1;
		const separator = options.url.includes('?') ? '&' : '?';
		const uidParam = group.effectiveUserId
			? `&userId=${encodeURIComponent(group.effectiveUserId)}`
			: '';
		const streamUrl = isMux
			? `${options.url}${separator}mux=1&${channels.map((ch) => `channel=${encodeURIComponent(ch)}`).join('&')}${uidParam}`
			: `${options.url}${separator}channel=${encodeURIComponent(channels[0])}${uidParam}`;
		const activeStream: ActiveStream = {
			key,
			controller,
			readyChannels: new Set(),
			notifiedReady: new Set(),
			abort: () => controller.abort(),
		};
		const channelSet = new Set(channels);
		const matchingSubs = (channel?: string) =>
			[...group.subs.values()].filter((s) =>
				channel ? s.channel === channel : channelSet.has(s.channel),
			);
		const notifySubsError = (err: unknown, channel?: string) => {
			for (const sub of matchingSubs(channel)) {
				try {
					sub.subscription?.onError?.(err);
				} catch {}
			}
		};

		void (async () => {
			let attempt = 0;
			while (!controller.signal.aborted) {
				const scope = requestScope(controller.signal, timeoutMs);
				try {
					const response = await scope.run(async () => {
						const headers = await resolveHeaders({
							Accept: 'text/event-stream',
						});
						scope.signal.throwIfAborted();
						return fetchImpl(streamUrl, {
							headers,
							credentials: options.credentials,
							signal: scope.signal,
						});
					});
					if ([400, 401, 403, 404].includes(response.status)) {
						const details = (await scope.run(() =>
							response.json().catch(() => ({})),
						)) as { error?: string; code?: string };
						const err = new BameTransportError(
							details?.error ?? 'Subscription denied',
							undefined,
							details?.code ?? httpCode(response.status),
							undefined,
							response.status,
						);
						const targets = matchingSubs();
						for (const sub of targets) group.subs.delete(sub.id);
						for (const sub of targets) {
							try {
								sub.subscription?.onError?.(err);
							} catch {}
						}
						if (group.activeStream === activeStream)
							group.activeStream = undefined;
						return;
					}
					if (!response.ok || !response.body) {
						await response.body?.cancel();
						throw new Error('Stream unavailable');
					}
					scope.clearDeadline();
					activeStream.readyChannels.clear();
					activeStream.notifiedReady.clear();
					for await (const event of readSse(response.body, scope.signal)) {
						if (controller.signal.aborted) return;
						if (event.event === 'ready') {
							attempt = 0;
							const readyChannel = isMux
								? (JSON.parse(event.data) as { channel: string }).channel
								: channels[0];
							activeStream.readyChannels.add(readyChannel);
							for (const sub of matchingSubs(readyChannel)) {
								activeStream.notifiedReady.add(sub.id);
								await sub.subscription?.onReady?.();
							}
							continue;
						}
						if (event.event === 'channel_error') {
							const details = JSON.parse(event.data) as {
								channel: string;
								code: string;
							};
							const fatal = fatalCodes.has(details.code);
							const err = fatal
								? new BameTransportError(
										'Subscription access ended',
										undefined,
										details.code,
									)
								: new Error(`Channel interrupted (${details.code})`);
							for (const sub of matchingSubs(details.channel)) {
								if (fatal) group.subs.delete(sub.id);
								try {
									sub.subscription?.onError?.(err);
								} catch {}
							}
							if (fatal) scheduleSync(group);
							continue;
						}
						if (event.event === 'error') {
							const details = JSON.parse(event.data) as { code: string };
							if (fatalCodes.has(details.code)) {
								const err = new BameTransportError(
									'Subscription access ended',
									undefined,
									details.code,
								);
								const targets = matchingSubs();
								for (const sub of targets) group.subs.delete(sub.id);
								for (const sub of targets) {
									try {
										sub.subscription?.onError?.(err);
									} catch {}
								}
								if (group.activeStream === activeStream)
									group.activeStream = undefined;
								return;
							}
							throw new Error('Stream interrupted');
						}
						const parsed = JSON.parse(event.data) as unknown;
						const targetChannel = isMux
							? (parsed as { channel: string; data: unknown }).channel
							: channels[0];
						const payload = isMux
							? (parsed as { channel: string; data: unknown }).data
							: parsed;
						for (const sub of matchingSubs(targetChannel)) {
							try {
								await sub.callback(payload);
							} catch (error) {
								sub.subscription?.onError?.(error);
							}
						}
					}
					if (!controller.signal.aborted) {
						notifySubsError(new Error('Stream disconnected; reconnecting'));
					}
				} catch (error) {
					if (controller.signal.aborted) return;
					notifySubsError(error);
				} finally {
					scope.dispose();
				}
				await delay(
					Math.min(30000, 500 * 2 ** Math.min(attempt++, 6)) *
						(0.8 + Math.random() * 0.2),
					controller.signal,
				);
			}
		})();
		return activeStream;
	};

	const syncGroup = (group: ChannelGroup) => {
		group.syncScheduled = false;
		if (options.signal?.aborted || group.subs.size === 0) {
			group.activeStream?.abort();
			group.activeStream = undefined;
			options.signal?.removeEventListener('abort', group.onClientAbort);
			streamGroups.delete(group.identityKey);
			return;
		}
		const channels = [
			...new Set([...group.subs.values()].map((s) => s.channel)),
		].sort();
		const desiredKey = channels.join('\n');
		if (group.activeStream?.key === desiredKey) {
			for (const sub of group.subs.values()) {
				if (
					group.activeStream.readyChannels.has(sub.channel) &&
					!group.activeStream.notifiedReady.has(sub.id)
				) {
					group.activeStream.notifiedReady.add(sub.id);
					void sub.subscription?.onReady?.();
				}
			}
			return;
		}
		group.activeStream?.abort();
		group.activeStream = startGroupStream(group, channels, desiredKey);
	};

	const scheduleSync = (group: ChannelGroup) => {
		if (group.syncScheduled) return;
		group.syncScheduled = true;
		queueMicrotask(() => syncGroup(group));
	};

	const subscribeChannel = <TPayload>(
		channel: string,
		callback: (payload: TPayload) => void | Promise<void>,
		subscription?: SubscriptionOptions,
	): Unsubscribe => {
		if (options.signal?.aborted) return () => {};
		const effectiveUserId = subscription?.userId ?? options.userId;
		const identityKey = effectiveUserId ?? '';
		let group = streamGroups.get(identityKey);
		if (!group) {
			const created: ChannelGroup = {
				identityKey,
				effectiveUserId,
				subs: new Map(),
				syncScheduled: false,
				onClientAbort: () => {
					created.activeStream?.abort();
					created.activeStream = undefined;
					created.subs.clear();
					streamGroups.delete(identityKey);
				},
			};
			options.signal?.addEventListener('abort', created.onClientAbort, {
				once: true,
			});
			streamGroups.set(identityKey, created);
			group = created;
		}
		const id = nextSubscriberId++;
		group.subs.set(id, {
			id,
			channel,
			callback: callback as (payload: unknown) => void | Promise<void>,
			subscription,
		});
		scheduleSync(group);
		return () => {
			const currentGroup = streamGroups.get(identityKey);
			if (!currentGroup) return;
			currentGroup.subs.delete(id);
			if (currentGroup.subs.size === 0) {
				currentGroup.activeStream?.abort();
				currentGroup.activeStream = undefined;
				options.signal?.removeEventListener(
					'abort',
					currentGroup.onClientAbort,
				);
				streamGroups.delete(identityKey);
				return;
			}
			scheduleSync(currentGroup);
		};
	};

	return {
		withOptions: (requestOptions: BameRequestOptions) =>
			createBameClient({ ...options, ...requestOptions }),
		lobbies: {
			previewByCode: (code: string) =>
				rpc<LobbyPreview | null>({
					service: 'lobbies',
					method: 'previewByCode',
					args: [code],
				}),
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
			kick: (input: KickLobbyInput) =>
				rpc<Lobby>({ service: 'lobbies', method: 'kick', args: [input] }),
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
					{ ...subscription, userId },
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
					{ ...subscription, userId },
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

		presence: {
			report: (input: ReportPresenceInput) =>
				rpc<PresenceSnapshot>({
					service: 'presence',
					method: 'report',
					args: [input],
				}),
			get: (scope: string, userId?: string) =>
				rpc<PresenceSnapshot>({
					service: 'presence',
					method: 'get',
					args: [scope, userId],
				}),
			subscribe: (
				scope: string,
				callback: (snapshot: PresenceSnapshot) => void | Promise<void>,
				subscription?: SubscriptionOptions,
			) =>
				subscribeChannel<PresenceSnapshot>(
					presenceChannel(scope),
					callback,
					subscription,
				),
		},
	};
};
