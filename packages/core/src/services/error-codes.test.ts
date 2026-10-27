import { describe, expect, it } from 'vitest';
import { BameError, defineGame, invalid } from '../engine';
import { createBame } from './create-bame';
import {
	BameTransportError,
	createBameClient,
	createBameHandler,
} from './network';

const game = defineGame({
	name: 'error-roundtrip',
	players: 2,
	setup: () => ({ value: 0 }),
	validateConfig: (config: unknown) =>
		config === 'bad'
			? { code: 'BAD_CONFIG', params: { allowed: 10 } }
			: undefined,
	moves: {
		reject: () => invalid({ code: 'DISCARD_REQUIRED', params: { count: 3 } }),
	},
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

describe('error codes across the server transport', () => {
	it('returns identical structured game failures locally and over HTTP', async () => {
		const { bame, client } = fixture();
		const lobby = await bame.lobbies.create({ userId: 'a', game: game.name });
		await bame.lobbies.join({ userId: 'b', lobbyId: lobby.id });
		const match = await bame.lobbies.start({ userId: 'a', lobbyId: lobby.id });
		const input = { userId: 'a', matchId: match.id, move: 'reject', args: [] };
		const expected = {
			ok: false,
			error: 'DISCARD_REQUIRED',
			code: 'DISCARD_REQUIRED',
			params: { count: 3 },
		};
		expect(await bame.matches.move(input)).toEqual(expected);
		expect(await client.matches.move(input)).toEqual(expected);
	});

	it('preserves lobby codes and parameters in typed local and transport exceptions', async () => {
		const { bame, client } = fixture();
		const lobby = await bame.lobbies.create({ userId: 'a', game: game.name });
		await expect(
			bame.lobbies.start({ userId: 'a', lobbyId: lobby.id }),
		).rejects.toMatchObject({
			code: 'NOT_ENOUGH_PLAYERS',
			params: { min: 2, current: 1 },
		});
		await expect(
			client.lobbies.start({ userId: 'a', lobbyId: lobby.id }),
		).rejects.toMatchObject({
			code: 'NOT_ENOUGH_PLAYERS',
			params: { min: 2, current: 1 },
		});
		await expect(
			bame.lobbies.joinByCode({ userId: 'b', code: 'MISSING' }),
		).rejects.toBeInstanceOf(BameError);
		await expect(
			client.lobbies.joinByCode({ userId: 'b', code: 'MISSING' }),
		).rejects.toBeInstanceOf(BameTransportError);
		await expect(
			client.lobbies.create({ userId: 'a', game: game.name, config: 'bad' }),
		).rejects.toMatchObject({ code: 'BAD_CONFIG', params: { allowed: 10 } });
	});
});
