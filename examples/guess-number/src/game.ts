import {
	defineGame,
	type EndIfContext,
	invalid,
	type MoveContext,
	type SetupContext,
	type ViewContext,
} from '@bame/core';

export interface GuessEntry {
	value: number;
	hint: 'higher' | 'lower' | 'correct';
}

export interface GuessNumberState {
	secret: number;
	maxGuesses: number;
	guesses: GuessEntry[];
}

export interface GuessNumberView {
	maxGuesses: number;
	guesses: GuessEntry[];
	revealedSecret?: number;
}

function setup({ random }: SetupContext): GuessNumberState {
	return {
		secret: random.int(1, 20),
		maxGuesses: 5,
		guesses: [],
	};
}

function guess({ state }: MoveContext<GuessNumberState>, value: number) {
	if (!Number.isInteger(value) || value < 1 || value > 20) {
		return invalid('Enter an integer between 1 and 20');
	}
	if (state.guesses.some((g) => g.value === value)) {
		return invalid(`You already guessed ${value}`);
	}

	const hint =
		value === state.secret
			? 'correct'
			: value < state.secret
				? 'higher'
				: 'lower';

	state.guesses.push({ value, hint });
}

function view({ state }: ViewContext<GuessNumberState>): GuessNumberView {
	const isOver =
		state.guesses.some((g) => g.hint === 'correct') ||
		state.guesses.length >= state.maxGuesses;

	return {
		maxGuesses: state.maxGuesses,
		guesses: state.guesses,
		revealedSecret: isOver ? state.secret : undefined,
	};
}

function endIf({ state, player }: EndIfContext<GuessNumberState>) {
	if (state.guesses.some((g) => g.hint === 'correct')) {
		return { winner: player.id };
	}
	if (state.guesses.length >= state.maxGuesses) {
		return { draw: true };
	}
	return undefined;
}

export const guessNumber = defineGame({
	name: 'guess-number',
	players: 1,
	setup,
	moves: { guess },
	view,
	endIf,
});
