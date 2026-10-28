// @vitest-environment happy-dom
import { act, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createBame,
	type BameRuntime,
	type MatchView,
	type GameNotification,
} from '@bame/core';
import {
	BameProvider,
	useBame,
	useMatchesList,
	useNotifications,
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
