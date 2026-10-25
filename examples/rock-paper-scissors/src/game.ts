import {
	defineGame,
	type EndIfContext,
	invalid,
	type MoveContext,
	type SetupContext,
	type ViewContext,
} from '@bame/core';

export type RpsChoice = 'rock' | 'paper' | 'scissors';

export interface RpsRoundSummary {
	round: number;
	choices: Record<string, RpsChoice>;
	winner: string | 'draw';
}

export interface RpsState {
	round: number;
	scores: Record<string, number>;
	currentChoices: Record<string, RpsChoice>;
	lastRound?: RpsRoundSummary;
}

export interface RpsView {
	round: number;
	scores: Record<string, number>;
	myChoice: RpsChoice | null;
	chosenPlayerIds: string[];
	lastRound?: RpsRoundSummary;
}

const BEATS: Record<RpsChoice, RpsChoice> = {
	rock: 'scissors',
	paper: 'rock',
	scissors: 'paper',
};

function setup({ players }: SetupContext): RpsState {
	return {
		round: 1,
		scores: Object.fromEntries(players.map((p) => [p.id, 0])),
		currentChoices: {},
	};
}

function choose(
	{ state, player, players }: MoveContext<RpsState>,
	choice: RpsChoice,
) {
	if (!['rock', 'paper', 'scissors'].includes(choice)) {
		return invalid('Choose rock, paper, or scissors');
	}
	if (state.currentChoices[player.id]) {
		return invalid('You already locked in your choice for this round');
	}

	state.currentChoices[player.id] = choice;

	// Once both players have chosen, resolve the round
	if (Object.keys(state.currentChoices).length === players.length) {
		const [p1, p2] = players;
		const c1 = state.currentChoices[p1.id];
		const c2 = state.currentChoices[p2.id];

		let roundWinner: string | 'draw' = 'draw';
		if (c1 !== c2) {
			roundWinner = BEATS[c1] === c2 ? p1.id : p2.id;
			state.scores[roundWinner] += 1;
		}

		state.lastRound = {
			round: state.round,
			choices: { ...state.currentChoices },
			winner: roundWinner,
		};
		state.round += 1;
		state.currentChoices = {};
	}
}

function view({ state, playerId }: ViewContext<RpsState>): RpsView {
	return {
		round: state.round,
		scores: state.scores,
		myChoice: playerId ? (state.currentChoices[playerId] ?? null) : null,
		chosenPlayerIds: Object.keys(state.currentChoices),
		lastRound: state.lastRound,
	};
}

function endIf({ state, players }: EndIfContext<RpsState>) {
	for (const p of players) {
		if ((state.scores[p.id] ?? 0) >= 2) {
			return { winner: p.id };
		}
	}
	return undefined;
}

export const rockPaperScissors = defineGame({
	name: 'rock-paper-scissors',
	players: 2,
	turn: { allowOutOfTurn: true },
	setup,
	moves: { choose },
	view,
	endIf,
});
