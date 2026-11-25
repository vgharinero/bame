import {
	type BameClientRuntime,
	type BameRuntime,
	type CreateLobbyInput,
	canMove as checkCanMove,
	type ErrorDetails,
	type ErrorResult,
	type Game,
	type GameNotification,
	getErrorDetails,
	type ListMatchesFilter,
	type Lobby,
	MatchFeed,
	type MatchView,
	type MoveArgs,
	type MoveCheck,
	type MoveMap,
	type MoveResult,
	type MovesOf,
	type PresenceEntry,
	type PresenceStatus,
	type Profile,
	type StateOf,
	type UpdateProfileInput,
	type ViewOf,
} from '@bame/core';
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

const TERMINAL_RESUME_ERRORS = new Set([
	'FORBIDDEN',
	'LOBBY_CLOSED',
	'LOBBY_NOT_FOUND',
	'NOT_A_MEMBER',
	'NOT_FOUND',
	'UNAUTHORIZED',
]);

export function readStoredLobbyId(
	storageKey = 'bame:onlineLobby',
	getStorage: () => Pick<Storage, 'getItem'> = () => sessionStorage,
): string | null {
	try {
		const raw = getStorage().getItem(storageKey)?.trim();
		return raw ? raw : null;
	} catch {
		return null;
	}
}

export function writeStoredLobbyId(
	lobbyId: string,
	storageKey = 'bame:onlineLobby',
	getStorage: () => Pick<Storage, 'setItem'> = () => sessionStorage,
): void {
	try {
		getStorage().setItem(storageKey, lobbyId);
	} catch {
		// Persistence is optional; in-memory session remains active.
	}
}

export function clearStoredLobbyId(
	storageKey = 'bame:onlineLobby',
	getStorage: () => Pick<Storage, 'removeItem'> = () => sessionStorage,
): void {
	try {
		getStorage().removeItem(storageKey);
	} catch {
		// Persistence is optional.
	}
}

/** Rejoin an active lobby on reload unless closed, unjoined, or rejected terminally. */
export async function resumeLobby<TConfig = unknown>(
	bame: BameRuntime,
	lobbyId: string,
	userId: string,
	signal?: AbortSignal,
): Promise<Lobby<TConfig> | null> {
	const runtime =
		signal && 'withOptions' in bame && typeof bame.withOptions === 'function'
			? (bame as BameClientRuntime).withOptions({ signal })
			: bame;
	try {
		const lobby = await runtime.lobbies.get<TConfig>(lobbyId, userId);
		if (
			!lobby ||
			lobby.status === 'closed' ||
			!lobby.members.some((member) => member.userId === userId)
		) {
			return null;
		}
		return lobby;
	} catch (error) {
		const code = getErrorDetails(error)?.code;
		if (code && TERMINAL_RESUME_ERRORS.has(code)) return null;
		throw error;
	}
}

/** Keep the legacy message and structured details in one state update. */
function useErrorState() {
	const [failure, setFailure] = useState<{
		message: string;
		details: ErrorDetails | null;
	} | null>(null);
	const setError = useCallback((message: string | null, source?: unknown) => {
		setFailure(
			message === null ? null : { message, details: getErrorDetails(source) },
		);
	}, []);
	return [
		failure?.message ?? null,
		setError,
		failure?.details ?? null,
	] as const;
}

export interface BameContextValue {
	bame: BameRuntime;
	userId: string;
	setUserId: (userId: string) => void;
}

const BameContext = createContext<BameContextValue | null>(null);

export interface BameProviderProps {
	bame: BameRuntime;
	/**
	 * Active player ID. If omitted, a guest ID (`Guest-XXX`) is automatically
	 * generated and optionally persisted in Web Storage (`persist`).
	 */
	userId?: string;
	/** Optional profile metadata (`displayName`, `avatarUrl`) synced via `bame.profiles.ensure` */
	profile?: UpdateProfileInput;
	/**
	 * Where to persist the active `userId` in the browser when `userId` is uncontrolled:
	 * - `'local'` (default when `userId` is omitted): `window.localStorage`
	 * - `'session'`: `window.sessionStorage`
	 * - `false`: in-memory only
	 */
	persist?: 'local' | 'session' | false;
	/** Storage key used when `persist` is enabled (default: `'bame:userId'`) */
	storageKey?: string;
	onUserIdChange?: (userId: string) => void;
	children: ReactNode;
}

const generateGuestId = () => `Guest-${globalThis.crypto.randomUUID()}`;

export const BameProvider = ({
	bame,
	userId: controlledUserId,
	profile,
	persist,
	storageKey = 'bame:userId',
	onUserIdChange,
	children,
}: BameProviderProps) => {
	const effectivePersist =
		persist ?? (controlledUserId === undefined ? 'local' : false);

	const [internalUserId, setInternalUserId] = useState<string>(() => {
		if (controlledUserId !== undefined) return controlledUserId;
		if (typeof window !== 'undefined' && effectivePersist) {
			try {
				const store =
					effectivePersist === 'local'
						? window.localStorage
						: window.sessionStorage;
				const saved = store.getItem(storageKey);
				if (saved) return saved;
				const created = generateGuestId();
				store.setItem(storageKey, created);
				return created;
			} catch {
				// Ignore storage access errors
			}
		}
		return generateGuestId();
	});

	useEffect(() => {
		if (controlledUserId !== undefined) {
			setInternalUserId(controlledUserId);
		}
	}, [controlledUserId]);

	const setUserId = useCallback(
		(nextId: string) => {
			if (controlledUserId === undefined) setInternalUserId(nextId);
			if (
				controlledUserId === undefined &&
				typeof window !== 'undefined' &&
				effectivePersist
			) {
				try {
					const store =
						effectivePersist === 'local'
							? window.localStorage
							: window.sessionStorage;
					store.setItem(storageKey, nextId);
				} catch {
					// Ignore storage errors
				}
			}
			onUserIdChange?.(nextId);
		},
		[controlledUserId, effectivePersist, storageKey, onUserIdChange],
	);

	const effectiveUserId = controlledUserId ?? internalUserId;
	useEffect(() => {
		if (!effectiveUserId) return;
		const syncProfile =
			profile &&
			(profile.displayName !== undefined ||
				profile.avatarUrl !== undefined ||
				profile.metadata !== undefined)
				? bame.profiles.update(effectiveUserId, profile)
				: bame.profiles.ensure(effectiveUserId);
		void syncProfile.catch(() => {
			// Ignore background ensure/update failures on provider mount
		});
	}, [bame, effectiveUserId, profile]);

	const value = useMemo<BameContextValue>(
		() => ({
			bame,
			userId: controlledUserId ?? internalUserId,
			setUserId,
		}),
		[bame, controlledUserId, internalUserId, setUserId],
	);

	return <BameContext.Provider value={value}>{children}</BameContext.Provider>;
};

