import { describe, expect, it } from 'vitest';
import {
	defineGame,
	type SetupContext,
	type MoveContext,
	type ViewContext,
	type EndIfContext,
} from '../engine/index.js';
import { createBame } from './create-bame.js';
import { createBameClient, createBameHandler } from './network.js';

type State = { done: boolean };
function setup(_ctx: SetupContext): State {
	return { done: false };
}
function finish({ state }: MoveContext<State>) {
	state.done = true;
}
function view({ state }: ViewContext<State>) {
	return state;
}
function endIf({ state, player }: EndIfContext<State>) {
	return state.done ? { winner: player.id } : undefined;
}
const game = defineGame({
	name: 'lifecycle',
	players: 2,
	setup,
	moves: { finish },
	view,
	endIf,
});
function fixture() {
	const bame = createBame({ games: [game] });
	const handler = createBameHandler(bame, { unsafeTrustClientIds: true });
	const client = createBameClient({
		url: 'http://localhost/api/bame',
		fetch: (input, init) => handler.fetch(new Request(input, init)),
	});
	return { bame, client };
}

describe('lobby closure and rematches over HTTP', () => {
	it('closes for all members, publishes once, rejects starts/joins and requires the host', async () => {
		const { bame, client } = fixture();
		const lobby = await client.lobbies.create({
			userId: 'host',
			game: game.name,
			isPrivate: true,
		});
		await client.lobbies.joinByCode({ userId: 'guest', code: lobby.code! });
		await expect(
			client.lobbies.close({ userId: 'guest', lobbyId: lobby.id }),
		).rejects.toMatchObject({ code: 'LOBBY_HOST_REQUIRED' });
		const updates: string[] = [];
		const off = bame.lobbies.subscribe(lobby.id, (next) => {
			updates.push(next.status);
		});
		const closed = await client.lobbies.close({
			userId: 'host',
			lobbyId: lobby.id,
		});
		expect(closed.status).toBe('closed');
		expect(closed.members).toHaveLength(2);
		expect(
			await client.lobbies.close({ userId: 'host', lobbyId: lobby.id }),
		).toEqual(closed);
		expect(updates).toEqual(['closed']);
		expect((await client.lobbies.get(lobby.id, 'guest'))?.status).toBe(
			'closed',
		);
		await expect(
			client.lobbies.start({ userId: 'host', lobbyId: lobby.id }),
		).rejects.toMatchObject({ code: 'LOBBY_CLOSED' });
		await expect(
			client.lobbies.joinByCode({ userId: 'new', code: lobby.code! }),
		).rejects.toMatchObject({ code: 'LOBBY_CLOSED' });
		off();
	});

	it('preserves completed matches and creates a distinct next round with idempotent start', async () => {
		const { bame, client } = fixture();
		const lobby = await client.lobbies.create({
			userId: 'host',
			game: game.name,
		});
		await client.lobbies.join({ userId: 'guest', lobbyId: lobby.id });
		const first = await client.lobbies.start({
			userId: 'host',
			lobbyId: lobby.id,
		});
		const input = { userId: 'host', lobbyId: lobby.id, matchId: first.id };
		await expect(client.lobbies.rematch(input)).rejects.toMatchObject({
			code: 'MATCH_ACTIVE',
		});
		expect(
			(
				await client.matches.move({
					userId: 'host',
					matchId: first.id,
					move: 'finish',
					args: [],
				})
			).ok,
		).toBe(true);
		await expect(
			client.lobbies.rematch({ ...input, userId: 'guest' }),
		).rejects.toMatchObject({ code: 'LOBBY_HOST_REQUIRED' });
		const reopened = await client.lobbies.rematch(input);
		expect(reopened.status).toBe('open');
		expect(reopened.matchId).toBeUndefined();
		expect(reopened.members.map((m) => m.userId)).toEqual(['host', 'guest']);
		expect(await client.lobbies.rematch(input)).toEqual(reopened);
		const [next, repeated] = await Promise.all([
			client.lobbies.start({ userId: 'host', lobbyId: lobby.id }),
			client.lobbies.start({ userId: 'host', lobbyId: lobby.id }),
		]);
		expect(next.id).not.toBe(first.id);
		expect(repeated.id).toBe(next.id);
		expect((await bame.matches.get(first.id, 'host'))?.status).toBe('finished');
		await expect(client.lobbies.rematch(input)).rejects.toMatchObject({
			code: 'LOBBY_MATCH_MISMATCH',
		});
	});

	it('keeps leaving distinct from closing: the next member becomes host', async () => {
		const { client } = fixture();
		const lobby = await client.lobbies.create({
			userId: 'host',
			game: game.name,
		});
		await client.lobbies.join({ userId: 'guest', lobbyId: lobby.id });
		const remaining = await client.lobbies.leave({
			userId: 'host',
			lobbyId: lobby.id,
		});
		expect(remaining).toMatchObject({ status: 'open', hostId: 'guest' });
	});

	it('lets the host kick another waiting member over HTTP and enforces status/host rules', async () => {
		const { client } = fixture();
		const lobby = await client.lobbies.create({
			userId: 'host',
			game: game.name,
			isPrivate: true,
		});
		const code = lobby.code ?? '';
		await client.lobbies.joinByCode({ userId: 'guest', code });

		await expect(
			client.lobbies.kick({
				userId: 'guest',
				lobbyId: lobby.id,
				targetUserId: 'host',
			}),
		).rejects.toMatchObject({ code: 'LOBBY_HOST_REQUIRED' });
		await expect(
			client.lobbies.kick({
				userId: 'host',
				lobbyId: lobby.id,
				targetUserId: 'host',
			}),
		).rejects.toMatchObject({ code: 'CANNOT_KICK_HOST' });

		const kicked = await client.lobbies.kick({
			userId: 'host',
			lobbyId: lobby.id,
			targetUserId: 'guest',
		});
		expect(kicked.members.map((m) => m.userId)).toEqual(['host']);
		expect(
			await client.lobbies.kick({
				userId: 'host',
				lobbyId: lobby.id,
				targetUserId: 'guest',
			}),
		).toEqual(kicked);

		await client.lobbies.joinByCode({ userId: 'guest', code });
		await client.lobbies.start({ userId: 'host', lobbyId: lobby.id });
		await expect(
			client.lobbies.kick({
				userId: 'host',
				lobbyId: lobby.id,
				targetUserId: 'guest',
			}),
		).rejects.toMatchObject({ code: 'MATCH_ACTIVE' });
	});

	it('derives clamped player bounds from config so joins and previews enforce them', async () => {
		const configurable = defineGame<
			State,
			{ finish: typeof finish },
			{ extended?: boolean }
		>({
			name: 'bounded',
			players: { min: 2, max: 6 },
			playerBounds: (config) =>
				config?.extended ? { min: 2, max: 6 } : { min: 2, max: 3 },
			setup,
			moves: { finish },
			view,
			endIf,
		});
		const bame = createBame({ games: [configurable] });
		const handler = createBameHandler(bame, { unsafeTrustClientIds: true });
		const client = createBameClient({
			url: 'http://localhost/api/bame',
			fetch: (input, init) => handler.fetch(new Request(input, init)),
		});

		const lobby = await client.lobbies.create({
			userId: 'p1',
			game: configurable.name,
			isPrivate: true,
			config: { extended: false },
		});
		const code = lobby.code ?? '';
		expect(lobby.minPlayers).toBe(2);
		expect(lobby.maxPlayers).toBe(3);
		expect(await client.lobbies.previewByCode(code)).toMatchObject({
			minPlayers: 2,
			maxPlayers: 3,
		});

		await client.lobbies.joinByCode({ userId: 'p2', code });
		await client.lobbies.joinByCode({ userId: 'p3', code });
		await expect(
			client.lobbies.joinByCode({ userId: 'p4', code }),
		).rejects.toMatchObject({ code: 'LOBBY_FULL' });
	});
});
