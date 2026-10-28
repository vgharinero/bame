import {
	type BameRuntime,
	type BameClientRuntime,
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
			setInternalUserId(nextId);
			if (typeof window !== 'undefined' && effectivePersist) {
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
		[effectivePersist, storageKey, onUserIdChange],
	);

	useEffect(() => {
		if (!internalUserId) return;
		const syncProfile =
			profile &&
			(profile.displayName !== undefined ||
				profile.avatarUrl !== undefined ||
				profile.metadata !== undefined)
				? bame.profiles.update(internalUserId, profile)
				: bame.profiles.ensure(internalUserId);
		void syncProfile.catch(() => {
			// Ignore background ensure/update failures on provider mount
		});
	}, [bame, internalUserId, profile]);

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
}

export const useLobby = <TConfig = unknown>(
	controlledLobbyId: string | null = null,
	{ initialLobby, pollIntervalMs = 2000 }: UseLobbyOptions<TConfig> = {},
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
		const unsub = runtime.lobbies.subscribe(
			lobbyId,
			(updated) => {
				if (!cancelled) applyLobbySnapshot(updated as Lobby<TConfig>);
			},
			{
				userId,
				onReady: () => refresh(),
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
		void poll();
		return () => {
			cancelled = true;
			controller.abort();
			clearTimeout(timer);
			unsub();
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
		start,
		close,
		rematch,
		reset,
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
		return () => {
			cancelled = true;
			liveRef.current = false;
			if (feedRef.current === feed) feedRef.current = null;
			unsub();
		};
	}, [bame, matchId, userId, scope, setError]);
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
	const { bame, userId: contextUserId } = useBame();
	const targetUserId = filter.userId ?? contextUserId;
	const [matches, setMatches] = useState<MatchView<TView>[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError, errorDetails] = useErrorState();

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const list = await bame.matches.list<TView>({
				userId: targetUserId,
				waitingForUserId: filter.waitingForUserId,
				status: filter.status,
				game: filter.game,
			});
			setMatches(list);
			return list;
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : 'Failed to load matches list';
			setError(msg, err);
			return [];
		} finally {
			setLoading(false);
		}
	}, [
		bame,
		targetUserId,
		filter.waitingForUserId,
		filter.status,
		filter.game,
		setError,
	]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return {
		matches,
		loading,
		error,
		errorDetails,
		refresh,
	};
};

export interface UseNotificationsOptions {
	/** Override the player ID to subscribe notifications for */
	userId?: string;
	/** Automatically request permission and show native `window.Notification` alerts */
	browserNotifications?: boolean;
	/** Prefix `document.title` with `(N)` unread notification count */
	updateDocumentTitle?: boolean;
}

export const useNotifications = <TData = unknown>(
	optionsOrUserId?: string | UseNotificationsOptions,
) => {
	const options: UseNotificationsOptions =
		typeof optionsOrUserId === 'string'
			? { userId: optionsOrUserId }
			: (optionsOrUserId ?? {});

	const { bame, userId: contextUserId } = useBame();
	const userId = options.userId ?? contextUserId;
	const [notifications, setNotifications] = useState<GameNotification<TData>[]>(
		[],
	);

	useEffect(() => {
		if (!userId) return;
		if (
			options.browserNotifications &&
			typeof window !== 'undefined' &&
			'Notification' in window &&
			window.Notification.permission === 'default'
		) {
			void window.Notification.requestPermission().catch(() => {});
		}

		const unsub = bame.matches.subscribeNotifications<TData>(
			userId,
			(incoming) => {
				setNotifications((prev) => [incoming, ...prev]);
				if (
					options.browserNotifications &&
					typeof window !== 'undefined' &&
					'Notification' in window &&
					window.Notification.permission === 'granted'
				) {
					try {
						new window.Notification(`Bame — ${incoming.game}`, {
							body: incoming.message,
						});
					} catch {
						// Ignore notification constructor errors
					}
				}
			},
		);
		return () => {
			unsub();
		};
	}, [bame, userId, options.browserNotifications]);

	useEffect(() => {
		if (!options.updateDocumentTitle || typeof document === 'undefined') return;
		const baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
		document.title =
			notifications.length > 0
				? `(${notifications.length}) ${baseTitle}`
				: baseTitle;
	}, [notifications.length, options.updateDocumentTitle]);

	const dismiss = useCallback((id: string) => {
		setNotifications((prev) => prev.filter((n) => n.id !== id));
	}, []);

	const clear = useCallback(() => {
		setNotifications([]);
	}, []);

	const requestPermission = useCallback(async (): Promise<
		NotificationPermission | 'unsupported'
	> => {
		if (typeof window === 'undefined' || !('Notification' in window)) {
			return 'unsupported';
		}
		if (window.Notification.permission !== 'default') {
			return window.Notification.permission;
		}
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