export const useBame = (): BameContextValue => {
	const ctx = useContext(BameContext);
	if (!ctx) {
		throw new Error('useBame must be used inside a <BameProvider>');
	}
	return ctx;
};

export interface CreateLobbyHookInput<TConfig = unknown>
	extends Omit<CreateLobbyInput<TConfig>, 'userId' | 'game'> {
	game: string | Game<unknown, MoveMap<unknown>, TConfig, unknown>;
	userId?: string;
}

export interface UseLobbyOptions<TConfig = unknown> {
	/** Seed a room returned by create/join without a loading flash. */
	initialLobby?: Lobby<TConfig>;
	/** Recovery polling in milliseconds; false disables it. Default: 2000. */
	pollIntervalMs?: number | false;
	/** Open a real-time SSE subscription for lobby updates. Default: true. */
	subscribe?: boolean;
}

export const useLobby = <TConfig = unknown>(
	controlledLobbyId: string | null = null,
	{
		initialLobby,
		pollIntervalMs = 2000,
		subscribe: enableSubscribe = true,
	}: UseLobbyOptions<TConfig> = {},
) => {
	const { bame, userId } = useBame();
	const [internalLobbyId, setInternalLobbyId] = useState<string | null>(
		controlledLobbyId,
	);
	const lobbyId = controlledLobbyId ?? internalLobbyId;

	const [lobbySnapshot, storeLobby] = useState<{
		owner: string;
		value: Lobby<TConfig> | null;
	}>({ owner: userId, value: initialLobby ?? null });
	const setLobby = useCallback(
		(value: Lobby<TConfig> | null) => storeLobby({ owner: userId, value }),
		[userId],
	);
	const lobby =
		lobbySnapshot.owner === userId &&
		(!lobbyId || lobbySnapshot.value?.id === lobbyId)
			? lobbySnapshot.value
			: null;
	const [loading, setLoading] = useState<boolean>(Boolean(lobbyId));
	const [acting, setActing] = useState<boolean>(false);
	const [error, setError, errorDetails] = useErrorState();
	const versionRef = useRef<number>(0);
	const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());

	useEffect(() => {
		if (controlledLobbyId !== null) {
			setInternalLobbyId(controlledLobbyId);
		}
	}, [controlledLobbyId]);

	const applyLobbySnapshot = useCallback(
		(next: Lobby<TConfig> | null) => {
			if (!next) {
				versionRef.current = 0;
				setLobby(null);
				return;
			}
			if (next.version > versionRef.current) {
				versionRef.current = next.version;
				setLobby(next);
			}
		},
		[setLobby],
	);

	useEffect(() => {
		if (!lobbyId) {
			versionRef.current = 0;
			setLobby(null);
			setLoading(false);
			return;
		}

		let cancelled = false;
		const controller = new AbortController();
		const runtime =
			'withOptions' in bame && typeof bame.withOptions === 'function'
				? (bame as BameClientRuntime).withOptions({ signal: controller.signal })
				: bame;
		let pending: Promise<void> | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		versionRef.current = 0;
		if (initialLobby?.id === lobbyId) applyLobbySnapshot(initialLobby);
		setLoading(!initialLobby || initialLobby.id !== lobbyId);
		setError(null);

		const refresh = (): Promise<void> => {
			if (cancelled) return Promise.resolve();
			if (pending) return pending;
			const requestedAtVersion = versionRef.current;
			pending = runtime.lobbies
				.get<TConfig>(lobbyId, userId)
				.then((next) => {
					if (cancelled) return;
					// A delayed missing-room response must not clear a newer stream snapshot.
					if (next || versionRef.current === requestedAtVersion)
						applyLobbySnapshot(next);
					setError(null);
				})
				.catch((error: unknown) => {
					if (!cancelled)
						setError(
							error instanceof Error ? error.message : 'Failed to load lobby',
							error,
						);
				})
				.finally(() => {
					pending = null;
					if (!cancelled) setLoading(false);
				});
			return pending;
		};
		const poll = async () => {
			await refresh();
			if (
				!cancelled &&
				pollIntervalMs !== false &&
				Number.isFinite(pollIntervalMs) &&
				pollIntervalMs > 0
			) {
				timer = setTimeout(() => void poll(), pollIntervalMs);
			}
		};
		refreshRef.current = refresh;
		void poll();
		return () => {
			cancelled = true;
			controller.abort();
			clearTimeout(timer);
			refreshRef.current = () => Promise.resolve();
		};
	}, [
		bame,
		lobbyId,
		userId,
		initialLobby,
		pollIntervalMs,
		applyLobbySnapshot,
		setLobby,
		setError,
	]);

	useEffect(() => {
		if (!lobbyId || !enableSubscribe) return;
		let cancelled = false;
		const unsub = bame.lobbies.subscribe(
			lobbyId,
			(updated) => {
				if (!cancelled) applyLobbySnapshot(updated as Lobby<TConfig>);
			},
			{
				userId,
				onReady: () => refreshRef.current(),
				onError: (error) => {
					if (!cancelled)
						setError(
							error instanceof Error
								? error.message
								: 'Lobby subscription failed',
							error,
						);
				},
			},
		);
		return () => {
			cancelled = true;
			unsub();
		};
	}, [bame, lobbyId, userId, enableSubscribe, applyLobbySnapshot, setError]);

	const create = useCallback(
		async (input: CreateLobbyHookInput<TConfig>) => {
			setError(null);
			setActing(true);
			try {
				const gameName =
					typeof input.game === 'string' ? input.game : input.game.name;
				const created = await bame.lobbies.create<TConfig>({
					userId: input.userId ?? userId,
					game: gameName,
					config: input.config,
					isPrivate: input.isPrivate,
					readyByDefault: input.readyByDefault,
				});
				versionRef.current = created.version;
				setInternalLobbyId(created.id);
				setLobby(created);
				return created;
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : 'Failed to create lobby';
				setError(msg, err);
				throw err;
			} finally {
				setActing(false);
			}
		},
		[bame, userId, setLobby, setError],
	);

	const join = useCallback(
		async (targetLobbyId?: string) => {
			const idToJoin = targetLobbyId ?? lobbyId;
			if (!idToJoin) return null;
			setError(null);
			setActing(true);
			try {
				const updated = (await bame.lobbies.join({
					userId,
					lobbyId: idToJoin,
				})) as Lobby<TConfig>;
				setInternalLobbyId(updated.id);
				applyLobbySnapshot(updated);
				return updated;
			} catch (err) {
				const msg = err instanceof Error ? err.message : 'Failed to join lobby';
				setError(msg, err);
				throw err;
			} finally {
				setActing(false);
			}
		},
		[bame, lobbyId, userId, applyLobbySnapshot, setError],
	);

	const joinByCode = useCallback(
		async (code: string) => {
			setError(null);
			setActing(true);
			try {
				const updated = (await bame.lobbies.joinByCode({
					userId,
					code,
				})) as Lobby<TConfig>;
				versionRef.current = updated.version;
				setInternalLobbyId(updated.id);
				setLobby(updated);
				return updated;
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : 'Failed to join lobby by code';
				setError(msg, err);
				throw err;
			} finally {
				setActing(false);
			}
		},
		[bame, userId, setLobby, setError],
	);

	const setReady = useCallback(
		async (ready: boolean) => {
			if (!lobbyId) return null;
			setError(null);
			setActing(true);
			try {
				const updated = (await bame.lobbies.setReady({
					userId,
					lobbyId,
					ready,
				})) as Lobby<TConfig>;
				applyLobbySnapshot(updated);
				return updated;
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : 'Failed to update ready state';
				setError(msg, err);
				throw err;
			} finally {
				setActing(false);
			}
		},
		[bame, lobbyId, userId, applyLobbySnapshot, setError],
	);

	const leave = useCallback(async () => {
		if (!lobbyId) return null;
		setError(null);
		setActing(true);
		try {
			const updated = (await bame.lobbies.leave({
				userId,
				lobbyId,
			})) as Lobby<TConfig> | null;
			setInternalLobbyId(null);
			applyLobbySnapshot(null);
			return updated;
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to leave lobby';
			setError(msg, err);
			throw err;
		} finally {
			setActing(false);
		}
	}, [bame, lobbyId, userId, applyLobbySnapshot, setError]);

	const start = useCallback(async () => {
		if (!lobbyId) return null;
		setError(null);
		setActing(true);
		try {
			return await bame.lobbies.start({ userId, lobbyId });
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to start match';
			setError(msg, err);
			throw err;
		} finally {
			setActing(false);
		}
	}, [bame, lobbyId, userId, setError]);

	const close = useCallback(async () => {
		if (!lobbyId) return null;
		setActing(true);
		setError(null);
		try {
			const updated = (await bame.lobbies.close({
				userId,
				lobbyId,
			})) as Lobby<TConfig>;
			applyLobbySnapshot(updated);
			return updated;
		} catch (error) {
			setError(
				error instanceof Error ? error.message : 'Failed to close lobby',
				error,
			);
			throw error;
		} finally {
			setActing(false);
		}
	}, [bame, lobbyId, userId, applyLobbySnapshot, setError]);

	const kick = useCallback(
		async (targetUserId: string) => {
			if (!lobbyId) return null;
			setActing(true);
			setError(null);
			try {
				const updated = (await bame.lobbies.kick({
					userId,
					lobbyId,
					targetUserId,
				})) as Lobby<TConfig>;
				applyLobbySnapshot(updated);
				return updated;
			} catch (error) {
				setError(
					error instanceof Error ? error.message : 'Failed to kick player',
					error,
				);
				throw error;
			} finally {
				setActing(false);
			}
		},
		[bame, lobbyId, userId, applyLobbySnapshot, setError],
	);

	const rematch = useCallback(
		async (matchId: string) => {
			if (!lobbyId) return null;
			setActing(true);
			setError(null);
			try {
				const updated = (await bame.lobbies.rematch({
					userId,
					lobbyId,
					matchId,
				})) as Lobby<TConfig>;
				applyLobbySnapshot(updated);
				return updated;
			} catch (error) {
				setError(
					error instanceof Error ? error.message : 'Failed to prepare rematch',
					error,
				);
				throw error;
			} finally {
				setActing(false);
			}
		},
		[bame, lobbyId, userId, applyLobbySnapshot, setError],
	);

	const reset = useCallback(() => {
		versionRef.current = 0;
		setInternalLobbyId(null);
		setLobby(null);
		setError(null);
	}, [setLobby, setError]);

	const isHost = Boolean(lobby && lobby.hostId === userId);
	const currentMember = lobby?.members.find((m) => m.userId === userId);
	const isReady = Boolean(currentMember?.ready);
	const canStart = Boolean(
		lobby &&
			isHost &&
			lobby.status === 'open' &&
			lobby.members.length >= lobby.minPlayers &&
			lobby.members.length <= lobby.maxPlayers &&
			lobby.members.every((m) => m.ready),
	);

	return {
		lobby,
		lobbyId,
		matchId: lobby?.matchId ?? null,
		isHost,
		isReady,
		canStart,
		loading,
		acting,
		error,
		errorDetails,
		create,
		join,
		joinByCode,
		setReady,
		leave,
		kick,
		start,
		close,
		rematch,
		reset,
	};
};

