import type { Payload, PayloadMap } from '../primitives';
import type { Game } from './game';
import type { Turn } from './turn';

export type GameInitializationResult<
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
> = {
	publicState: TPublicState;
	initialPrivateStates: Record<string, TPrivateState>;
	initialTurn: Turn<TActionPayloadMap, TPhasePayloadMap>;
};

export type ApplyActionResult<
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
> =
	| {
			success: true;
			newGame: Game<
				TConfig,
				TPublicState,
				TPrivateState,
				TActionPayloadMap,
				TPhasePayloadMap
			>;
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
