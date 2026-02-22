import type { Payload, PayloadMap } from '../primitives';
import type { Action } from './action';
import type { Game } from './game';
import type {
	ApplyActionResult,
	CheckGameEndResult,
	GameInitializationResult,
	ValidateActionResult,
} from './results';

export interface Engine<
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
> {
	name: string;
	minPlayers: number;
	maxPlayers: number;

	initialize(
		config: TConfig,
		playerIds: string[],
		seed: string,
	): GameInitializationResult<
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>;

	validateAction(
		game: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionPayloadMap,
			TPhasePayloadMap
		>,
		action: Action<TActionPayloadMap, TPhasePayloadMap>,
	): ValidateActionResult;

	applyAction(
		game: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionPayloadMap,
			TPhasePayloadMap
		>,
		action: Action<TActionPayloadMap, TPhasePayloadMap>,
	): ApplyActionResult<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>;

	checkGameEnd(
		game: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionPayloadMap,
			TPhasePayloadMap
		>,
	): CheckGameEndResult;
}