export type LobbySessionScreen =
	| { screen: 'lobby' }
	| { screen: 'game'; matchId: string };

export interface UseLobbySessionOptions {
	userId?: string;
	pollIntervalMs?: number | false;
	onClose: (reason: 'closed' | 'left' | 'removed') => void;
	onMatchEntered?: (matchId: string) => void;
}

/**
 * Headless online lobby session controller handling waiting-room <-> match
 * screen transitions, rematch resets, and kicked/closed room detection.
 */
export const useLobbySession = <TConfig = unknown>(
	initialLobby: Lobby<TConfig>,
	{
		userId: explicitUserId,
		pollIntervalMs = 2000,
		onClose,
		onMatchEntered,
	}: UseLobbySessionOptions,
) => {
	const { userId: contextUserId } = useBame();
	const userId = explicitUserId ?? contextUserId;
	const [view, setView] = useState<LobbySessionScreen>(() =>
		initialLobby.status === 'started' && initialLobby.matchId
			? { screen: 'game', matchId: initialLobby.matchId }
			: { screen: 'lobby' },
	);
	const {
		lobby: current,
		loading,
		error,
		errorDetails,
		setReady,
		start,
		leave,
		kick,
		close,
		rematch,
		acting,
		canStart,
		isHost,
		isReady,
	} = useLobby<TConfig>(initialLobby.id, {
		initialLobby,
		pollIntervalMs,
		subscribe: view.screen === 'lobby',
	});
	const lobby = current ?? initialLobby;
	const enteredMatchRef = useRef<string | null>(
		initialLobby.status === 'started' && initialLobby.matchId
			? initialLobby.matchId
			: null,
	);
	const leavingRef = useRef(false);
	const closeNotifiedRef = useRef(false);
	const mountedRef = useRef(false);
	const onCloseRef = useRef(onClose);
	const onMatchEnteredRef = useRef(onMatchEntered);
	onCloseRef.current = onClose;
	onMatchEnteredRef.current = onMatchEntered;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (loading) return;
		const removedFromLobby = Boolean(
			current &&
				current.status !== 'closed' &&
				!current.members.some((member) => member.userId === userId),
		);
		const forbiddenPoll =
			errorDetails?.code === 'FORBIDDEN' ||
			errorDetails?.code === 'NOT_A_MEMBER';
		if (removedFromLobby || forbiddenPoll) {
			if (!leavingRef.current && !closeNotifiedRef.current) {
				closeNotifiedRef.current = true;
				onCloseRef.current('removed');
			}
			return;
		}
		if ((!current && !errorDetails) || current?.status === 'closed') {
			if (!closeNotifiedRef.current) {
				closeNotifiedRef.current = true;
				onCloseRef.current(leavingRef.current ? 'left' : 'closed');
			}
			return;
		}
		if (
			current?.status === 'started' &&
			current.matchId &&
			enteredMatchRef.current !== current.matchId
		) {
			enteredMatchRef.current = current.matchId;
			setView({ screen: 'game', matchId: current.matchId });
			onMatchEnteredRef.current?.(current.matchId);
		} else if (current?.status === 'open') {
			enteredMatchRef.current = null;
			setView((previous) =>
				previous.screen === 'lobby' ? previous : { screen: 'lobby' },
			);
		}
	}, [current, loading, errorDetails, userId]);

	const startMatch = useCallback(async () => {
		const match = await start();
		if (mountedRef.current && match) {
			enteredMatchRef.current = match.id;
			setView({ screen: 'game', matchId: match.id });
		}
		return match;
	}, [start]);

	const leaveOrClose = useCallback(async () => {
		leavingRef.current = true;
		try {
			if (lobby.hostId === userId) await close();
			else await leave();
			if (mountedRef.current && !closeNotifiedRef.current) {
				closeNotifiedRef.current = true;
				onCloseRef.current('left');
			}
		} catch (err) {
			leavingRef.current = false;
			throw err;
		}
	}, [lobby.hostId, userId, close, leave]);

	const kickPlayer = useCallback(
		async (targetUserId: string) => kick(targetUserId),
		[kick],
	);

	const prepareRematch = useCallback(async () => {
		if (!lobby.matchId) return null;
		return rematch(lobby.matchId);
	}, [lobby.matchId, rematch]);

	const returnToLobby = useCallback(() => setView({ screen: 'lobby' }), []);

	const resumeMatch = useCallback(() => {
		if (lobby.matchId) setView({ screen: 'game', matchId: lobby.matchId });
	}, [lobby.matchId]);

	return {
		lobby,
		view,
		isHost,
		isReady,
		canStart,
		loading,
		acting,
		error,
		errorDetails,
		setReady,
		startMatch,
		leaveOrClose,
		kickPlayer,
		prepareRematch,
		returnToLobby,
		resumeMatch,
	};
};

