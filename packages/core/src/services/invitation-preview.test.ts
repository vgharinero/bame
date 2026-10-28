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
function setup(_context: SetupContext): State {
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
	name: 'preview',
	players: 2,
	setup,
	moves: { finish },
	view,
	endIf,
});

it('exposes only invitation metadata without authentication or membership changes', async () => {
	const api = createBame({ games: [game] });
	await api.profiles.update('host', {
		displayName: 'Host',
		avatarUrl: '/host.png',
	});
	const lobby = await api.lobbies.create({
		userId: 'host',
		game: game.name,
		isPrivate: true,
		config: { secret: 'private' },
	});
	const handler = createBameHandler(api, { getUserId: () => null });
	let cacheControl: string | null = null;
	const client = createBameClient({
		url: 'http://localhost/api/bame',
		fetch: async (input, init) => {
			const response = await handler.fetch(new Request(input, init));
			cacheControl = response.headers.get('Cache-Control');
			return response;
		},
	});
	expect(
		await client.lobbies.previewByCode(` ${lobby.code!.toLowerCase()} `),
	).toEqual({
		game: game.name,
		code: lobby.code,
		hostId: 'host',
		minPlayers: 2,
		maxPlayers: 2,
		members: [{ userId: 'host', displayName: 'Host', avatarUrl: '/host.png' }],
	});
	expect(cacheControl).toBe('no-store');
	expect((await api.lobbies.get(lobby.id, 'host'))?.members).toHaveLength(1);
	await expect(client.lobbies.get(lobby.id)).rejects.toMatchObject({
		code: 'FORBIDDEN',
	});
});

it('returns no preview for missing, closed, or started rooms', async () => {
	const api = createBame({ games: [game] });
	expect(await api.lobbies.previewByCode('MISSING')).toBeNull();
	const closed = await api.lobbies.create({
		userId: 'host',
		game: game.name,
		isPrivate: true,
	});
	await api.lobbies.close({ userId: 'host', lobbyId: closed.id });
	expect(await api.lobbies.previewByCode(closed.code!)).toBeNull();
	const started = await api.lobbies.create({
		userId: 'host',
		game: game.name,
		isPrivate: true,
	});
	await api.lobbies.joinByCode({ userId: 'guest', code: started.code! });
	await api.lobbies.start({ userId: 'host', lobbyId: started.id });
	expect(await api.lobbies.previewByCode(started.code!)).toBeNull();
});
