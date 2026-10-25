export class SeededRNG {
	private state: number;

	constructor(seed: number) {
		// Ensure seed is a 32-bit integer
		this.state = seed >>> 0;
	}

	static fromString(seed: string) {
		let hash = 0;
		for (let i = 0; i < seed.length; i++) {
			hash = (hash << 5) - hash + seed.charCodeAt(i);
			hash = hash >>> 0;
		}
		return new SeededRNG(hash);
	}

	next(): number {
		this.state += 0x6d2b79f5;
		let t = this.state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	nextInt(min: number, max: number): number {
		return Math.floor(this.next() * (max - min + 1)) + min;
	}

	nextFloat(min: number, max: number): number {
		return this.next() * (max - min) + min;
	}

	choice<T>(array: T[]): T {
		if (array.length === 0) {
			throw new Error('Cannot select from empty array');
		}
		return array[this.nextInt(0, array.length - 1)];
	}

	shuffle<T>(array: T[]): T[] {
		for (let i = array.length - 1; i > 0; i--) {
			const j = this.nextInt(0, i);
			[array[i], array[j]] = [array[j], array[i]];
		}
		return array;
	}

	boolean(probability: number = 0.5): boolean {
		return this.next() < probability;
	}

	getState(): number {
		return this.state;
	}

	setState(state: number): void {
		this.state = state >>> 0;
	}
}
