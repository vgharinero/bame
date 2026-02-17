import type {
	Action,
	Game,
	GameStatus,
	PlayerStatus,
	Turn,
} from '../engine/types';

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
	): Promise<Game<
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
		state: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
	): Promise<void>;

	updateGameStatus(gameId: string, status: GameStatus): Promise<void>;

	updatePlayerStatus(
		gameId: string,
		playerId: string,
		status: PlayerStatus,
	): Promise<void>;

	// RPC for atomic action application
	applyGameActionAtomically<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TActionType extends string,
		TActionPayload extends object,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameId: string,
		newState: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionType,
			TPhase,
			TPhaseData
		>,
		action: Action<TActionType, TActionPayload>,
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
		turnData: Turn<TActionType, TPhase, TPhaseData>,
		playerIds: string[],
		privateStates: TPrivateState[],
		config: TConfig,
		seed: string,
	): Promise<void>;

	// RPC to sync player and check if all ready
	syncPlayerToGameAtomically(gameId: string, userId: string): Promise<void>;

	// Action history (optional, for replay/anti-cheat)
	saveAction?<TActionType extends string, TActionPayload extends object>(
		gameId: string,
		action: Action<TActionType, TActionPayload>,
	): Promise<void>;

	getActionHistory?<TActionType extends string, TActionPayload extends object>(
		gameId: string,
	): Promise<Action<TActionType, TActionPayload>[]>;
}
