'use client';

import { useLobby } from '@bame/core/client';
import type { Lobby } from '@bame/core/engine';
import { useAuth, useStorage } from '@bame/core/infra/nextjs/providers';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { TicTacToeConfig } from '../../game-logic/TicTacToeGame';

export default function LobbiesPage() {
	const { user, signOut } = useAuth();
	const { lobbyStorage } = useStorage();
	const { createLobby } = useLobby<TicTacToeConfig>();
	const router = useRouter();

	const [lobbies, setLobbies] = useState<Lobby<TicTacToeConfig>[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const fetchLobbies = useCallback(async () => {
		try {
			const data = await lobbyStorage.listLobbies<TicTacToeConfig>({
				status: 'waiting',
				hasSpace: true,
			});
			setLobbies(data);
		} catch (err) {
			console.error('Failed to fetch lobbies:', err);
		} finally {
			setIsLoading(false);
		}
	}, [lobbyStorage]);

	useEffect(() => {
		if (!user) {
			router.push('/');
			return;
		}

		fetchLobbies();

		// Poll for lobby updates (or use realtime subscription)
		const interval = setInterval(fetchLobbies, 3000);
		return () => clearInterval(interval);
	}, [user, router, fetchLobbies]);

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

	if (!user) return null;

	return (
		<div className="min-h-screen bg-gray-100 p-8">
			<div className="mx-auto max-w-4xl">
				<div className="mb-8 flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold">Tic-Tac-Toe Lobbies</h1>
						<p className="text-gray-600">Welcome, {user.displayName}!</p>
					</div>
					<button
						type="button"
						onClick={() => signOut()}
						className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
					>
						Sign Out
					</button>
				</div>

				<button
					type="button"
					onClick={handleCreateLobby}
					className="mb-6 w-full rounded bg-blue-600 py-3 font-medium text-white hover:bg-blue-700"
				>
					Create New Game
				</button>

				<div className="space-y-4">
					<h2 className="text-xl font-semibold">Available Games</h2>

					{isLoading ? (
						<p>Loading lobbies...</p>
					) : lobbies.length === 0 ? (
						<p className="text-gray-500">No games available. Create one!</p>
					) : (
						lobbies.map((lobby) => (
							<div
								key={lobby.id}
								className="flex items-center justify-between rounded-lg bg-white p-4 shadow"
							>
								<div>
									<p className="font-medium">
										Host:{' '}
										{
											lobby.members.find((m) => m.id === lobby.hostId)
												?.displayName
										}
									</p>
									<p className="text-sm text-gray-600">
										Players: {lobby.members.length} / {lobby.maxPlayers}
									</p>
									<p className="text-xs text-gray-500">Code: {lobby.code}</p>
								</div>
								<button
									type="button"
									onClick={() => handleJoinLobby(lobby.id)}
									className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
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
