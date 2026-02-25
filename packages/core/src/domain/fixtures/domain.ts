import type { Public } from '../primitives';

export type TestConfig = {
	maxPlayers: number;
};

export type TestPublicState = {
	board: string[];
};

export type TestPrivateState = {
	hand: string[];
};

export type TestEnemyState = {
	handCount: number;
};

export type TestActionPayloadMap = {
	move: Public<{ position: number }>;
	draw: Public<{ count: number }>;
	pass: Public<null>;
};

export type TestPhasePayloadMap = {
	setup: Public<{ ready: boolean }>;
	play: Public<{ round: number }>;
	end: Public<null>;
};
