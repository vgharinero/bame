import {
	defineGame,
	type EndIfContext,
	invalid,
	type MoveContext,
	type SetupContext,
} from '@bame/core';

export interface LightsOutState {
	grid: boolean[];
	movesCount: number;
}

const NEIGHBORS: Record<number, number[]> = {
	0: [0, 1, 3],
	1: [0, 1, 2, 4],
	2: [1, 2, 5],
	3: [0, 3, 4, 6],
	4: [1, 3, 4, 5, 7],
	5: [2, 4, 5, 8],
	6: [3, 6, 7],
	7: [4, 6, 7, 8],
	8: [5, 7, 8],
};

function toggleCellInGrid(grid: boolean[], cell: number) {
	for (const idx of NEIGHBORS[cell] ?? []) {
		grid[idx] = !grid[idx];
	}
}

function setup({ random }: SetupContext): LightsOutState {
	// Start from all-off and apply 4 random valid toggles so the puzzle is guaranteed solvable
	const grid = Array<boolean>(9).fill(false);
	for (let i = 0; i < 4; i++) {
		toggleCellInGrid(grid, random.int(0, 8));
	}
	if (grid.every((on) => !on)) {
		toggleCellInGrid(grid, 4);
	}
	return {
		grid,
		movesCount: 0,
	};
}

function toggle({ state }: MoveContext<LightsOutState>, cell: number) {
	if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
		return invalid('Select a valid tile (0-8)');
	}
	toggleCellInGrid(state.grid, cell);
	state.movesCount += 1;
}

function endIf({ state, player }: EndIfContext<LightsOutState>) {
	if (state.grid.every((on) => !on)) {
		return { winner: player.id };
	}
	return undefined;
}

export const lightsOut = defineGame({
	name: 'lights-out',
	players: 1,
	turn: { allowUndo: true },
	setup,
	moves: { toggle },
	endIf,
});
