import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	createBame,
	createBameClient,
	defineGame,
	VersionConflictError,
} from '@bame/core';
import { describe, expect, it } from 'vitest';
import { listenBameServer, localFileStorage } from './index';

describe('@bame/storage-local', () => {
	it('should persist and reload documents across instances with CAS checks', async () => {
		const tmpFile = path.join(
			os.tmpdir(),
			`bame-local-store-${Date.now()}.json`,
		);
		try {
			const store1 = localFileStorage({ file: tmpFile });
			await store1.create('matches', { id: 'm1', version: 1, score: 42 });

			await store1.close();
			const store2 = localFileStorage({ file: tmpFile });
			const loaded = await store2.get<{ score: number }>('matches', 'm1');
			expect(loaded).toEqual({ id: 'm1', version: 1, score: 42 });

			await store2.update('matches', { id: 'm1', version: 2, score: 50 }, 1);
			await expect(
				store2.update('matches', { id: 'm1', version: 3, score: 60 }, 1),
			).rejects.toThrow(VersionConflictError);
			await store2.close();
		} finally {
			fs.rmSync(tmpFile, { force: true });
		}
	});

	it('should serve JSON-RPC POST and SSE GET requests via listenBameServer', async () => {
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
