// @vitest-environment happy-dom

import {
	BameError,
	type BameRuntime,
	createBame,
	defineGame,
	type GameNotification,
	type Lobby,
	lobbyPresenceScope,
	type MatchView,
	type MoveContext,
	type SetupContext,
} from '@bame/core';
import { act, type ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	BameProvider,
	clearStoredLobbyId,
	readStoredLobbyId,
	resumeLobby,
	useBame,
	useLobbySession,
	useMatch,
	useMatchesList,
	useNotifications,
	usePresence,
	useProfiles,
	writeStoredLobbyId,
} from './hooks.js';

const cleanups: (() => Promise<void>)[] = [];
async function render(element: ReactNode) {
	(
		globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	await act(async () => root.render(element));
	cleanups.push(async () => {
		await act(async () => root.unmount());
		container.remove();
	});
	return container;
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

type Counter = { count: number };

function setupCounter(_context: SetupContext): Counter {
	return { count: 0 };
}

function increment({ state }: MoveContext<Counter>) {
	state.count++;
}

it('recovers the active turn when the match stream stays open without delivering moves', async () => {
	vi.useFakeTimers();
	const game = defineGame({
		name: 'poll-counter',
		players: 2,
		setup: setupCounter,
		moves: { increment },
	});
	const api = createBame({ games: [game] });
	const lobby = await api.lobbies.create({ userId: 'one', game: game.name });
	await api.lobbies.join({ userId: 'two', lobbyId: lobby.id });
	const match = await api.lobbies.start({ userId: 'one', lobbyId: lobby.id });
	vi.spyOn(api.matches, 'subscribe').mockImplementation(
		(_matchId, _userId, _onUpdate, options) => {
			void options?.onReady?.();
			return () => {};
		},
	);
	function Probe() {
		const { turn } = useMatch(game, match.id, { pollIntervalMs: 100 });
		return <span>{turn?.currentPlayerId}</span>;
	}
	const screen = await render(
		<BameProvider bame={api} userId="two">
			<Probe />
		</BameProvider>,
	);
	expect(screen.textContent).toBe('one');
	await act(async () => {
		const result = await api.matches.move({
			matchId: match.id,
			userId: 'one',
			move: 'increment',
			args: [],
		});
		expect(result.ok).toBe(true);
	});
	expect(screen.textContent).toBe('one');
	await act(async () => vi.advanceTimersByTimeAsync(100));
	expect(screen.textContent).toBe('two');
});

describe('provider-controlled identity', () => {
	it('does not synchronize an identity until its owner accepts the change', async () => {
		const api = createBame({ games: [] });
		let context!: ReturnType<typeof useBame>;
		function Probe() {
			context = useBame();
			return null;
		}
		await render(
			<BameProvider bame={api} userId="host">
				<Probe />
			</BameProvider>,
		);
		await act(async () => context.setUserId('other'));
		expect(context.userId).toBe('host');
		expect(await api.profiles.get('other')).toBeNull();
	});
	it('follows controlled identity changes and synchronizes only the effective profile', async () => {
		const api = createBame({ games: [] });
		let context!: ReturnType<typeof useBame>;
		function Probe() {
			context = useBame();
			return null;
		}
		function Parent() {
			const [id, setId] = useState('host');
			return (
				<BameProvider bame={api} userId={id} onUserIdChange={setId}>
					<Probe />
				</BameProvider>
			);
		}
		await render(<Parent />);
		await act(async () => context.setUserId('other'));
		expect(context.userId).toBe('other');
		expect((await api.profiles.get('other'))?.id).toBe('other');
	});
});

describe('notification ownership', () => {
	it('deduplicates deliveries, clears on identity change, and restores the title', async () => {
		document.title = 'Game';
		const api = createBame({ games: [] });
		let change!: (id: string) => void;
		let notifications!: ReturnType<typeof useNotifications>;
		function Probe() {
			notifications = useNotifications({ updateDocumentTitle: true });
			return null;
		}
		function Parent() {
			const [id, setId] = useState('a');
			change = setId;
			return (
				<BameProvider bame={api} userId={id}>
					<Probe />
				</BameProvider>
			);
		}
		await render(<Parent />);
		const event = { id: 'private-a' } as GameNotification;
		await act(async () => {
			await api.realtime.publish('user:a:notifications', event);
			await api.realtime.publish('user:a:notifications', event);
		});
		expect(notifications.notifications).toHaveLength(1);
		expect(document.title).toBe('(1) Game');
		await act(async () => change('b'));
		expect(notifications.notifications).toEqual([]);
		expect(document.title).toBe('Game');
		await act(async () => {
			await api.realtime.publish('user:b:notifications', {
				id: 'b',
			} as GameNotification);
		});
		await cleanups.pop()!();
		expect(document.title).toBe('Game');
	});
	it('does not request permission on mount, and formats native notifications after an explicit permission request', async () => {
		let permission: NotificationPermission = 'default';
		const requestPermission = vi.fn(async () => {
			permission = 'granted';
			return permission;
		});
		const native = vi.fn();
		vi.stubGlobal(
			'Notification',
			class {
				static get permission() {
					return permission;
				}
				static requestPermission = requestPermission;
				constructor(title: string, options: NotificationOptions) {
					native(title, options);
				}
			},
		);
		const api = createBame({ games: [] });
		let notifications!: ReturnType<typeof useNotifications>;
		function Probe() {
			notifications = useNotifications({
				browserNotifications: true,
				formatNotification: () => ({ title: 'Localized', body: 'Human text' }),
			});
			return null;
		}
		await render(
			<BameProvider bame={api} userId="a">
				<Probe />
			</BameProvider>,
		);
		expect(requestPermission).not.toHaveBeenCalled();
		await act(async () => {
			await notifications.requestPermission();
		});
		await act(async () => {
			await api.realtime.publish('user:a:notifications', {
				id: 'n',
				game: 'g',
				message: 'CODE',
			} as GameNotification);
		});
		expect(native).toHaveBeenCalledWith('Localized', { body: 'Human text' });
	});
});

describe('match list ownership and ordering', () => {
	it('ignores an older identity request and never shows its previous list under the new owner', async () => {
		const a = deferred<MatchView[]>(),
			b = deferred<MatchView[]>();
		const api = {
			profiles: { ensure: vi.fn().mockResolvedValue(null) },
			matches: {
				list: vi.fn(({ userId }) => (userId === 'a' ? a.promise : b.promise)),
			},
		} as unknown as BameRuntime;
		let change!: (id: string) => void, list!: ReturnType<typeof useMatchesList>;
		function Probe() {
			list = useMatchesList();
			return null;
		}
		function Parent() {
			const [id, setId] = useState('a');
			change = setId;
			return (
				<BameProvider bame={api} userId={id}>
					<Probe />
				</BameProvider>
			);
		}
		await render(<Parent />);
		await act(async () => change('b'));
		expect(list.matches).toEqual([]);
		await act(async () => b.resolve([{ id: 'b' } as MatchView]));
		await act(async () => a.resolve([{ id: 'a' } as MatchView]));
		expect(list.matches.map((match) => match.id)).toEqual(['b']);
	});
	it('ignores superseded refreshes for the same identity', async () => {
		const old = deferred<MatchView[]>(),
			latest = deferred<MatchView[]>();
		const api = {
			profiles: { ensure: vi.fn().mockResolvedValue(null) },
			matches: {
				list: vi
					.fn()
					.mockReturnValueOnce(old.promise)
					.mockReturnValueOnce(latest.promise),
			},
		} as unknown as BameRuntime;
		let list!: ReturnType<typeof useMatchesList>;
		function Probe() {
			list = useMatchesList();
			return null;
		}
		await render(
			<BameProvider bame={api} userId="a">
				<Probe />
			</BameProvider>,
		);
		await act(async () => {
			void list.refresh();
		});
		await act(async () => latest.resolve([{ id: 'latest' } as MatchView]));
		await act(async () => old.resolve([{ id: 'old' } as MatchView]));
		expect(list.matches.map((match) => match.id)).toEqual(['latest']);
	});
});

describe('lobby session, profiles, storage, and presence defaults', () => {
	it('persists lobby IDs safely and resumes active memberships while clearing terminal errors', async () => {
		const store = new Map<string, string>();
		const storage = () => ({
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k),
		});
		writeStoredLobbyId('lobby-1', 'custom:key', storage);
		expect(readStoredLobbyId('custom:key', storage)).toBe('lobby-1');
		clearStoredLobbyId('custom:key', storage);
		expect(readStoredLobbyId('custom:key', storage)).toBeNull();

		const get = vi
			.fn()
			.mockResolvedValueOnce({
				id: 'r1',
				status: 'started',
				members: [{ userId: 'host' }],
			})
			.mockResolvedValueOnce({
				id: 'r1',
				status: 'open',
				members: [{ userId: 'other' }],
			})
			.mockRejectedValueOnce(
				new BameError({ code: 'FORBIDDEN', message: 'no' }),
			)
			.mockRejectedValueOnce(
				new BameError({ code: 'TRANSPORT_ERROR', message: 'offline' }),
			);
		const api = { lobbies: { get } } as unknown as BameRuntime;
		expect(await resumeLobby(api, 'r1', 'host')).toMatchObject({ id: 'r1' });
		expect(await resumeLobby(api, 'r1', 'host')).toBeNull();
		expect(await resumeLobby(api, 'r1', 'host')).toBeNull();
		await expect(resumeLobby(api, 'r1', 'host')).rejects.toThrow('offline');
	});

	it('manages lobby session screen transitions, rematch, and kick notifications', async () => {
		const game = defineGame({
			name: 'session-game',
			players: 2,
			setup: setupCounter,
			moves: { increment },
		});
		const api = createBame({ games: [game] });
		const created = await api.lobbies.create({
			userId: 'host',
			game: game.name,
			isPrivate: true,
		});
		const joined = await api.lobbies.joinByCode({
			userId: 'guest',
			code: created.code!,
		});
		const onClose = vi.fn();
		let session!: ReturnType<typeof useLobbySession>;
		function Probe() {
			session = useLobbySession(joined, { onClose });
			return <span>{session.view.screen}</span>;
		}
		await render(
			<BameProvider bame={api} userId="host">
				<Probe />
			</BameProvider>,
		);
		await act(async () => {
			await session.startMatch();
		});
		expect(session.view.screen).toBe('game');
		await act(async () => session.returnToLobby());
		expect(session.view.screen).toBe('lobby');
		await act(async () => {
			await api.matches.forfeit({
				userId: 'host',
				matchId: session.lobby.matchId!,
			});
			await session.prepareRematch();
		});
		expect(session.canStart).toBe(true);

		const guestClose = vi.fn();
		function GuestProbe() {
			useLobbySession(joined, { onClose: guestClose });
			return null;
		}
		await render(
			<BameProvider bame={api} userId="guest">
				<GuestProbe />
			</BameProvider>,
		);
		await act(async () => {
			await api.lobbies.kick({
				userId: 'host',
				lobbyId: joined.id,
				targetUserId: 'guest',
			});
		});
		expect(guestClose).toHaveBeenCalledWith('removed');
	});

	it('polls profiles monotonically and fills offline defaults in usePresence', async () => {
		vi.useFakeTimers();
		const api = createBame({ games: [] });
		await api.profiles.update('p1', { displayName: 'One' });
		await api.profiles.update('p2', { displayName: 'Two' });
		let profiles!: ReturnType<typeof useProfiles>;
		let presence!: ReturnType<typeof usePresence>;
		function Probe() {
			profiles = useProfiles(['p1', 'p2'], { pollIntervalMs: 100 });
			presence = usePresence(lobbyPresenceScope('l1'), {
				playerIds: ['p1', 'p2', 'p3'],
			});
			return null;
		}
		await render(
			<BameProvider bame={api} userId="p1">
				<Probe />
			</BameProvider>,
		);
		expect(profiles.p2?.displayName).toBe('Two');
		expect(presence).toMatchObject({
			p1: 'online',
			p2: 'offline',
			p3: 'offline',
		});
		await act(async () => {
			await api.profiles.update('p2', { displayName: 'Two Updated' });
			await vi.advanceTimersByTimeAsync(100);
		});
		expect(profiles.p2?.displayName).toBe('Two Updated');
	});
});
