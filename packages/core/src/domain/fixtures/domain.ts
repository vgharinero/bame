import type { GameDefinition } from '../game';
import type { Perspective, Public } from '../perspective';

export type TestConfig = {
	maxPlayers: number;
};

export type TestPublicState = {
	board: string[];
};

export type TestPlayerState = Perspective<
	{ hand: string[] },
	{ handCount: number }
>;

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

export interface TestGameDef extends GameDefinition {
	Config: TestConfig;
	State: TestPublicState;
	PlayerState: TestPlayerState;
	ActionMap: TestActionPayloadMap;
	PhaseMap: TestPhasePayloadMap;
}