export type BoundMoves<
	// biome-ignore lint/suspicious/noExplicitAny: generic default
	TMoves extends MoveMap<any>,
	TView,
> = {
	[K in keyof TMoves & string]: (
		...args: MoveArgs<TMoves[K]>
	) => Promise<{ ok: true; view: MatchView<TView> } | ErrorResult>;
};

export interface UseMatchOptions {
	/** Override the active player ID instead of reading from `BameProvider` */
	userId?: string;
	/** Recovery polling interval in milliseconds. Disabled by default. */
	pollIntervalMs?: number | false;
	/**
	 * Automatically update `BameProvider`'s `userId` to `turn.currentPlayerId`
	 * after a valid move or undo in local hot-seat multiplayer games.
	 */
	autoSwitchSeat?: boolean;
}

export type ConnectionState =
	| 'disconnected'
	| 'connecting'
	| 'connected'
	| 'reconnecting'
	| 'error';
export const useMatch = <
	// biome-ignore lint/suspicious/noExplicitAny: generic game inference
	TGame extends Game<any, any, any, any>,
>(
	game: TGame,
	matchId: string | null,
	optionsOrUserId?: string | UseMatchOptions,
) => {
	type TView = ViewOf<TGame>;
	type TMoves = MovesOf<TGame>;
	const options =
		typeof optionsOrUserId === 'string'
			? { userId: optionsOrUserId }
			: (optionsOrUserId ?? {});
	const { bame, userId: contextUserId, setUserId } = useBame();
	const userId = options.userId ?? contextUserId;
	const pollIntervalMs = options.pollIntervalMs || 0;
	const scope = JSON.stringify([matchId, userId]);
	const scopeRef = useRef(scope);
	scopeRef.current = scope;
	const [snapshot, setSnapshot] = useState<{
		scope: string;
		view: MatchView<TView> | null;
	}>({ scope, view: null });
	const view = snapshot.scope === scope ? snapshot.view : null;
	const [loading, setLoading] = useState(Boolean(matchId));
	const [acting, setActing] = useState(false);
	const [error, setError, errorDetails] = useErrorState();
	const [connection, setConnection] = useState<ConnectionState>(
		matchId ? 'connecting' : 'disconnected',
	);
	const feedRef = useRef<MatchFeed<MatchView<TView>> | null>(null);
	const liveRef = useRef(false);
	useEffect(() => {
		let cancelled = false;
		liveRef.current = true;
		feedRef.current = null;
		setActing(false);
		setError(null);
		setSnapshot({ scope, view: null });
		setLoading(Boolean(matchId));
		setConnection(matchId ? 'connecting' : 'disconnected');
		if (!matchId)
			return () => {
				liveRef.current = false;
			};
		const active = () => !cancelled && scopeRef.current === scope;
		const feed = new MatchFeed<MatchView<TView>>({
			fetchLatest: async () => {
				const latest = await bame.matches.get<TView>(matchId, userId);
				if (!latest) throw new Error('Match not found');
				return { version: latest.version, view: latest };
			},
			onChange: (next) => {
				if (active()) {
					setSnapshot({ scope, view: next });
					setLoading(false);
				}
			},
		});
		feedRef.current = feed;
		const failed = (err: unknown) => {
			if (active()) {
				setError(err instanceof Error ? err.message : 'Connection failed', err);
				setLoading(false);
				const code = (err as { code?: string })?.code;
				setConnection(
					[
						'401',
						'403',
						'404',
						'UNAUTHORIZED',
						'FORBIDDEN',
						'NOT_FOUND',
					].includes(code ?? '')
						? 'error'
						: 'reconnecting',
				);
			}
		};
		const unsub = bame.matches.subscribe<TView>(
			matchId,
			userId,
			(incoming, version) => {
				if (active()) feed.receive({ version, view: incoming });
			},
			{
				onReady: () => {
					if (active()) {
						setConnection('connected');
						setError(null);
						void feed.refetch().catch(failed);
					}
				},
				onError: failed,
			},
		);
		void feed.refetch().catch(failed);
		let timer: ReturnType<typeof setTimeout> | undefined;
		async function poll() {
			const initial = !feed.view;
			try {
				await feed.refetch();
				if (initial && active()) setError(null);
			} catch (error) {
				if (!feed.view) failed(error);
			} finally {
				if (active()) timer = setTimeout(() => void poll(), pollIntervalMs);
			}
		}
		if (Number.isFinite(pollIntervalMs) && pollIntervalMs > 0)
			timer = setTimeout(() => void poll(), pollIntervalMs);
		return () => {
			cancelled = true;
			liveRef.current = false;
			if (feedRef.current === feed) feedRef.current = null;
			clearTimeout(timer);
			unsub();
		};
	}, [bame, matchId, userId, scope, setError, pollIntervalMs]);
	const perform = useCallback(
		async (
			kind: 'move' | 'undo' | 'forfeit',
			move?: string,
			args: unknown[] = [],
		): Promise<MoveResult<TView>> => {
			const feed = feedRef.current;
			const active = () =>
				liveRef.current &&
				scopeRef.current === scope &&
				feedRef.current === feed;
			if (!matchId || !feed?.view)
				return { ok: false, error: 'No loaded match' };
			setError(null);
			setActing(true);
			const input = {
				matchId,
				userId,
				requestId: globalThis.crypto.randomUUID(),
				expectedVersion: feed.version,
			};
			try {
				const result =
					kind === 'move'
						? await bame.matches.move<TView>({
								...input,
								move: move ?? '',
								args,
							})
						: kind === 'undo'
							? await bame.matches.undo<TView>(input)
							: await bame.matches.forfeit<TView>(input);
				if (active()) {
					if (result.ok) {
						feed.receive({ version: result.view.version, view: result.view });
						if (options.autoSwitchSeat && result.view.status === 'active')
							setUserId(result.view.turn.currentPlayerId);
					} else {
						setError(result.error, result);
						if (result.code === 'CONFLICT') void feed.refetch().catch(() => {});
					}
				}
				return result;
			} catch (err) {
				if (active())
					setError(err instanceof Error ? err.message : 'Action failed', err);
				throw err;
			} finally {
				if (active()) setActing(false);
			}
		},
		[bame, matchId, userId, scope, options.autoSwitchSeat, setUserId, setError],
	);
	const moves = useMemo(
		() =>
			new Proxy({} as BoundMoves<TMoves, TView>, {
				get:
					(_target, prop: string) =>
					(...args: unknown[]) =>
						perform('move', prop, args),
			}),
		[perform],
	);
	const checkMove = useCallback(
		<K extends keyof TMoves & string>(
			name: K,
			...args: MoveArgs<TMoves[K]>
		): MoveCheck => {
			if (
				!view ||
				view.status !== 'active' ||
				!view.players.some((p) => p.id === userId) ||
				!Object.hasOwn(game.moves, name)
			)
				return 'denied';
			const outOfTurn = view.turn.currentPlayerId !== userId;
			if (
				outOfTurn &&
				!view.turn.waitingFor?.includes(userId) &&
				game.turn?.allowOutOfTurn !== true &&
				!(
					Array.isArray(game.turn?.allowOutOfTurn) &&
					game.turn.allowOutOfTurn.includes(name)
				)
			)
				return 'denied';
			if (game.checkMove)
				return game.checkMove(structuredClone(view), name, args);
			if (!game.view)
				return checkCanMove(
					game,
					view as unknown as MatchView<StateOf<TGame>>,
					userId,
					name,
					...args,
				)
					? 'allowed'
					: 'denied';
			return 'unknown';
		},
		[game, view, userId],
	);
	const canMove = useCallback(
		<K extends keyof TMoves & string>(name: K, ...args: MoveArgs<TMoves[K]>) =>
			checkMove(name, ...args) !== 'denied',
		[checkMove],
	);
	const undo = useCallback(() => perform('undo'), [perform]);
	const forfeit = useCallback(() => perform('forfeit'), [perform]);
	return {
		view,
		state: view?.state ?? null,
		turn: view?.turn ?? null,
		status: view?.status ?? null,
		result: view?.result,
		isMyTurn: view?.status === 'active' && view.turn.currentPlayerId === userId,
		isWaitingForMe:
			view?.status === 'active' &&
			(view.turn.waitingFor ?? [view.turn.currentPlayerId]).includes(userId),
		loading: snapshot.scope === scope ? loading : Boolean(matchId),
		acting: snapshot.scope === scope && acting,
		error: snapshot.scope === scope ? error : null,
		errorDetails: snapshot.scope === scope ? errorDetails : null,
		connection:
			snapshot.scope === scope
				? connection
				: matchId
					? ('connecting' as const)
					: ('disconnected' as const),
		moves,
		checkMove,
		canMove,
		undo,
		forfeit,
	};
};

