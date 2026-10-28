import { expect, it, vi } from 'vitest';
import {
	defineGame,
	type MoveContext,
	type EndIfContext,
} from '../engine/index.js';
import { createBame } from './create-bame.js';
import type { BameHooks } from './matches.js';

function setup() {
	return { done: false };
}
function finish({ state, keepTurn }: MoveContext<{ done: boolean }>) {
	state.done = true;
	return keepTurn();
}
function endIf({ state, player }: EndIfContext<{ done: boolean }>) {
	return state.done ? { winner: player.id } : undefined;
}
const game = defineGame({
	name: 'end-hooks',
	players: { min: 2, max: 2 },
	setup,
	moves: { finish },
	endIf,
});

async function match(hooks: BameHooks, onError = vi.fn()) {
	const bame = createBame({ games: [game], hooks, onError });
	const lobby = await bame.lobbies.create({ userId: 'a', game: game.name });
	await bame.lobbies.join({ userId: 'b', lobbyId: lobby.id });
	return {
		bame,
		match: await bame.lobbies.start({ userId: 'a', lobbyId: lobby.id }),
		onError,
	};
}

it.each(['move', 'forfeit'] as const)(
	'dispatches match end once after a committed %s, including idempotent retries',
	async (action) => {
		const ended = vi.fn();
		const moved = vi.fn();
		const { bame, match: initial } = await match({
			onMatchEnd: ended,
			onMove: moved,
		});
		const input = {
			userId: 'a',
			matchId: initial.id,
			requestId: 'request-1',
			expectedVersion: initial.version,
		};
		const act = () =>
			action === 'move'
				? bame.matches.move({ ...input, move: 'finish', args: [] })
				: bame.matches.forfeit(input);
		expect((await act()).ok).toBe(true);
		expect((await act()).ok).toBe(true);
		expect(ended).toHaveBeenCalledTimes(1);
		expect(ended.mock.calls[0][0]).toMatchObject({
			action,
			playerId: 'a',
			requestId: 'request-1',
			previousMatch: { status: 'active' },
			match: { status: 'finished' },
		});
		expect(moved).toHaveBeenCalledTimes(action === 'move' ? 1 : 0);
	},
);

it('reports end-hook failures without changing the committed result', async () => {
	const {
		bame,
		match: initial,
		onError,
	} = await match({
		onMatchEnd: () => {
			throw new Error('Delivery failed');
		},
	});
	expect(
		(await bame.matches.forfeit({ userId: 'a', matchId: initial.id })).ok,
	).toBe(true);
	expect((await bame.matches.get(initial.id, 'b'))?.status).toBe('finished');
	expect(onError).toHaveBeenCalledWith(
		expect.any(Error),
		expect.objectContaining({
			operation: 'hook.onMatchEnd',
			matchId: initial.id,
		}),
	);
});
