import {
	defineGame,
	type EndIfContext,
	invalid,
	type MoveContext,
} from '@bame/core';

export type CellValue = 'X' | 'O' | null;

export interface TicTacToeState {
	board: CellValue[];
}

const WIN_LINES = [
	[0, 1, 2],
	[3, 4, 5],
	[6, 7, 8],
	[0, 3, 6],
	[1, 4, 7],
	[2, 5, 8],
	[0, 4, 8],
	[2, 4, 6],
] as const;

function setup(): TicTacToeState {
	return {
		board: Array<CellValue>(9).fill(null),
	};
}

function place({ state, player }: MoveContext<TicTacToeState>, cell: number) {
	if (
		!Number.isInteger(cell) ||
		cell < 0 ||
		cell > 8 ||
		state.board[cell] !== null
	) {
		return invalid('Invalid cell');
	}
	state.board[cell] = player.index === 0 ? 'X' : 'O';
}

function endIf({ state, player }: EndIfContext<TicTacToeState>) {
	const b = state.board;
	if (WIN_LINES.some(([x, y, z]) => b[x] && b[x] === b[y] && b[x] === b[z])) {
		return { winner: player.id };
	}
	if (b.every(Boolean)) {
		return { draw: true };
	}
	return undefined;
}

export const ticTacToe = defineGame({
	name: 'tic-tac-toe',
	players: 2,
	turn: { allowUndo: true },
	setup,
	moves: { place },
	endIf,
});
