export type SeededRandom = {
    /** Returns a float between 0 (inclusive) and 1 (exclusive) */
    next: () => number;
    /** Returns an integer between min (inclusive) and max (inclusive) */
    int: (min: number, max: number) => number;
    /** Shuffle an array in place */
    shuffle: <T>(array: T[]) => T[];
    /** Pick a random element from an array */
    pick: <T>(array: T[]) => T;
};

/**
 * Create a deterministic random number generator from a seed.
 * Same seed always produces the same sequence - essential for replays.
 * 
 * Uses mulberry32 algorithm - fast and good distribution.
 */
export const createSeededRandom = (seed: string): SeededRandom => {
    // Convert string seed to number using simple hash
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }

    // mulberry32 PRNG
    const next = (): number => {
        h |= 0;
        h = h + 0x6D2B79F5 | 0;
        let t = Math.imul(h ^ h >>> 15, 1 | h);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    return {
        next,
        int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
        shuffle: <T>(array: T[]): T[] => {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        },
        pick: <T>(array: T[]): T => array[Math.floor(next() * array.length)],
    };
};

