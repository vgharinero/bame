import {
	defineGame,
	type EndIfContext,
	type GameResult,
	invalid,
	type MoveContext,
	type SetupContext,
	type ViewContext,
} from '@bame/core';

export interface HighCardState {
	cards: Record<string, number>;
	redrawn: string[];
	revealed: string[];
}

export interface HighCardView {
	cards: Record<string, number>;
	redrawn: string[];
	revealed: string[];
}

function computeWinner(cards: Record<string, number>): GameResult {
	const entries = Object.entries(cards);
	const maxCard = Math.max(...entries.map(([, val]) => val));
	const topPlayers = entries.filter(([, val]) => val === maxCard);
	if (topPlayers.length > 1) {
		return { draw: true };
	}
	return { winner: topPlayers[0][0] };
}

function setup({ players, random }: SetupContext): HighCardState {
	return {
		cards: Object.fromEntries(players.map((p) => [p.id, random.int(1, 13)])),
		redrawn: [],
		revealed: [],
	};
}

function advanceToNextUnrevealed({
	state,
	player,
	players,
	endTurn,
}: MoveContext<HighCardState>) {
	for (let offset = 1; offset <= players.length; offset++) {
		const candidate = players[(player.index + offset) % players.length];
		if (!state.revealed.includes(candidate.id)) {
			endTurn(candidate.id);
			return;
		}
	}
}

function redraw(ctx: MoveContext<HighCardState>) {
	const { state, player, random } = ctx;
	if (state.revealed.includes(player.id)) {
		return invalid('Cannot redraw after revealing your card');
	}
	if (state.redrawn.includes(player.id)) {
		return invalid('You can only redraw once per round');
	}
	state.cards[player.id] = random.int(1, 13);
	state.redrawn.push(player.id);
	advanceToNextUnrevealed(ctx);
}

function reveal(ctx: MoveContext<HighCardState>) {
	const { state, player } = ctx;
	if (state.revealed.includes(player.id)) {
		return invalid('Already revealed');
	}
	state.revealed.push(player.id);
	advanceToNextUnrevealed(ctx);
}

function view({ state, playerId }: ViewContext<HighCardState>): HighCardView {
	return {
		redrawn: state.redrawn,
		revealed: state.revealed,
		cards: Object.fromEntries(
			Object.entries(state.cards).filter(
				([id]) => id === playerId || state.revealed.includes(id),
			),
		),
	};
}

function endIf({ state, players }: EndIfContext<HighCardState>) {
	if (state.revealed.length === players.length) {
		return computeWinner(state.cards);
	}
	return undefined;
}

export const highCard = defineGame({
	name: 'high-card',
	players: { min: 2, max: 6 },
	setup,
	moves: {
		redraw,
		reveal,
	},
	view,
	endIf,
});
