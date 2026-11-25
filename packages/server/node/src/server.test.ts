import { createBame, createBameClient, defineGame } from '@bame/core';
import { describe, expect, it } from 'vitest';
import { listenBameServer } from './index.js';

describe('@bame/server-node', () => {
	it('serves JSON-RPC POST and SSE GET requests via listenBameServer', async () => {
		const testGame = defineGame({
			name: 'ping-pong',
			players: 2,
			setup: () => ({ count: 0 }),
			moves: {
				hit: ({ state }) => {
					state.count += 1;
				},
			},
			endIf: ({ state, players }) =>
				state.count >= 2 ? { winner: players[0].id } : undefined,
		});

		const bame = createBame({ games: [testGame] });
		const server = await listenBameServer(bame, {
			port: 0,
			unsafeTrustClientIds: true,
		});

		try {
			const client = createBameClient({ url: server.url });

			const profile = await client.profiles.ensure('Viti', {
				displayName: 'Viti',
			});
			expect(profile.id).toBe('Viti');

			const lobby = await client.lobbies.create({
				userId: 'Viti',
				game: 'ping-pong',
				isPrivate: true,
			});
			expect(lobby.code).toBeDefined();

			const updates: number[] = [];
			const unsub = client.lobbies.subscribe(
				lobby.id,
				(updated) => {
					updates.push(updated.members.length);
				},
				{ userId: 'Viti' },
			);

			await client.lobbies.joinByCode({
				userId: 'Alice',
				code: lobby.code as string,
			});

			const match = await client.lobbies.start({
				userId: 'Viti',
				lobbyId: lobby.id,
			});
			expect(match.status).toBe('active');

			const move1 = await client.matches.move({
				userId: 'Viti',
				matchId: match.id,
				move: 'hit',
				args: [],
			});
			expect(move1.ok).toBe(true);

			unsub();
		} finally {
			await server.close();
		}
	});
});
