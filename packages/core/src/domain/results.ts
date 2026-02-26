import type { Payload } from '../primitives';
import type { GameStatus } from './game';
import type { Perspective, PerspectiveMap } from './perspective';
import type { Turn } from './turn';

export type InitializationResult<
	TState extends Payload,
	TPlayerState extends Perspective,
	TActionMap extends PerspectiveMap,
	TPhaseMap extends PerspectiveMap,
> = {
	state: TState;
	playerStates: Record<string, TPlayerState>;
	initialTurn: Turn<TActionMap, TPhaseMap>;
};

export type ApplyActionResult<
	TState extends Payload,
	TPlayerState extends Perspective,
	TActionMap extends PerspectiveMap,
	TPhaseMap extends PerspectiveMap,
> =
	| {
			success: true;
			state: TState;
			playerStates: Record<string, TPlayerState>;
			newStatus?: GameStatus;
			newTurn?: Turn<TActionMap, TPhaseMap>;
	  }
	| {
			success: false;
			error: string;
	  };

export type ValidateActionResult =
	| {
			isValid: true;
	  }
	| {
			isValid: false;
			reason: string;
	  };

export type CheckGameEndResult =
	| {
			isFinished: false;
	  }
	| {
			isFinished: true;
			winner?: string;
			isDraw?: boolean;
	  };
