import { describe, expect, it } from 'vitest';
import { simulate } from '../testing';
import {
	applyMove,
	createMatch,
	defineGame,
	endTurn,
	invalid,
	keepTurn,
	type StateOf,
	viewFor,
} from './index';

const counterGame = defineGame({
	name: 'counter',
	players: 2,
	setup: ({ config }: { config?: { target?: number } }) => ({
		count: 0,
		target: config?.target ?? 5,
	}),
	moves: {
		add: ({ state }, amount: number) => {
			if (amount < 1 || amount > 3) {
				return invalid('Amount must be between 1 and 3');
			}
			state.count += amount;
		},
		replaceImmutable: ({ state }, nextCount: number) => {
			if (nextCount < 0) return invalid('Cannot be negative');
			return { ...state, count: nextCount };
		},
		bonusRoll: ({ state, random, keepTurn }) => {
			const roll = random.int(1, 6);
			state.count += roll;
			keepTurn();
		},
	},
	endIf: ({ state, player }) => {
		if (state.count >= state.target) {
			return { winner: player.id };
		}
		return undefined;
	},
});

describe('defineGame & runner', () => {
	describe('defineGame validation', () => {
		it('should normalize fixed player count', () => {
			expect(counterGame.minPlayers).toBe(2);
			expect(counterGame.maxPlayers).toBe(2);
		});

		it('should normalize min/max player bounds', () => {
			const multi = defineGame({
				name: 'multi',
				players: { min: 2, max: 6 },
				setup: () => ({ ok: true }),
				moves: {},
			});
			expect(multi.minPlayers).toBe(2);
			expect(multi.maxPlayers).toBe(6);
		});

		it('should throw for invalid player configuration', () => {
			expect(() =>
				defineGame({
					name: 'bad',
					players: 0,
					setup: () => ({}),
					moves: {},
				}),
			).toThrow('players count must be a positive integer');

			expect(() =>
				defineGame({
					name: 'bad-bounds',
					players: { min: 4, max: 2 },
					setup: () => ({}),
					moves: {},
				}),
			).toThrow('players bounds must satisfy 1 <= min <= max');
		});
	});

	describe('createMatch', () => {
		it('should initialize state, players, and turn 1', () => {
			const match = createMatch(counterGame, {
				players: ['alice', 'bob'],
				config: { target: 10 },
				seed: 'seed-1',
			});

			expect(match.status).toBe('active');
			expect(match.version).toBe(1);
			expect(match.state).toEqual({ count: 0, target: 10 });
			expect(match.turn).toEqual({
				number: 1,
				currentPlayerId: 'alice',
				currentPlayerIndex: 0,
				movesMade: 0,
			});
		});

		it('should reject wrong number of players or duplicate player IDs', () => {
			expect(() => createMatch(counterGame, { players: ['alice'] })).toThrow(
				/requires between 2 and 2 players/,
			);

			expect(() =>
				createMatch(counterGame, { players: ['alice', 'alice'] }),
			).toThrow('Duplicate player IDs are not allowed');
		});
	});

	describe('applyMove', () => {
		it('should support both in-place state mutation and returning a new state', () => {
			const m = simulate(counterGame, { players: ['alice', 'bob'] });

			const res1 = m.move('alice', 'add', 2);
			expect(res1.ok).toBe(true);
			expect(m.state.count).toBe(2);
			expect(m.turn.currentPlayerId).toBe('bob');

			const res2 = m.move('bob', 'replaceImmutable', 4);
			expect(res2.ok).toBe(true);
			expect(m.state.count).toBe(4);
			expect(m.turn.currentPlayerId).toBe('alice');
		});

		it('should not mutate original match or state when a move is invalid or rejected', () => {
			const match = createMatch(counterGame, { players: ['alice', 'bob'] });
			const snapshotBefore = structuredClone(match);

			const wrongTurn = applyMove(counterGame, match, 'bob', 'add', [2]);
			expect(wrongTurn).toEqual({
				ok: false,
				error: 'Not your turn',
				code: 'NOT_YOUR_TURN',
			});
			expect(match).toEqual(snapshotBefore);

			const invalidRule = applyMove(counterGame, match, 'alice', 'add', [99]);
			expect(invalidRule).toEqual({
				ok: false,
				error: 'Amount must be between 1 and 3',
			});
			expect(match).toEqual(snapshotBefore);
		});

		it('should support keepTurn() and multi-move turns', () => {
			const m = simulate(counterGame, {
				players: ['alice', 'bob'],
				config: { target: 100 },
			});

			const r1 = m.move('alice', 'bonusRoll');
			expect(r1.ok).toBe(true);
			expect(m.turn.currentPlayerId).toBe('alice');
			expect(m.turn.movesMade).toBe(1);

			const r2 = m.move('alice', 'add', 1);
			expect(r2.ok).toBe(true);
			expect(m.turn.currentPlayerId).toBe('bob');
			expect(m.turn.movesMade).toBe(0);
		});

		it('should produce identical state transitions given the same seed', () => {
			const sim1 = simulate(counterGame, {
				players: ['alice', 'bob'],
				config: { target: 100 },
				seed: 'deterministic-seed',
			});
			const sim2 = simulate(counterGame, {
				players: ['alice', 'bob'],
				config: { target: 100 },
				seed: 'deterministic-seed',
			});

			sim1.move('alice', 'bonusRoll');
			sim1.move('alice', 'bonusRoll');

			sim2.move('alice', 'bonusRoll');
			sim2.move('alice', 'bonusRoll');

			expect(sim1.state).toEqual(sim2.state);
		});

		it('should finish match when endIf returns a result and block subsequent moves', () => {
			const m = simulate(counterGame, {
				players: ['alice', 'bob'],
				config: { target: 3 },
			});

			m.move('alice', 'add', 3);
			expect(m.status).toBe('finished');
			expect(m.result).toEqual({ winner: 'alice' });

			const afterEnd = m.move('bob', 'add', 1);
			expect(afterEnd).toEqual({
				ok: false,
				error: 'Match is already finished',
				code: 'MATCH_FINISHED',
			});
		});

		it('should support Catan-style snake draft turn order via endTurn(nextPlayerId)', () => {
			const snakeDraftGame = defineGame({
				name: 'snake-draft',
				players: 3,
				setup: () => ({ placements: [] as string[] }),
				moves: {
					placeSettlement: ({ state, player, players }, spot: string) => {
						state.placements.push(`${player.id}:${spot}`);
						const step = state.placements.length;
						// 3-player snake draft: p1 -> p2 -> p3 -> p3 -> p2 -> p1
						const order = [
							players[0].id,
							players[1].id,
							players[2].id,
							players[2].id,
							players[1].id,
							players[0].id,
						];
						const nextPlayer = order[step] ?? players[0].id;
						return endTurn(nextPlayer);
					},
				},
			});

			const m = simulate(snakeDraftGame, {
				players: ['alice', 'bob', 'charlie'],
			});

			expect(m.turn.currentPlayerId).toBe('alice');
			expect(m.move('alice', 'placeSettlement', 'A1').ok).toBe(true);
			expect(m.turn.currentPlayerId).toBe('bob');

			expect(m.move('bob', 'placeSettlement', 'B1').ok).toBe(true);
			expect(m.turn.currentPlayerId).toBe('charlie');

			// Charlie places first settlement and immediately gets second placement!
			expect(m.move('charlie', 'placeSettlement', 'C1').ok).toBe(true);
			expect(m.turn.currentPlayerId).toBe('charlie');

			// Now snake draft reverses: Charlie -> Bob -> Alice
			expect(m.move('charlie', 'placeSettlement', 'C2').ok).toBe(true);
			expect(m.turn.currentPlayerId).toBe('bob');

			expect(m.move('bob', 'placeSettlement', 'B2').ok).toBe(true);
			expect(m.turn.currentPlayerId).toBe('alice');
		});

		it('should support out-of-turn market trades, robber discards, and notifications (allowOutOfTurn + notify)', () => {
			const catanTradeGame = defineGame({
				name: 'catan-trade',
				players: 3,
				turn: {
					allowOutOfTurn: ['acceptTrade', 'discardCards'],
				},
				setup: () => ({
					activeTrade: null as {
						from: string;
						give: string;
						want: string;
					} | null,
					completedTrades: 0,
				}),
				moves: {
					proposeTrade: (
						{ state, player, notify },
						give: string,
						want: string,
					) => {
						state.activeTrade = { from: player.id, give, want };
						notify({
							to: 'opponents',
							type: 'trade_offer',
							message: `${player.id} offers ${give} for ${want}`,
							data: { give, want },
						});
						return keepTurn();
					},
					acceptTrade: ({ state, player }) => {
						if (!state.activeTrade) return invalid('No active trade offer');
						if (state.activeTrade.from === player.id) {
							return invalid('Cannot accept your own trade');
						}
						state.activeTrade = null;
						state.completedTrades += 1;
					},
					discardCards: ({ player }, _count: number) => {
						if (!player.id) return invalid('Invalid player');
					},
					endPlayerTurn: () => {},
				},
			});

			const m = simulate(catanTradeGame, {
				players: ['alice', 'bob', 'charlie'],
			});

			// Charlie cannot call a normal turn move during Alice's turn
			expect(m.move('charlie', 'endPlayerTurn')).toEqual({
				ok: false,
				error: 'Not your turn',
				code: 'NOT_YOUR_TURN',
			});

			// Alice proposes a trade on her turn -> emits notification to Bob & Charlie and keeps turn
			const proposeRes = m.move('alice', 'proposeTrade', 'wood', 'ore');
			expect(proposeRes.ok).toBe(true);
			if (proposeRes.ok) {
				expect(proposeRes.notifications).toHaveLength(1);
				expect(proposeRes.notifications[0].toPlayerIds).toEqual([
					'bob',
					'charlie',
				]);
				expect(proposeRes.notifications[0].type).toBe('trade_offer');
			}
			expect(m.turn.currentPlayerId).toBe('alice');

			// Charlie (player 3!) accepts Alice's trade out-of-turn -> turn remains on Alice!
			const acceptRes = m.move('charlie', 'acceptTrade');
			expect(acceptRes.ok).toBe(true);
			expect(m.state.completedTrades).toBe(1);
			expect(m.turn.currentPlayerId).toBe('alice');
		});

		it('should support ctx.waitFor(playerIds) for multi-day async interrupts like Catan Robber discards', () => {
			const robberGame = defineGame({
				name: 'robber-discard',
				players: 3,
				setup: () => ({
					mustDiscard: [] as string[],
					robberMoved: false,
				}),
				moves: {
					rollSeven: ({ state, waitFor }) => {
						state.mustDiscard = ['bob', 'charlie'];
						waitFor(state.mustDiscard);
					},
					discardHalf: ({ state, player, waitFor }) => {
						if (!state.mustDiscard.includes(player.id)) {
							return invalid('You do not need to discard');
						}
						state.mustDiscard = state.mustDiscard.filter(
							(id: string) => id !== player.id,
						);
						waitFor(state.mustDiscard.length > 0 ? state.mustDiscard : null);
					},
					moveRobber: ({ state }) => {
						if (state.mustDiscard.length > 0) {
							return invalid('Wait for players to finish discarding');
						}
						state.robberMoved = true;
					},
				},
			});

			const m = simulate(robberGame, {
				players: ['alice', 'bob', 'charlie'],
			});

			// Alice rolls a 7 -> turn stays on Alice, but game is now waiting on Bob and Charlie
			expect(m.move('alice', 'rollSeven').ok).toBe(true);
			expect(m.turn.currentPlayerId).toBe('alice');
			expect(m.turn.waitingFor).toEqual(['bob', 'charlie']);

			// Bob and Charlie can now call discardHalf even without allowOutOfTurn because they are in waitingFor!
			expect(m.move('bob', 'discardHalf').ok).toBe(true);
			expect(m.turn.waitingFor).toEqual(['charlie']);

			expect(m.move('charlie', 'discardHalf').ok).toBe(true);
			expect(m.turn.waitingFor).toBeUndefined();

			// Now Alice can move the robber and finish her turn
			expect(m.move('alice', 'moveRobber').ok).toBe(true);
			expect(m.state.robberMoved).toBe(true);
			expect(m.turn.currentPlayerId).toBe('bob');
		});

		it('should support random.dice(), random.weighted(), canMove(), undo(), replay(), and forfeit()', () => {
			const qolGame = defineGame({
				name: 'qol-game',
				players: 2,
				turn: { allowUndo: true },
				setup: ({ random }) => ({
					initialDice: random.dice(2, 6),
					loot: random.weighted([
						{ item: 'common', weight: 10 },
						{ item: 'rare', weight: 1 },
					]),
					points: 0,
				}),
				moves: {
					score: ({ state, random }, bonus: number) => {
						if (bonus < 1 || bonus > 5) return invalid('Bonus must be 1..5');
						const [d1, d2] = random.dice(2, 6);
						state.points += d1 + d2 + bonus;
					},
				},
			});

			const m = simulate(qolGame, {
				players: ['alice', 'bob'],
				seed: 'qol-seed-1',
			});

			expect(m.state.initialDice).toHaveLength(2);
			for (const die of m.state.initialDice) {
				expect(die).toBeGreaterThanOrEqual(1);
				expect(die).toBeLessThanOrEqual(6);
			}
			expect(['common', 'rare']).toContain(m.state.loot);

			// Dry-run canMove check
			expect(m.canMove('alice', 'score', 3)).toBe(true);
			expect(m.canMove('alice', 'score', 99)).toBe(false);
			expect(m.canMove('bob', 'score', 3)).toBe(false);

			// Make two moves and then undo
			m.move('alice', 'score', 2);
			const pointsAfterMove1 = m.state.points;
			expect(pointsAfterMove1).toBeGreaterThan(0);

			m.move('bob', 'score', 3);
			expect(m.state.points).toBeGreaterThan(pointsAfterMove1);

			// Replay up to move 1
			const replayed1 = m.replay(1);
			expect(replayed1.state.points).toBe(pointsAfterMove1);

			// Undo Bob's move -> restores exact state & RNG cursor after Move 1
			const undoRes = m.undo('bob');
			expect(undoRes.ok).toBe(true);
			expect(m.state.points).toBe(pointsAfterMove1);
			expect(m.turn.currentPlayerId).toBe('bob');

			// Bob forfeits -> Alice wins
			const forfeitRes = m.forfeit('bob');
			expect(forfeitRes.ok).toBe(true);
			expect(m.status).toBe('finished');
			expect(m.result).toEqual({
				winner: 'alice',
				reason: 'bob forfeited',
			});
		});
	});

	describe('viewFor & secret isolation', () => {
		const secretGame = defineGame({
			name: 'secret',
			players: 2,
			setup: ({ players, random }) => ({
				deck: [10, 20, 30],
				hands: Object.fromEntries(
					players.map((p) => [p.id, [random.int(1, 9)]]),
				),
			}),
			moves: {},
			view: ({ state, playerId }) => ({
				deckCount: state.deck.length,
				myHand: playerId ? (state.hands[playerId] ?? []) : [],
			}),
		});

		it('should project per-player state and never leak seed or rngState', () => {
			const match = createMatch(secretGame, {
				players: ['alice', 'bob'],
				seed: 'super-secret-seed',
			});

			const aliceView = viewFor(secretGame, match, 'alice');
			const bobView = viewFor(secretGame, match, 'bob');

			expect(aliceView.state.deckCount).toBe(3);
			expect(aliceView.state.myHand).toEqual(match.state.hands.alice);
			expect(bobView.state.myHand).toEqual(match.state.hands.bob);
			expect('seed' in aliceView).toBe(false);
			expect('rngState' in aliceView).toBe(false);
			expect('deck' in aliceView.state).toBe(false);
		});
	});

	describe('type inference helpers', () => {
		it('should infer StateOf correctly', () => {
			const sample: StateOf<typeof counterGame> = { count: 1, target: 5 };
			expect(sample.count).toBe(1);
		});
	});
});
