'use client';

import { useActiveRedirect, useLobbies, useLobby } from '@bame/core/client';
import { useAuth } from '@bame/core/infra/nextjs/providers';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { TicTacToeConfig } from '../../game-logic/TicTacToeGame';

export default function LobbiesPage() {
	const { user, signOut } = useAuth();
	const { createLobby } = useLobby<TicTacToeConfig>();
	const { myLobbies, availableLobbies, isLoading } =
		useLobbies<TicTacToeConfig>();
	const { activeSession, isChecking } = useActiveRedirect();
	const router = useRouter();

	useEffect(() => {
		if (!isChecking && activeSession) {
			if (activeSession.type === 'game') {
				router.push(`/game/${activeSession.id}`);
			} else {
				router.push(`/lobby/${activeSession.id}`);
			}
		}
	}, [isChecking, activeSession, router]);

	useEffect(() => {
		if (!user) {
			router.push('/');
		}
	}, [user, router]);

	const handleCreateLobby = async () => {
		try {
			const lobby = await createLobby(
				{ gameType: 'tic-tac-toe', boardSize: 3 },
				2,
				2,
			);
			router.push(`/lobby/${lobby.id}`);
		} catch (err) {
			console.error('Failed to create lobby:', err);
		}
	};

	const handleJoinLobby = (lobbyId: string) => {
		router.push(`/lobby/${lobbyId}`);
	};

	if (!user || isChecking) return null;

	return (
		<div className="bg-gray-100 p-8 min-h-screen">
			<div className="mx-auto max-w-4xl">
				<div className="flex justify-between items-center mb-8">
					<div>
						<h1 className="font-bold text-3xl">Tic-Tac-Toe Lobbies</h1>
						<p className="text-gray-600">Welcome, {user.displayName}!</p>
					</div>
					<button
						type="button"
						onClick={() => signOut()}
						className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white"
					>
						Sign Out
					</button>
				</div>

				<button
					type="button"
					onClick={handleCreateLobby}
					className="bg-blue-600 hover:bg-blue-700 mb-6 py-3 rounded w-full font-medium text-white"
				>
					Create New Game
				</button>

				{myLobbies.length > 0 && (
					<div className="space-y-4 mb-8">
						<h2 className="font-semibold text-xl">My Active Games</h2>
						{myLobbies.map((lobby) => (
							<div
								key={lobby.id}
								className="flex justify-between items-center bg-blue-50 shadow p-4 border-2 border-blue-200 rounded-lg"
							>
								<div>
									<p className="font-medium">
										Host:{' '}
										{
											lobby.members.find((m) => m.id === lobby.hostId)
												?.displayName
										}
									</p>
									<p className="text-gray-600 text-sm">
										Players: {lobby.members.length} / {lobby.maxPlayers}
									</p>
									<p className="text-gray-500 text-xs">Code: {lobby.code}</p>
									<p className="font-semibold text-blue-600 text-xs capitalize">
										Status: {lobby.status}
									</p>
								</div>
								<button
									type="button"
									onClick={() => handleJoinLobby(lobby.id)}
									className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white"
								>
									{lobby.status === 'waiting' ? 'Rejoin' : 'Continue'}
								</button>
							</div>
						))}
					</div>
				)}

				<div className="space-y-4">
					<h2 className="font-semibold text-xl">Available Games</h2>

					{isLoading ? (
						<p>Loading lobbies...</p>
					) : availableLobbies.length === 0 ? (
						<p className="text-gray-500">No games available. Create one!</p>
					) : (
						availableLobbies.map((lobby) => (
							<div
								key={lobby.id}
								className="flex justify-between items-center bg-white shadow p-4 rounded-lg"
							>
								<div>
									<p className="font-medium">
										Host:{' '}
										{
											lobby.members.find((m) => m.id === lobby.hostId)
												?.displayName
										}
									</p>
									<p className="text-gray-600 text-sm">
										Players: {lobby.members.length} / {lobby.maxPlayers}
									</p>
									<p className="text-gray-500 text-xs">Code: {lobby.code}</p>
								</div>
								<button
									type="button"
									onClick={() => handleJoinLobby(lobby.id)}
									className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white"
								>
									Join
								</button>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
