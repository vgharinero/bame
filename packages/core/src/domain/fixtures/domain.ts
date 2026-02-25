import type { PublicAction } from '../action';

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
	MOVE: PublicAction<{ position: number }>;
	DRAW: PublicAction<{ count: number }>;
	PASS: PublicAction<null>;
};

export type TestPhasePayloadMap = {
	SETUP: { ready: boolean };
	PLAY: { round: number };
	END: null;
};
