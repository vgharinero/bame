'use client';

import {
	LoadingOverlay,
	TurnIndicator,
	useGame,
	useGameActions,
	useGameSync,
} from '@bame/core/client';
import { useAuth } from '@bame/core/infra/nextjs/providers';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
	type TicTacToeConfig,
	type TicTacToePhase,
	type TicTacToePrivateState,
	type TicTacToePublicState,
	ticTacToeGame,
} from '@/game-logic/TicTacToeGame';

export default function GamePage() {
	const params = useParams();
	const router = useRouter();
	const { user } = useAuth();
	const gameId = params.id as string;

	const {
		game,
		myPlayer: _,
		isMyTurn,
		setOptimisticState,
	} = useGame<
		TicTacToeConfig,
		TicTacToePublicState,
		TicTacToePrivateState,
		TicTacToePhase
	>(gameId);

	const { applyAction, isApplying, error } = useGameActions(
		gameId,
		ticTacToeGame,
		game,
		setOptimisticState,
	);

	const { isBlocked, syncMessage } = useGameSync(gameId);

	useEffect(() => {
		if (!user) {
			router.push('/');
		}
	}, [user, router]);

	const handleCellClick = async (row: number, col: number) => {
		if (!isMyTurn || isApplying || !game) return;

		// Check if cell is already filled
		if (game.publicState.board[row][col] !== '') return;

		try {
			await applyAction({
				type: 'place_mark',
				payload: { row, col },
			});
		} catch (err) {
			console.error('Failed to place mark:', err);
		}
	};

	const handleBackToLobbies = () => {
		router.push('/lobbies');
	};

	if (!user || !game) return null;

	const mySymbol = game.publicState.playerSymbols[user.id];
	const currentPlayer = game.players.find(
		(p) => p.id === game.turn.currentPlayerId,
	);
	const isGameOver = game.status === 'finished';
	const winner = game.winner
		? game.players.find((p) => p.id === game.winner)
		: null;

	return (
		<>
			<LoadingOverlay isLoading={isBlocked} message={syncMessage} />

			<div className="min-h-screen bg-gray-100 p-8">
				<div className="mx-auto max-w-2xl">
					{/* Header */}
					<div className="mb-6 rounded-lg bg-white p-6 shadow">
						<div className="mb-4 flex items-center justify-between">
							<h1 className="text-2xl font-bold">Tic-Tac-Toe</h1>
							<button
								type="button"
								onClick={handleBackToLobbies}
								className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
							>
								Back to Lobbies
							</button>
						</div>

						<p className="text-gray-600">
							You are playing as:{' '}
							<span className="font-bold text-2xl">{mySymbol}</span>
						</p>
					</div>

					{/* Turn Indicator */}
					{!isGameOver && currentPlayer && (
						<div className="mb-6">
							<TurnIndicator
								currentPlayer={currentPlayer}
								isMyTurn={isMyTurn}
							/>
						</div>
					)}

					{/* Game Over Message */}
					{isGameOver && (
						<div className="mb-6 rounded-lg bg-white p-6 shadow text-center">
							{winner ? (
								<div>
									<h2 className="text-2xl font-bold text-green-600 mb-2">
										{winner.id === user.id
											? 'You Win! 🎉'
											: `${winner.displayName} Wins!`}
									</h2>
									<p className="text-gray-600">
										{game.publicState.playerSymbols[winner.id]} is the winner!
									</p>
								</div>
							) : (
								<div>
									<h2 className="text-2xl font-bold text-gray-600 mb-2">
										It's a Draw! 🤝
									</h2>
									<p className="text-gray-600">Good game!</p>
								</div>
							)}
						</div>
					)}

					{/* Game Board */}
					<div className="rounded-lg bg-white p-8 shadow">
						<div className="mx-auto grid max-w-md grid-cols-3 gap-2">
							{game.publicState.board.map((row, rowIndex) =>
								row.map((cell, colIndex) => (
									<button
										type="button"
										// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
										key={`${rowIndex}-${colIndex}`}
										onClick={() => handleCellClick(rowIndex, colIndex)}
										disabled={
											!isMyTurn || isApplying || cell !== '' || isGameOver
										}
										className={`
                      aspect-square text-6xl font-bold transition-colors
                      ${cell === '' ? 'bg-gray-100 hover:bg-gray-200' : 'bg-white'}
                      ${!isMyTurn || isApplying || cell !== '' || isGameOver ? 'cursor-not-allowed' : 'cursor-pointer'}
                      rounded-lg border-2 border-gray-300
                      ${cell === 'X' ? 'text-blue-600' : 'text-red-600'}
                    `}
									>
										{cell}
									</button>
								)),
							)}
						</div>
					</div>

					{/* Error Display */}
					{error && (
						<div className="mt-4 rounded-lg bg-red-50 p-4 text-red-600">
							Error: {error.message}
						</div>
					)}

					{/* Players List */}
					<div className="mt-6 rounded-lg bg-white p-6 shadow">
						<h3 className="mb-4 font-semibold">Players</h3>
						<div className="space-y-2">
							{game.players.map((player) => (
								<div
									key={player.id}
									className="flex items-center justify-between rounded bg-gray-50 p-3"
								>
									<div className="flex items-center gap-3">
										{player.avatarUrl && (
											<img
												src={player.avatarUrl}
												alt={player.displayName}
												className="h-10 w-10 rounded-full"
											/>
										)}
										<div>
											<p className="font-medium">
												{player.displayName}
												{player.id === user.id && ' (You)'}
											</p>
											<p className="text-sm text-gray-600">
												Playing as: {game.publicState.playerSymbols[player.id]}
											</p>
										</div>
									</div>
									<div
										className={`
                    rounded-full px-3 py-1 text-sm font-medium
                    ${player.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}
                  `}
									>
										{player.status}
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
