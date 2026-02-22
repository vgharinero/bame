export type TestConfig = {
	maxPlayers: number;
};

export type TestPublicState = {
	board: string[];
};

export type TestPrivateState = {
	hand: string[];
};

export type TestActionPayloadMap = {
	move: { position: number };
	draw: { count: number };
	pass: null;
};

export type TestPhasePayloadMap = {
	setup: { ready: boolean };
	play: { round: number };
	end: null;
};
