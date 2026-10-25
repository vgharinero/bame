import { describe, expect, it } from 'vitest';
import { guessNumber } from '../../../../examples/guess-number/src/game';
import { highCard } from '../../../../examples/high-card/src/game';
import { lightsOut } from '../../../../examples/lights-out/src/game';
import { nim } from '../../../../examples/nim/src/game';
import { rockPaperScissors } from '../../../../examples/rock-paper-scissors/src/game';
import { ticTacToe } from '../../../../examples/tic-tac-toe/src/game';
import { simulate } from '../testing';

describe('playable example game definitions', () => {
	it('guess-number: singleplayer secret number with higher/lower hints', () => {
		const m = simulate(guessNumber, {
			players: ['alice'],
			seed: 'guess-seed-1',
		});

		const secret = m.state.secret;
		const view = m.view('alice');
		expect('secret' in view.state).toBe(false);

		const wrong = secret === 1 ? 2 : 1;
		expect(m.move('alice', 'guess', wrong).ok).toBe(true);
		expect(m.status).toBe('active');

		expect(m.move('alice', 'guess', secret).ok).toBe(true);
		expect(m.status).toBe('finished');
		expect(m.result).toEqual({ winner: 'alice' });
	});

	it('nim: taking the last stick wins', () => {
		const m = simulate(nim, {
			players: ['alice', 'bob'],
			config: { sticks: 4 },
		});

		expect(m.move('alice', 'take', 3).ok).toBe(true);
		expect(m.state.sticks).toBe(1);

		expect(m.move('alice', 'take', 1)).toEqual({
			ok: false,
			error: 'Not your turn',
		});

		expect(m.move('bob', 'take', 2)).toEqual({
			ok: false,
			error: 'Take 1, 2, or 3 sticks (up to remaining sticks)',
		});

		expect(m.move('bob', 'take', 1).ok).toBe(true);
		expect(m.status).toBe('finished');
		expect(m.result).toEqual({ winner: 'bob' });
	});

	it('high-card: supports secret card view, single redraw, and reveal', () => {
		const m = simulate(highCard, {
			players: ['alice', 'bob'],
			seed: 'high-card-seed-1',
		});

		const aliceInitialView = m.view('alice');
		expect(Object.keys(aliceInitialView.state.cards)).toEqual(['alice']);

		// Alice redraws once (uses her turn)
		expect(m.move('alice', 'redraw').ok).toBe(true);
		// Bob reveals his card
		expect(m.move('bob', 'reveal').ok).toBe(true);
		// Alice cannot redraw a second time
		expect(m.move('alice', 'redraw')).toEqual({
			ok: false,
			error: 'You can only redraw once per round',
		});
		// Alice reveals -> match ends
		expect(m.move('alice', 'reveal').ok).toBe(true);
		expect(m.status).toBe('finished');
		expect(m.result).toBeDefined();

		// Also verify when Player 1 reveals first and Player 2 redraws (turn stays on Player 2 to reveal)
		const m2 = simulate(highCard, {
			players: ['alice', 'bob'],
			seed: 'high-card-seed-2',
		});
		expect(m2.move('alice', 'reveal').ok).toBe(true);
		expect(m2.move('bob', 'redraw').ok).toBe(true);
		expect(m2.turn.currentPlayerId).toBe('bob');
		expect(m2.move('bob', 'reveal').ok).toBe(true);
		expect(m2.status).toBe('finished');
	});

	it('lights-out: singleplayer 3x3 puzzle finishes when all lights are off', () => {
		const m = simulate(lightsOut, {
			players: ['alice'],
			seed: 'lights-seed-1',
		});
		expect(m.state.grid).toHaveLength(9);
		expect(m.move('alice', 'toggle', 4).ok).toBe(true);
		expect(m.state.movesCount).toBe(1);
	});

	it('tic-tac-toe: detects row win and draw', () => {
		const m = simulate(ticTacToe, { players: ['alice', 'bob'] });
		m.move('alice', 'place', 0);
		m.move('bob', 'place', 3);
		m.move('alice', 'place', 1);
		m.move('bob', 'place', 4);
		m.move('alice', 'place', 2);

		expect(m.status).toBe('finished');
		expect(m.result).toEqual({ winner: 'alice' });
	});

	it('rock-paper-scissors: hides opponent choice until both lock in and resolves best-of-3', () => {
		const m = simulate(rockPaperScissors, { players: ['alice', 'bob'] });

		expect(m.move('alice', 'choose', 'rock').ok).toBe(true);
		// Bob cannot see Alice's choice yet, only that Alice locked in
		const bobView = m.view('bob');
		expect(bobView.state.myChoice).toBeNull();
		expect(bobView.state.chosenPlayerIds).toEqual(['alice']);

		// Bob chooses scissors -> Alice wins round 1
		expect(m.move('bob', 'choose', 'scissors').ok).toBe(true);
		expect(m.state.scores.alice).toBe(1);
		expect(m.state.round).toBe(2);

		// Round 2: Alice wins again (2 wins -> match finished)
		expect(m.move('alice', 'choose', 'paper').ok).toBe(true);
		expect(m.move('bob', 'choose', 'rock').ok).toBe(true);
		expect(m.status).toBe('finished');
		expect(m.result).toEqual({ winner: 'alice' });
	});
});
