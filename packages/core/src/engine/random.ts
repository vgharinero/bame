import { SeededRNG } from '../determinism/index.js';

export interface WeightedItem<T> {
	item: T;
	weight: number;
}

export interface GameRandom {
	/** Random float in [0, 1) */
	next(): number;
	/** Random integer in [min, max] (inclusive) */
	int(min: number, max: number): number;
	/** Random float in [min, max) */
	float(min: number, max: number): number;
	/** Pick a random element from a non-empty array */
	pick<T>(items: readonly T[]): T;
	/** Return a new shuffled copy of an array (does not mutate input) */
	shuffle<T>(items: readonly T[]): T[];
	/** Return true with the given probability (default 0.5) */
	chance(probability?: number): boolean;
	/**
	 * Roll `count` dice each with `sides` faces (default 6) and return the array of rolls
	 * (e.g. `random.dice(2, 6)` -> `[4, 2]`).
	 */
	dice(count: number, sides?: number): number[];
	/**
	 * Pick an item proportionally to its positive `weight`
	 * (e.g. `random.weighted([{ item: 'wood', weight: 4 }, { item: 'gold', weight: 1 }])`).
	 */
	weighted<T>(items: readonly WeightedItem<T>[]): T;
}

export interface StatefulGameRandom extends GameRandom {
	getCursor(): number;
}

export const createGameRandom = (
	seedOrCursor: string | number,
): StatefulGameRandom => {
	const rng =
		typeof seedOrCursor === 'string'
			? SeededRNG.fromString(seedOrCursor)
			: new SeededRNG(seedOrCursor);

	return {
		next: () => rng.next(),
		int: (min, max) => rng.nextInt(min, max),
		float: (min, max) => rng.nextFloat(min, max),
		pick: <T>(items: readonly T[]): T => {
			if (items.length === 0) {
				throw new Error('Cannot pick from an empty array');
			}
			return items[rng.nextInt(0, items.length - 1)];
		},
		shuffle: <T>(items: readonly T[]): T[] => {
			const copy = [...items];
			return rng.shuffle(copy);
		},
		chance: (probability = 0.5) => rng.boolean(probability),
		dice: (count: number, sides = 6): number[] => {
			if (!Number.isInteger(count) || count < 1) {
				throw new Error('Dice count must be a positive integer');
			}
			if (!Number.isInteger(sides) || sides < 2) {
				throw new Error('Dice sides must be an integer >= 2');
			}
			return Array.from({ length: count }, () => rng.nextInt(1, sides));
		},
		weighted: <T>(items: readonly WeightedItem<T>[]): T => {
			if (items.length === 0) {
				throw new Error('Cannot pick from an empty weighted list');
			}
			let totalWeight = 0;
			for (const entry of items) {
				if (entry.weight < 0 || !Number.isFinite(entry.weight)) {
					throw new Error('Weights must be non-negative finite numbers');
				}
				totalWeight += entry.weight;
			}
			if (totalWeight <= 0) {
				throw new Error('Total weight must be greater than 0');
			}
			let threshold = rng.nextFloat(0, totalWeight);
			for (const entry of items) {
				if (threshold < entry.weight) {
					return entry.item;
				}
				threshold -= entry.weight;
			}
			return items[items.length - 1].item;
		},
		getCursor: () => rng.getState(),
	};
};

export interface RandomProvider {
	readonly id: string;
	create(seed: string, cursor?: number): StatefulGameRandom;
}
export const defaultRandomProvider: RandomProvider = {
	id: 'mulberry32-v1',
	create: (seed, cursor) => createGameRandom(cursor ?? seed),
};
