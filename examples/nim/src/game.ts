import {
	defineGame,
	type EndIfContext,
	invalid,
	type MoveContext,
	type SetupContext,
} from '@bame/core';

export interface NimState {
	sticks: number;
}

export interface NimConfig {
	sticks?: number;
}

function setup({ config }: SetupContext<NimConfig>): NimState {
	return {
		sticks: config?.sticks ?? 15,
	};
}

function take({ state }: MoveContext<NimState>, count: number) {
	if (![1, 2, 3].includes(count) || count > state.sticks) {
		return invalid('Take 1, 2, or 3 sticks (up to remaining sticks)');
	}
	state.sticks -= count;
}

function endIf({ state, player }: EndIfContext<NimState, NimConfig>) {
	if (state.sticks === 0) {
		return { winner: player.id };
	}
	return undefined;
}

export const nim = defineGame({
	name: 'nim',
	players: 2,
	setup,
	moves: { take },
	endIf,
});
