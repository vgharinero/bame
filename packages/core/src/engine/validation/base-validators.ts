import type { Action, GameState, Player } from '../types';

export const isGameActive = <
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
>(
	state: GameState<
		object,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>,
): boolean => {
	return state.status === 'active';
};

export const isPlayerTurn = <
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
>(
	state: GameState<
		object,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>,
	playerId: string,
): boolean => {
	return state.turn.currentPlayerId === playerId;
};

export const isPlayerActive = (
	players: Player<object>[],
	playerId: string,
): boolean => {
	const player = players.find((p) => p.id === playerId);
	return player?.status === 'active';
};

export const isActionAllowed = <
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
>(
	state: GameState<
		object,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>,
	actionType: TActionType,
): boolean => {
	return state.turn.allowedActions.includes(actionType);
};

export const validateRequiredPhase = (
	currentPhase: string,
	requiredPhase?: string,
): boolean => {
	if (!requiredPhase) return true;
	return currentPhase === requiredPhase;
};

export const areRequiredActionsComplete = <
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
>(
	state: GameState<
		object,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>,
): boolean => {
	return !state.turn.requiredActions || state.turn.requiredActions.length === 0;
};

export const canPlayerAct = <
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
>(
	state: GameState<
		object,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>,
	playerId: string,
): boolean => {
	return (
		isGameActive(state) &&
		isPlayerTurn(state, playerId) &&
		isPlayerActive(state.players, playerId)
	);
};

export const canPerformAction = <
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
>(
	state: GameState<
		object,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>,
	action: Action,
): boolean => {
	return (
		canPlayerAct(state, action.playerId) &&
		isActionAllowed(state, action.type) &&
		validateRequiredPhase(state.turn.phase, action.requiredPhase)
	);
};

export const canAdvancePhase = <
	TPublicState extends object,
	TPrivateState extends object,
	TActionType extends string,
	TPhase extends string,
	TPhaseData extends object,
>(
	state: GameState<
		object,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	>,
): boolean => {
	return isGameActive(state) && areRequiredActionsComplete(state);
};