export interface UseLocalMatchOptions<TConfig = unknown> {
	/**
	 * Player IDs participating in the local match.
	 * Defaults to `[userId]` from `BameProvider` for single-player games.
	 */
	players?: readonly string[];
	/** Optional game configuration passed to `lobbies.create` */
	config?: TConfig;
	/**
	 * Whether to automatically start a match on mount (default: `true`).
	 * Set to `false` if you want to show a start screen before calling `startMatch()`.
	 */
	autoStart?: boolean;
	/**
	 * Automatically update `BameProvider`'s `userId` to `turn.currentPlayerId`
	 * after a valid move or undo (default: `true` when `players.length > 1`).
	 */
	autoSwitchSeat?: boolean;
}

/**
 * Turnkey hook for single-player and local hot-seat multiplayer games.
 * Handles creating a lobby, joining all local players, and starting/restarting the match.
 */
export const useLocalMatch = <
	// biome-ignore lint/suspicious/noExplicitAny: generic game inference
	TGame extends Game<any, any, any, any>,
>(
	game: TGame,
	options: UseLocalMatchOptions = {},
) => {
	const { bame, userId, setUserId } = useBame();
	const [matchId, setMatchId] = useState<string | null>(null);
	const [starting, setStarting] = useState<boolean>(options.autoStart ?? true);
	const [setupError, setSetupError, setupErrorDetails] = useErrorState();

	const playersKey = options.players ? options.players.join('\0') : '';
	const hasMultiplePlayers = (options.players?.length ?? 1) > 1;
	const autoSwitchSeat = options.autoSwitchSeat ?? hasMultiplePlayers;

	const pendingStart = useRef<Promise<Awaited<
		ReturnType<BameRuntime['lobbies']['start']>
	> | null> | null>(null);
	const startMatch = useCallback(() => {
		if (pendingStart.current) return pendingStart.current;
		const task = (async () => {
			setStarting(true);
			setSetupError(null);
			try {
				const roster =
					options.players && options.players.length > 0
						? [...options.players]
						: [userId];
				const hostId = roster[0];
				const created = await bame.lobbies.create({
					userId: hostId,
					game: game.name,
					config: options.config,
				});
				for (const participantId of roster.slice(1)) {
					await bame.lobbies.join({
						userId: participantId,
						lobbyId: created.id,
					});
				}
				const started = await bame.lobbies.start({
					userId: hostId,
					lobbyId: created.id,
				});
				if (autoSwitchSeat) {
					setUserId(started.turn.currentPlayerId);
				}
				setMatchId(started.id);
				return started;
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : 'Failed to start local match';
				setSetupError(msg, err);
				return null;
			} finally {
				setStarting(false);
			}
		})();
		pendingStart.current = task;
		void task.finally(() => {
			if (pendingStart.current === task) pendingStart.current = null;
		});
		return task;
	}, [
		bame,
		game.name,
		options.config,
		options.players,
		userId,
		autoSwitchSeat,
		setUserId,
		setSetupError,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: run once when autoStart is enabled
	useEffect(() => {
		if (options.autoStart ?? true) {
			void startMatch();
		}
	}, [playersKey, options.autoStart]);

	const match = useMatch(game, matchId, { autoSwitchSeat });

	return {
		...match,
		matchId,
		starting,
		loading: starting || match.loading,
		error: setupError ?? match.error,
		errorDetails: setupError ? setupErrorDetails : match.errorDetails,
		startMatch,
		restart: startMatch,
	};
};

export const useMatchesList = <TView = unknown>(
	filter: Omit<ListMatchesFilter, 'userId'> & { userId?: string } = {},
) => {
	const { bame, userId } = useBame();
	const targetUserId = filter.userId ?? userId;
	const scope = JSON.stringify([
		targetUserId,
		filter.waitingForUserId,
		filter.status,
		filter.game,
	]);
	const active = useRef({ bame, scope });
	active.current = { bame, scope };
	const request = useRef<AbortController | null>(null);
	const [snapshot, setSnapshot] = useState<{
		bame: BameRuntime;
		scope: string;
		matches: MatchView<TView>[];
		loading: boolean;
		failure: unknown;
	}>({ bame, scope, matches: [], loading: true, failure: null });
	const refresh = useCallback(async () => {
		if (active.current.bame !== bame || active.current.scope !== scope)
			return [];
		request.current?.abort();
		const controller = new AbortController();
		request.current = controller;
		const runtime =
			'withOptions' in bame && typeof bame.withOptions === 'function'
				? (bame as BameClientRuntime).withOptions({ signal: controller.signal })
				: bame;
		const current = () =>
			!controller.signal.aborted &&
			request.current === controller &&
			active.current.bame === bame &&
			active.current.scope === scope;
		setSnapshot((previous) => ({
			bame,
			scope,
			matches:
				previous.bame === bame && previous.scope === scope
					? previous.matches
					: [],
			loading: true,
			failure: null,
		}));
		try {
			const matches = await runtime.matches.list<TView>({
				userId: targetUserId,
				waitingForUserId: filter.waitingForUserId,
				status: filter.status,
				game: filter.game,
			});
			if (current())
				setSnapshot({ bame, scope, matches, loading: false, failure: null });
			return current() ? matches : [];
		} catch (failure) {
			if (current())
				setSnapshot((previous) => ({ ...previous, loading: false, failure }));
			return [];
		}
	}, [
		bame,
		scope,
		targetUserId,
		filter.waitingForUserId,
		filter.status,
		filter.game,
	]);
	useEffect(() => {
		void refresh();
		return () => request.current?.abort();
	}, [refresh]);
	const visible = snapshot.bame === bame && snapshot.scope === scope;
	return {
		matches: visible ? snapshot.matches : [],
		loading: !visible || snapshot.loading,
		error:
			visible && snapshot.failure
				? snapshot.failure instanceof Error
					? snapshot.failure.message
					: 'Failed to load matches list'
				: null,
		errorDetails: visible ? getErrorDetails(snapshot.failure) : null,
		refresh,
	};
};

export interface UseNotificationsOptions<TData = unknown> {
	userId?: string;
	/** Show native alerts when permission is granted. Request permission from a user gesture. */
	browserNotifications?: boolean;
	updateDocumentTitle?: boolean;
	formatNotification?: (notification: GameNotification<TData>) => {
		title: string;
		body: string;
	};
}

export const useNotifications = <TData = unknown>(
	optionsOrUserId?: string | UseNotificationsOptions<TData>,
) => {
	const options =
		typeof optionsOrUserId === 'string'
			? { userId: optionsOrUserId }
			: (optionsOrUserId ?? {});
	const { bame, userId: contextUserId } = useBame();
	const userId = options.userId ?? contextUserId;
	const latestOptions = useRef(options);
	latestOptions.current = options;
	const [snapshot, setSnapshot] = useState<{
		bame: BameRuntime;
		userId: string;
		items: GameNotification<TData>[];
	}>({ bame, userId, items: [] });
	const notifications =
		snapshot.bame === bame && snapshot.userId === userId ? snapshot.items : [];
	useEffect(() => {
		let cancelled = false;
		if (!userId) return;
		setSnapshot({ bame, userId, items: [] });
		const seen = new Set<string>();
		const off = bame.matches.subscribeNotifications<TData>(
			userId,
			(incoming) => {
				if (cancelled || seen.has(incoming.id)) return;
				seen.add(incoming.id);
				setSnapshot((previous) => ({
					bame,
					userId,
					items: [
						incoming,
						...(previous.bame === bame && previous.userId === userId
							? previous.items
							: []),
					],
				}));
				if (
					latestOptions.current.browserNotifications &&
					typeof window !== 'undefined' &&
					'Notification' in window &&
					window.Notification.permission === 'granted'
				) {
					const formatted = latestOptions.current.formatNotification?.(
						incoming,
					) ?? { title: `Bame — ${incoming.game}`, body: incoming.message };
					try {
						new window.Notification(formatted.title, { body: formatted.body });
					} catch {
						/* Platform may require service-worker delivery. */
					}
				}
			},
			{ userId },
		);
		return () => {
			cancelled = true;
			off();
		};
	}, [bame, userId]);
	useEffect(() => {
		if (!options.updateDocumentTitle || typeof document === 'undefined') return;
		const base = document.title.replace(/^\(\d+\)\s*/, '');
		const title = notifications.length
			? `(${notifications.length}) ${base}`
			: base;
		document.title = title;
		return () => {
			if (document.title === title) document.title = base;
		};
	}, [bame, userId, notifications.length, options.updateDocumentTitle]);
	const dismiss = useCallback(
		(id: string) =>
			setSnapshot((previous) =>
				previous.bame === bame && previous.userId === userId
					? {
							...previous,
							items: previous.items.filter((item) => item.id !== id),
						}
					: previous,
			),
		[bame, userId],
	);
	const clear = useCallback(
		() => setSnapshot({ bame, userId, items: [] }),
		[bame, userId],
	);
	const requestPermission = useCallback(async (): Promise<
		NotificationPermission | 'unsupported'
	> => {
		if (typeof window === 'undefined' || !('Notification' in window))
			return 'unsupported';
		if (window.Notification.permission !== 'default')
			return window.Notification.permission;
		try {
			return await window.Notification.requestPermission();
		} catch {
			return window.Notification.permission;
		}
	}, []);
	return {
		notifications,
		latest: notifications[0] ?? null,
		dismiss,
		clear,
		requestPermission,
	};
};

export const useProfile = (targetUserId?: string) => {
	const { bame, userId: contextUserId } = useBame();
	const userId = targetUserId ?? contextUserId;
	const [profile, setProfile] = useState<Profile | null>(null);
	const [loading, setLoading] = useState<boolean>(Boolean(userId));
	const [error, setError, errorDetails] = useErrorState();

	useEffect(() => {
		if (!userId) {
			setProfile(null);
			setLoading(false);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		bame.profiles
			.ensure(userId)
			.then((ensured) => {
				if (!cancelled) {
					setProfile(ensured);
					setLoading(false);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : 'Failed to load profile',
						err,
					);
					setLoading(false);
				}
			});

		const unsub = bame.profiles.subscribe(userId, (updated) => {
			if (!cancelled) {
				setProfile(updated);
			}
		});

		return () => {
			cancelled = true;
			unsub();
		};
	}, [bame, userId, setError]);

	const updateProfile = useCallback(
		async (updates: UpdateProfileInput) => {
			if (!userId) return null;
			setError(null);
			try {
				const updated = await bame.profiles.update(userId, updates);
				setProfile(updated);
				return updated;
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : 'Failed to update profile';
				setError(msg, err);
				throw err;
			}
		},
		[bame, userId, setError],
	);

	return {
		profile,
		stats: profile?.stats ?? null,
		statsByGame: profile?.statsByGame ?? null,
		loading,
		error,
		errorDetails,
		updateProfile,
	};
};

export const useLeaderboard = () => {
	const { bame } = useBame();
	const [profiles, setProfiles] = useState<Profile[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError, errorDetails] = useErrorState();

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const list = await bame.profiles.list();
			setProfiles(list);
			return list;
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : 'Failed to load leaderboard';
			setError(msg, err);
			return [];
		} finally {
			setLoading(false);
		}
	}, [bame, setError]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return {
		profiles,
		loading,
		error,
		errorDetails,
		refresh,
	};
};

