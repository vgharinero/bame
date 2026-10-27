import { describe, expect, it } from 'vitest';
import { defineGame } from './define-game';
import { BameError, getErrorDetails } from './errors';
import { invalid } from './invalid';
import { applyMove, createMatch, validateMove } from './runner';

const game = defineGame({
	name: 'coded-errors',
	players: 2,
	setup: () => ({ coins: 3 }),
	validateArgs: (_move, args) =>
		args[0] === 'malformed'
			? { code: 'INVALID_AMOUNT', params: { min: 1 } }
			: undefined,
	moves: {
		spend: ({ state, invalid: reject }, amount: number) => {
			state.coins = 0;
			return reject({
				code: 'NOT_ENOUGH_COINS',
				params: { required: amount },
				message: 'Not enough coins',
			});
		},
		legacy: () => invalid('Readable message'),
	},
});

describe('structured rule errors', () => {
	it('preserves codes, parameters and fallback text without committing a rejected move', () => {
		const match = createMatch(game, { players: ['a', 'b'], seed: 'codes' });
		const before = structuredClone(match);
		const expected = {
			ok: false,
			error: 'Not enough coins',
			code: 'NOT_ENOUGH_COINS',
			params: { required: 5 },
		};
		expect(applyMove(game, match, 'a', 'spend', [5])).toEqual(expected);
		expect(validateMove(game, match, 'a', 'spend', [5])).toEqual(expected);
		expect(match).toEqual(before);
	});

	it('supports structured argument and configuration validation', () => {
		const match = createMatch(game, { players: ['a', 'b'] });
		expect(
			applyMove(game, match, 'a', 'spend', ['malformed' as unknown as number]),
		).toEqual({
			ok: false,
			error: 'INVALID_AMOUNT',
			code: 'INVALID_AMOUNT',
			params: { min: 1 },
		});
		const configured = defineGame({
			...game,
			players: 2,
			validateConfig: () => ({ code: 'INVALID_TARGET', params: { min: 3 } }),
		});
		try {
			createMatch(configured, { players: ['a', 'b'] });
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(BameError);
			expect(getErrorDetails(error)).toEqual({
				code: 'INVALID_TARGET',
				params: { min: 3 },
			});
		}
	});

	it('keeps legacy string errors unchanged and rejects non-JSON parameters', () => {
		const match = createMatch(game, { players: ['a', 'b'] });
		expect(applyMove(game, match, 'a', 'legacy', [])).toEqual({
			ok: false,
			error: 'Readable message',
		});
		expect(getErrorDetails(new Error('Readable message'))).toBeNull();
		expect(() =>
			invalid({ code: 'BROKEN', params: { value: Number.NaN } }),
		).toThrow(/JSON-compatible/);
	});
});
