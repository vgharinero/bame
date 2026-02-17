import type {
	Action,
	GameEngine,
	GameInitializationResult,
	GameState,
} from '@bame/core/engine';

// Type definitions
export type TicTacToeConfig = {
	gameType: 'tic-tac-toe';
	boardSize: 3;
};

export type TicTacToePublicState = {
	board: Array<Array<'X' | 'O' | ''>>;
	playerSymbols: Record<string, 'X' | 'O'>; // playerId -> symbol
};

export type TicTacToePrivateState = {}; // No private state

export type TicTacToeActionType = 'place_mark';

export type TicTacToeActionPayload = {
	row: number;
	col: number;
};

export type TicTacToePhase = 'main';

export type TicTacToePhaseData = {};

// Game implementation
class TicTacToeGameImpl
	implements
		GameEngine<
			TicTacToeConfig,
			TicTacToePublicState,
			TicTacToePrivateState,
			TicTacToeActionType,
			TicTacToeActionPayload,
			TicTacToePhase
		>
{
	name = 'Tic-Tac-Toe';
	minPlayers = 2;
	maxPlayers = 2;

	initialize(
		config: TicTacToeConfig,
		playerIds: string[],
		_seed: string,
	): GameInitializationResult<
		TicTacToePublicState,
		TicTacToePrivateState,
		TicTacToeActionType,
		TicTacToePhase,
		TicTacToePhaseData
	> {
		// Assign symbols based on playerIds order
		const playerSymbols: Record<string, 'X' | 'O'> = {
			[playerIds[0]]: 'X',
			[playerIds[1]]: 'O',
		};

		// Create empty board
		const board: Array<Array<'X' | 'O' | ''>> = Array.from(
			{ length: config.boardSize },
			() => Array.from({ length: config.boardSize }, () => ''),
		);

		return {
			publicState: {
				board,
				playerSymbols,
			},
			initialPrivateStates: [
				{}, // Player 0 (X) has no private state
				{}, // Player 1 (O) has no private state
			],
			initialTurn: {
				currentPlayerId: playerIds[0], // X goes first
				phase: 'main',
				phaseData: {},
				allowedActions: ['place_mark'],
				number: 1,
			},
		};
	}

	validateAction(
		state: GameState<
			TicTacToeConfig,
			TicTacToePublicState,
			TicTacToePrivateState,
			TicTacToeActionType,
			TicTacToePhase,
			TicTacToePhaseData
		>,
		action: Action<TicTacToeActionType, TicTacToeActionPayload>,
	): boolean {
		// Check if it's player's turn
		if (state.turn.currentPlayerId !== action.playerId) {
			return false;
		}

		// Check if game is active
		if (state.status !== 'active') {
			return false;
		}

		const { row, col } = action.payload;

		// Check bounds
		if (row < 0 || row > 2 || col < 0 || col > 2) {
			return false;
		}

		// Check if cell is empty
		if (state.publicState.board[row][col] !== '') {
			return false;
		}

		return true;
	}

	applyAction(
		state: GameState<
			TicTacToeConfig,
			TicTacToePublicState,
			TicTacToePrivateState,
			TicTacToeActionType,
			TicTacToePhase,
			TicTacToePhaseData
		>,
		action: Action<TicTacToeActionType, TicTacToeActionPayload>,
	) {
		const { row, col } = action.payload;
		const symbol = state.publicState.playerSymbols[action.playerId];

		// Create new state with updated board
		const newBoard = state.publicState.board.map((r, i) =>
			r.map((cell, j) => (i === row && j === col ? symbol : cell)),
		);

		const newState: GameState<
			TicTacToeConfig,
			TicTacToePublicState,
			TicTacToePrivateState,
			TicTacToeActionType,
			TicTacToePhase,
			TicTacToePhaseData
		> = {
			...state,
			publicState: {
				...state.publicState,
				board: newBoard,
			},
			turn: {
				...state.turn,
				currentPlayerId: this.getNextPlayer(state, action.playerId),
				number: state.turn.number + 1,
				startedAt: Date.now(),
			},
		};

		return {
			success: true,
			newState,
		};
	}

	checkGameEnd(
		state: GameState<
			TicTacToeConfig,
			TicTacToePublicState,
			TicTacToePrivateState,
			TicTacToeActionType,
			TicTacToePhase,
			TicTacToePhaseData
		>,
	): { isFinished: boolean; winner?: string; isDraw?: boolean } {
		const { board, playerSymbols } = state.publicState;

		// Check rows, columns, diagonals
		for (let i = 0; i < 3; i++) {
			// Rows
			if (
				board[i][0] !== '' &&
				board[i][0] === board[i][1] &&
				board[i][1] === board[i][2]
			) {
				return {
					isFinished: true,
					winner: this.getPlayerIdBySymbol(playerSymbols, board[i][0]),
				};
			}
			// Columns
			if (
				board[0][i] !== '' &&
				board[0][i] === board[1][i] &&
				board[1][i] === board[2][i]
			) {
				return {
					isFinished: true,
					winner: this.getPlayerIdBySymbol(playerSymbols, board[0][i]),
				};
			}
		}

		// Diagonals
		if (
			board[0][0] !== '' &&
			board[0][0] === board[1][1] &&
			board[1][1] === board[2][2]
		) {
			return {
				isFinished: true,
				winner: this.getPlayerIdBySymbol(playerSymbols, board[0][0]),
			};
		}
		if (
			board[0][2] !== '' &&
			board[0][2] === board[1][1] &&
			board[1][1] === board[2][0]
		) {
			return {
				isFinished: true,
				winner: this.getPlayerIdBySymbol(playerSymbols, board[0][2]),
			};
		}

		// Check for draw (board full)
		const isFull = board.every((row) => row.every((cell) => cell !== ''));
		if (isFull) {
			return {
				isFinished: true,
				isDraw: true,
			};
		}

		return { isFinished: false };
	}

	private getNextPlayer(
		state: GameState<
			TicTacToeConfig,
			TicTacToePublicState,
			TicTacToePrivateState,
			TicTacToeActionType,
			TicTacToePhase,
			TicTacToePhaseData
		>,
		currentPlayerId: string,
	): string {
		const currentIndex = state.players.findIndex(
			(p) => p.id === currentPlayerId,
		);
		const nextIndex = (currentIndex + 1) % state.players.length;
		return state.players[nextIndex].id;
	}

	private getPlayerIdBySymbol(
		playerSymbols: Record<string, 'X' | 'O'>,
		symbol: 'X' | 'O' | '',
	): string | undefined {
		return Object.entries(playerSymbols).find(([_, s]) => s === symbol)?.[0];
	}
}

export const ticTacToeGame = new TicTacToeGameImpl();
