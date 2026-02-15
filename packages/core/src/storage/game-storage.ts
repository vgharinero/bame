import type { Action, GameState, TurnState } from '../engine/types';

export interface IGameStorage {
	getGame<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameId: string,
	): Promise<GameState<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionType,
		TPhase,
		TPhaseData
	> | null>;

	updateGameState<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameId: string,
		state: GameState<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
	): Promise<void>;

	updateGameStatus(
		gameId: string,
		status: 'waiting' | 'starting' | 'active' | 'finished' | 'aborted',
	): Promise<void>;

	updatePlayerStatus(
		gameId: string,
		playerId: string,
		status: 'active' | 'eliminated' | 'disconnected',
	): Promise<void>;

	// RPC for atomic action application
	applyGameActionAtomically<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameId: string,
		newState: GameState<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
		action: Action,
	): Promise<void>;

	// RPC for atomic transition
	transitionLobbyToGameAtomically<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TPhase extends string,
		TPhaseData extends object,
	>(
		lobbyId: string,
		publicState: TPublicState,
		currentPlayerId: string,
		currentPhase: TPhase,
		turnData: TurnState<TActionType, TPhase, TPhaseData>,
		playerIds: string[],
		privateStates: TPrivateState[],
		config: TConfig,
		seed: string,
	): Promise<void>;

	// RPC to sync player and check if all ready
	syncPlayerToGameAtomically(gameId: string, userId: string): Promise<void>;

	// Action history (optional, for replay/anti-cheat)
	saveAction?(gameId: string, action: Action): Promise<void>;

	getActionHistory?(gameId: string): Promise<Action[]>;
}
