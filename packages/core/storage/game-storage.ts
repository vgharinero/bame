import type { Action } from '../engine/types';
import type { GameState } from '../engine/types/game-state';

export interface IGameStorage {
	createGame<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TPhase extends string,
		TPhaseData extends object,
	>(
		lobbyId: string,
		initialState: GameState<
			TConfig,
			TPublicState,
			TPrivateState,
			TPhase,
			TPhaseData
		>,
	): Promise<
		GameState<TConfig, TPublicState, TPrivateState, TPhase, TPhaseData>
	>;

	getGame<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameId: string,
	): Promise<GameState<
		TConfig,
		TPublicState,
		TPrivateState,
		TPhase,
		TPhaseData
	> | null>;

	updateGameState<
		TConfig extends object,
		TPublicState extends object,
		TPrivateState extends object,
		TPhase extends string,
		TPhaseData extends object,
	>(
		gameId: string,
		state: GameState<TConfig, TPublicState, TPrivateState, TPhase, TPhaseData>,
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

	// Action history (optional, for replay/anti-cheat)
	saveAction?(gameId: string, action: Action): Promise<void>;

	getActionHistory?(gameId: string): Promise<Action[]>;
}
