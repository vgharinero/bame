import type { Action, Game, Player } from '../domain';
import type { Payload, PayloadMap } from '../primitives';

export const isGameActive = <
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
>(
	state: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
): boolean => {
	return state.status === 'active';
};

export const isPlayerTurn = <
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
>(
	state: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
	playerId: string,
): boolean => {
	return state.turn.currentPlayerId === playerId;
};

export const isPlayerActive = <TPrivateState extends Payload>(
	players: Player<TPrivateState>[],
	userId: string,
): boolean => {
	const player = players.find((p) => p.id.userId === userId);
	return player?.status === 'active';
};

export const isActionAllowed = <
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
>(
	state: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
	actionType: keyof TActionPayloadMap,
): boolean => {
	return state.turn.allowedActions.includes(actionType);
};

export const validateRequiredPhase = <TPhasePayloadMap extends PayloadMap>(
	currentPhase: keyof TPhasePayloadMap,
	requiredPhase?: keyof TPhasePayloadMap,
): boolean => {
	if (!requiredPhase) return true;
	return currentPhase === requiredPhase;
};

export const areRequiredActionsComplete = <
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
>(
	state: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
): boolean => {
	return !state.turn.requiredActions || state.turn.requiredActions.length === 0;
};

export const canPlayerAct = <
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
>(
	state: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
	userId: string,
): boolean => {
	return (
		isGameActive(state) &&
		isPlayerTurn(state, userId) &&
		isPlayerActive(state.players, userId)
	);
};

export const canPerformAction = <
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
>(
	state: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
	action: Action<TActionPayloadMap, TPhasePayloadMap>,
): boolean => {
	return (
		canPlayerAct(state, action.userId) &&
		isActionAllowed(state, action.type) &&
		validateRequiredPhase(state.turn.phase, action.requiredPhase)
	);
};

export const canAdvancePhase = <
	TConfig extends Payload,
	TPublicState extends Payload,
	TPrivateState extends Payload,
	TActionPayloadMap extends PayloadMap,
	TPhasePayloadMap extends PayloadMap,
>(
	state: Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	>,
): boolean => {
	return isGameActive(state) && areRequiredActionsComplete(state);
};