export interface UseProfilesOptions {
	/** Polling interval in ms; default 5000. Set false to refresh only when `userIds` changes. */
	pollIntervalMs?: number | false;
	/** Optional runtime override (defaults to `useBame().bame`). */
	runtime?: Pick<BameRuntime, 'profiles'>;
}

function mergeProfileMap(
	members: Set<string>,
	current: Record<string, Profile>,
	incoming: Record<string, Profile>,
): Record<string, Profile> {
	const next: Record<string, Profile> = {};
	for (const [id, profile] of Object.entries(current)) {
		if (members.has(id)) next[id] = profile;
	}
	for (const [id, profile] of Object.entries(incoming)) {
		if (
			members.has(id) &&
			(!Object.hasOwn(next, id) || profile.version > next[id].version)
		) {
			next[id] = profile;
		}
	}
	return next;
}

/**
 * Fetch and periodically refresh player profiles without opening one SSE stream
 * per player. Keeps monotonic versions and retains cached entries on transient failures.
 */
export const useProfiles = (
	userIds: readonly string[],
	{ pollIntervalMs = 5000, runtime }: UseProfilesOptions = {},
): Record<string, Profile> => {
	const { bame } = useBame();
	const profilesApi = (runtime ?? bame).profiles;
	const [profiles, setProfiles] = useState<Record<string, Profile>>({});
	const cacheRef = useRef<Record<string, Profile>>({});
	const userIdsKey = userIds.join('\0');

	useEffect(() => {
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const ids = userIdsKey ? userIdsKey.split('\0') : [];
		const members = new Set(ids);

		const apply = (incoming: Record<string, Profile>) => {
			if (disposed) return;
			const merged = mergeProfileMap(members, cacheRef.current, incoming);
			if (JSON.stringify(merged) === JSON.stringify(cacheRef.current)) return;
			cacheRef.current = merged;
			setProfiles(merged);
		};

		const poll = async () => {
			const entries = await Promise.all(
				[...members].map(async (id) => {
					try {
						const profile = await profilesApi.get(id);
						if (profile) return [id, profile] as const;
					} catch {
						// Profile metadata is optional; retain cached values on transient failures.
					}
					return Object.hasOwn(cacheRef.current, id)
						? ([id, cacheRef.current[id]] as const)
						: undefined;
				}),
			);
			const incoming: Record<string, Profile> = {};
			for (const entry of entries) {
				if (entry) incoming[entry[0]] = entry[1];
			}
			apply(incoming);
			if (
				!disposed &&
				pollIntervalMs !== false &&
				Number.isFinite(pollIntervalMs) &&
				pollIntervalMs > 0
			) {
				timer = setTimeout(() => void poll(), pollIntervalMs);
			}
		};

		apply({});
		if (members.size > 0) void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [profilesApi, userIdsKey, pollIntervalMs]);

	return profiles;
};

export interface UsePresenceOptions {
	userId?: string;
	enabled?: boolean;
	heartbeatMs?: number;
	/** Optional roster IDs pre-populated as `'offline'` when absent from live presence. */
	playerIds?: readonly string[];
}

const currentWindowPresence = (): PresenceStatus => {
	if (typeof document === 'undefined') return 'online';
	return document.visibilityState === 'visible' && document.hasFocus()
		? 'online'
		: 'away';
};

export const usePresence = (
	scope: string | null,
	{
		userId: explicitUserId,
		enabled = true,
		heartbeatMs = 15_000,
		playerIds,
	}: UsePresenceOptions = {},
): Record<string, PresenceStatus> => {
	const { bame, userId: contextUserId } = useBame();
	const userId = explicitUserId ?? contextUserId;
	const [entries, setEntries] = useState<Record<string, PresenceEntry>>({});
	const [localStatus, setLocalStatus] = useState<PresenceStatus>(
		currentWindowPresence,
	);

	useEffect(() => {
		if (!enabled || !scope || !userId || !bame.presence) {
			setEntries({});
			return;
		}
		let cancelled = false;
		const presence = bame.presence;
		const mergeEntries = (incoming: Record<string, PresenceEntry>) => {
			if (cancelled) return;
			setEntries((prev) => {
				const next = { ...prev };
				for (const [id, entry] of Object.entries(incoming)) {
					const existing = next[id];
					if (!existing || entry.updatedAt >= existing.updatedAt) {
						next[id] = entry;
					}
				}
				return next;
			});
		};
		const pushStatus = (status: PresenceStatus) => {
			if (cancelled) return;
			setLocalStatus(status);
			void presence
				.report({ scope, userId, status })
				.then((snap) => mergeEntries(snap.entries))
				.catch(() => {});
		};
		const syncSnapshot = () => {
			void presence
				.get(scope, userId)
				.then((snap) => mergeEntries(snap.entries))
				.catch(() => {});
		};

		const unsub = presence.subscribe(
			scope,
			(snap) => mergeEntries(snap.entries),
			{
				userId,
				onReady: () => {
					syncSnapshot();
					pushStatus(currentWindowPresence());
				},
			},
		);

		pushStatus(currentWindowPresence());
		syncSnapshot();

		const onVisibility = () => pushStatus(currentWindowPresence());
		const onPageHide = () => {
			void presence
				.report({ scope, userId, status: 'offline' })
				.catch(() => {});
		};
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', onVisibility);
		}
		if (typeof window !== 'undefined') {
			window.addEventListener('focus', onVisibility);
			window.addEventListener('blur', onVisibility);
			window.addEventListener('pagehide', onPageHide);
		}

		const heartbeat = setInterval(() => {
			pushStatus(currentWindowPresence());
			const now = Date.now();
			setEntries((prev) => {
				let changed = false;
				const next = { ...prev };
				for (const [id, entry] of Object.entries(prev)) {
					if (entry.status !== 'offline' && entry.expiresAt <= now) {
						next[id] = {
							...entry,
							status: 'offline',
							updatedAt: entry.expiresAt,
						};
						changed = true;
					}
				}
				return changed ? next : prev;
			});
		}, heartbeatMs);

		return () => {
			cancelled = true;
			clearInterval(heartbeat);
			unsub();
			if (typeof document !== 'undefined') {
				document.removeEventListener('visibilitychange', onVisibility);
			}
			if (typeof window !== 'undefined') {
				window.removeEventListener('focus', onVisibility);
				window.removeEventListener('blur', onVisibility);
				window.removeEventListener('pagehide', onPageHide);
			}
			void presence
				.report({ scope, userId, status: 'offline' })
				.catch(() => {});
		};
	}, [bame, scope, userId, enabled, heartbeatMs]);

	const playerIdsKey = playerIds?.join('\0') ?? '';

	return useMemo(() => {
		if (!enabled || !scope || !userId) return {};
		const now = Date.now();
		const map: Record<string, PresenceStatus> = {};
		if (playerIdsKey) {
			for (const id of playerIdsKey.split('\0')) {
				if (id) map[id] = 'offline';
			}
		}
		for (const [id, entry] of Object.entries(entries)) {
			map[id] =
				entry.status !== 'offline' && entry.expiresAt <= now
					? 'offline'
					: entry.status;
		}
		map[userId] = localStatus;
		return map;
	}, [enabled, scope, userId, entries, localStatus, playerIdsKey]);
};
