import { describe, expect, it } from 'vitest';
import { SeededRNG } from './rng';

describe('SeededRNG', () => {
	describe('constructor', () => {
		it('should initialize and generate deterministic values', () => {
			const rng1 = new SeededRNG(12345);
			const rng2 = new SeededRNG(12345);

			expect(rng1.next()).toBe(rng2.next());
		});

		it('should handle zero seed and generate values', () => {
			const rng = new SeededRNG(0);
			const value = rng.next();

			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		});

		it('should handle negative seeds by converting to unsigned', () => {
			const rng1 = new SeededRNG(-12345);
			const rng2 = new SeededRNG(-12345);

			// Should produce same sequence despite negative input
			expect(rng1.next()).toBe(rng2.next());
		});

		it('should produce different sequences for different seeds', () => {
			const rng1 = new SeededRNG(1);
			const rng2 = new SeededRNG(2);

			expect(rng1.next()).not.toBe(rng2.next());
		});
	});

	describe('fromString', () => {
		it('should generate deterministic values from string seed', () => {
			const rng1 = SeededRNG.fromString('test-seed');
			const rng2 = SeededRNG.fromString('test-seed');

			expect(rng1.next()).toBe(rng2.next());
		});

		it('should produce same hash for identical strings', () => {
			const rng1 = SeededRNG.fromString('identical');
			const rng2 = SeededRNG.fromString('identical');

			const sequence1 = Array.from({ length: 5 }, () => rng1.next());
			const sequence2 = Array.from({ length: 5 }, () => rng2.next());

			expect(sequence1).toEqual(sequence2);
		});

		it('should produce different hashes for different strings', () => {
			const rng1 = SeededRNG.fromString('seed1');
			const rng2 = SeededRNG.fromString('seed2');

			expect(rng1.next()).not.toBe(rng2.next());
		});

		it('should handle empty string', () => {
			const rng = SeededRNG.fromString('');
			const value = rng.next();

			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		});

		it('should handle special characters and unicode', () => {
			const rng1 = SeededRNG.fromString('hello-🎲-world');
			const rng2 = SeededRNG.fromString('hello-🎲-world');

			expect(rng1.next()).toBe(rng2.next());
		});
	});

	describe('determinism', () => {
		it('should produce same sequence for same seed', () => {
			const rng1 = new SeededRNG(42);
			const rng2 = new SeededRNG(42);

			const sequence1 = Array.from({ length: 10 }, () => rng1.next());
			const sequence2 = Array.from({ length: 10 }, () => rng2.next());

			expect(sequence1).toEqual(sequence2);
		});

		it('should produce different sequences for different seeds', () => {
			const rng1 = new SeededRNG(42);
			const rng2 = new SeededRNG(43);

			const sequence1 = Array.from({ length: 10 }, () => rng1.next());
			const sequence2 = Array.from({ length: 10 }, () => rng2.next());

			expect(sequence1).not.toEqual(sequence2);
		});

		it('should produce consistent results across multiple method calls', () => {
			const rng1 = new SeededRNG(999);
			const rng2 = new SeededRNG(999);

			expect(rng1.nextInt(1, 100)).toBe(rng2.nextInt(1, 100));
			expect(rng1.nextFloat(0, 1)).toBe(rng2.nextFloat(0, 1));
			expect(rng1.boolean()).toBe(rng2.boolean());
		});
	});

	describe('next', () => {
		it('should return a number between 0 and 1', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 100; i++) {
				const value = rng.next();
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThan(1);
				expect(typeof value).toBe('number');
			}
		});

		it('should produce different values on consecutive calls', () => {
			const rng = new SeededRNG(12345);
			const values = new Set<number>();

			for (let i = 0; i < 100; i++) {
				values.add(rng.next());
			}

			// Should have many unique values (allow some collisions)
			expect(values.size).toBeGreaterThan(90);
		});

		it('should never return exactly 1', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 1000; i++) {
				expect(rng.next()).not.toBe(1);
			}
		});
	});

	describe('nextInt', () => {
		it('should return integers within specified range', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 100; i++) {
				const value = rng.nextInt(1, 10);
				expect(value).toBeGreaterThanOrEqual(1);
				expect(value).toBeLessThanOrEqual(10);
				expect(Number.isInteger(value)).toBe(true);
			}
		});

		it('should handle single-value range', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 10; i++) {
				expect(rng.nextInt(5, 5)).toBe(5);
			}
		});

		it('should handle negative ranges', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 50; i++) {
				const value = rng.nextInt(-10, -5);
				expect(value).toBeGreaterThanOrEqual(-10);
				expect(value).toBeLessThanOrEqual(-5);
			}
		});

		it('should include both min and max values over many calls', () => {
			const rng = new SeededRNG(12345);
			const values = new Set<number>();

			for (let i = 0; i < 1000; i++) {
				values.add(rng.nextInt(1, 3));
			}

			expect(values.has(1)).toBe(true);
			expect(values.has(2)).toBe(true);
			expect(values.has(3)).toBe(true);
		});

		it('should distribute values relatively evenly', () => {
			const rng = new SeededRNG(12345);
			const counts = new Map<number, number>();
			const samples = 10000;

			for (let i = 0; i < samples; i++) {
				const value = rng.nextInt(1, 5);
				counts.set(value, (counts.get(value) || 0) + 1);
			}

			// Each value should appear roughly 20% of the time (±5%)
			for (const count of counts.values()) {
				const frequency = count / samples;
				expect(frequency).toBeGreaterThan(0.15);
				expect(frequency).toBeLessThan(0.25);
			}
		});
	});

	describe('nextFloat', () => {
		it('should return floats within specified range', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 100; i++) {
				const value = rng.nextFloat(1.0, 10.0);
				expect(value).toBeGreaterThanOrEqual(1.0);
				expect(value).toBeLessThan(10.0);
				expect(typeof value).toBe('number');
			}
		});

		it('should handle negative ranges', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 50; i++) {
				const value = rng.nextFloat(-5.5, -1.5);
				expect(value).toBeGreaterThanOrEqual(-5.5);
				expect(value).toBeLessThan(-1.5);
			}
		});

		it('should return different values for different calls', () => {
			const rng = new SeededRNG(12345);
			const values = new Set<number>();

			for (let i = 0; i < 100; i++) {
				values.add(rng.nextFloat(0, 100));
			}

			expect(values.size).toBeGreaterThan(90);
		});

		it('should handle zero-width range', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 10; i++) {
				const value = rng.nextFloat(5.0, 5.0);
				expect(value).toBe(5.0);
			}
		});
	});

	describe('choice', () => {
		it('should select an element from the array', () => {
			const rng = new SeededRNG(12345);
			const array = ['a', 'b', 'c', 'd', 'e'];

			for (let i = 0; i < 50; i++) {
				const choice = rng.choice(array);
				expect(array).toContain(choice);
			}
		});

		it('should throw error for empty array', () => {
			const rng = new SeededRNG(12345);
			expect(() => rng.choice([])).toThrow('Cannot select from empty array');
		});

		it('should return the only element from single-element array', () => {
			const rng = new SeededRNG(12345);
			const array = ['only'];

			for (let i = 0; i < 10; i++) {
				expect(rng.choice(array)).toBe('only');
			}
		});

		it('should eventually select all elements over many calls', () => {
			const rng = new SeededRNG(12345);
			const array = [1, 2, 3, 4, 5];
			const selected = new Set<number>();

			for (let i = 0; i < 100; i++) {
				selected.add(rng.choice(array));
			}

			expect(selected.size).toBe(5);
		});

		it('should maintain type information', () => {
			const rng = new SeededRNG(12345);

			const stringChoice: string = rng.choice(['a', 'b', 'c']);
			const numberChoice: number = rng.choice([1, 2, 3]);
			const objectChoice: { id: number } = rng.choice([{ id: 1 }, { id: 2 }]);

			expect(typeof stringChoice).toBe('string');
			expect(typeof numberChoice).toBe('number');
			expect(typeof objectChoice).toBe('object');
			expect(objectChoice).toHaveProperty('id');
		});

		it('should produce deterministic choices', () => {
			const rng1 = new SeededRNG(777);
			const rng2 = new SeededRNG(777);
			const array = ['red', 'green', 'blue', 'yellow', 'purple'];

			const choices1 = Array.from({ length: 10 }, () => rng1.choice(array));
			const choices2 = Array.from({ length: 10 }, () => rng2.choice(array));

			expect(choices1).toEqual(choices2);
		});
	});

	describe('shuffle', () => {
		it('should return an array with the same elements', () => {
			const rng = new SeededRNG(12345);
			const array = [1, 2, 3, 4, 5];
			const shuffled = rng.shuffle([...array]);

			expect(shuffled).toHaveLength(array.length);
			expect([...shuffled].sort()).toEqual([...array].sort());
		});

		it('should shuffle deterministically with same seed', () => {
			const rng1 = new SeededRNG(42);
			const rng2 = new SeededRNG(42);
			const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

			const shuffled1 = rng1.shuffle([...array]);
			const shuffled2 = rng2.shuffle([...array]);

			expect(shuffled1).toEqual(shuffled2);
		});

		it('should shuffle differently with different seeds', () => {
			const rng1 = new SeededRNG(42);
			const rng2 = new SeededRNG(43);
			const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

			const shuffled1 = rng1.shuffle([...array]);
			const shuffled2 = rng2.shuffle([...array]);

			expect(shuffled1).not.toEqual(shuffled2);
		});

		it('should actually shuffle (not return original order)', () => {
			const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			let hasShuffled = true;

			// Try multiple seeds to find one that shuffles
			for (let seed = 0; seed < 100; seed++) {
				const testRng = new SeededRNG(seed);
				const shuffled = testRng.shuffle([...array]);
				if (shuffled.every((val, idx) => val === array[idx])) {
					hasShuffled = false;
					break;
				}
			}

			expect(hasShuffled).toBe(true);
		});

		it('should handle single element array', () => {
			const rng = new SeededRNG(12345);
			const array = [1];
			const shuffled = rng.shuffle([...array]);

			expect(shuffled).toEqual([1]);
		});

		it('should handle empty array', () => {
			const rng = new SeededRNG(12345);
			const array: number[] = [];
			const shuffled = rng.shuffle([...array]);

			expect(shuffled).toEqual([]);
		});

		it('should mutate the original array', () => {
			const rng = new SeededRNG(12345);
			const array = [1, 2, 3, 4, 5];
			const original = array;
			const returned = rng.shuffle(array);

			expect(returned).toBe(original); // Same reference
		});

		it('should maintain type information', () => {
			const rng = new SeededRNG(12345);

			const strings: string[] = rng.shuffle(['a', 'b', 'c']);
			const numbers: number[] = rng.shuffle([1, 2, 3]);

			expect(typeof strings[0]).toBe('string');
			expect(typeof numbers[0]).toBe('number');
		});
	});

	describe('boolean', () => {
		it('should return a boolean value', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 50; i++) {
				const value = rng.boolean();
				expect(typeof value).toBe('boolean');
			}
		});

		it('should return both true and false over many calls with default probability', () => {
			const rng = new SeededRNG(12345);
			const results = new Set<boolean>();

			for (let i = 0; i < 100; i++) {
				results.add(rng.boolean());
			}

			expect(results.has(true)).toBe(true);
			expect(results.has(false)).toBe(true);
		});

		it('should respect custom probability of 1.0', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 50; i++) {
				expect(rng.boolean(1.0)).toBe(true);
			}
		});

		it('should respect custom probability of 0.0', () => {
			const rng = new SeededRNG(12345);

			for (let i = 0; i < 50; i++) {
				expect(rng.boolean(0.0)).toBe(false);
			}
		});

		it('should approximate expected probability over many samples', () => {
			const rng = new SeededRNG(12345);
			const probability = 0.7;
			const samples = 10000;
			let trueCount = 0;

			for (let i = 0; i < samples; i++) {
				if (rng.boolean(probability)) {
					trueCount++;
				}
			}

			const actualProbability = trueCount / samples;
			expect(actualProbability).toBeGreaterThan(0.65);
			expect(actualProbability).toBeLessThan(0.75);
		});

		it('should default to 0.5 probability', () => {
			const rng = new SeededRNG(12345);
			const samples = 10000;
			let trueCount = 0;

			for (let i = 0; i < samples; i++) {
				if (rng.boolean()) {
					trueCount++;
				}
			}

			const actualProbability = trueCount / samples;
			expect(actualProbability).toBeGreaterThan(0.45);
			expect(actualProbability).toBeLessThan(0.55);
		});

		it('should produce deterministic boolean sequence', () => {
			const rng1 = new SeededRNG(555);
			const rng2 = new SeededRNG(555);

			const sequence1 = Array.from({ length: 20 }, () => rng1.boolean());
			const sequence2 = Array.from({ length: 20 }, () => rng2.boolean());

			expect(sequence1).toEqual(sequence2);
		});
	});

	describe('state management', () => {
		it('should return numeric state', () => {
			const rng = new SeededRNG(12345);
			const state = rng.getState();

			expect(typeof state).toBe('number');
			expect(Number.isInteger(state)).toBe(true);
		});

		it('should preserve state after setState', () => {
			const rng = new SeededRNG(12345);
			const originalState = 999999;

			rng.setState(originalState);
			expect(rng.getState()).toBe(originalState);
		});

		it('should resume from saved state', () => {
			const rng1 = new SeededRNG(12345);
			const rng2 = new SeededRNG(54321);

			// Advance rng1
			rng1.next();
			rng1.next();
			const state = rng1.getState();

			// Set rng2 to same state
			rng2.setState(state);

			// Should produce identical sequences
			expect(rng1.next()).toBe(rng2.next());
			expect(rng1.next()).toBe(rng2.next());
		});

		it('should produce same sequence after state restore', () => {
			const rng = new SeededRNG(12345);

			// Generate some values
			rng.next();
			rng.next();
			const state = rng.getState();

			// Generate sequence
			const sequence1 = Array.from({ length: 5 }, () => rng.next());

			// Restore state and generate again
			rng.setState(state);
			const sequence2 = Array.from({ length: 5 }, () => rng.next());

			expect(sequence1).toEqual(sequence2);
		});

		it('should handle state as 32-bit unsigned integer', () => {
			const rng = new SeededRNG(12345);

			// Set maximum 32-bit unsigned value
			rng.setState(4294967295);
			expect(rng.getState()).toBe(4294967295);

			// Should still generate valid values
			const value = rng.next();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		});

		it('should convert negative state values to unsigned', () => {
			const rng = new SeededRNG(12345);

			rng.setState(-1);
			const state = rng.getState();

			// -1 as unsigned 32-bit is 4294967295
			expect(state).toBe(4294967295);
		});
	});
});
