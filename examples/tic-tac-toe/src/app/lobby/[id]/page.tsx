'use client';

import {
	LoadingOverlay,
	useActiveRedirect,
	useLobby,
} from '@bame/core/client';
import { useAuth } from '@bame/core/infra/nextjs/providers';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
	type TicTacToeConfig,
	ticTacToeGame,
} from '@/game-logic/TicTacToeGame';

export default function LobbyPage() {
	const params = useParams();
	const router = useRouter();
	const { user } = useAuth();
	const lobbyId = params.id as string;

	const {
		lobby,
		isLoading,
		error,
		isHost,
		isMember,
		joinLobby,
		leaveLobby,
		startGame,
	} = useLobby<TicTacToeConfig>(lobbyId);

	const { skipRedirect } = useActiveRedirect();
	const [isJoining, setIsJoining] = useState(false);

	// Redirect if not authenticated
	useEffect(() => {
		if (!user) {
			router.push('/');
			return;
		}
	}, [user, router]);

	// Redirect to game when lobby transitions
	useEffect(() => {
		if (lobby?.status === 'transitioned') {
			router.push(`/game/${lobbyId}`);
		}
	}, [lobby, lobbyId, router]);

	const handleJoin = async () => {
		try {
			setIsJoining(true);
			await joinLobby(lobbyId);
		} catch (err) {
			console.error('Failed to join lobby:', err);
		} finally {
			setIsJoining(false);
		}
	};

	const handleStart = async () => {
		try {
			await startGame(ticTacToeGame);
		} catch (err) {
			console.error('Failed to start game:', err);
		}
	};

	const handleLeave = async () => {
		try {
			skipRedirect();
			await leaveLobby();
			router.push('/lobbies');
		} catch (err) {
			console.error('Failed to leave lobby:', err);
			console.error('Error details:', JSON.stringify(err, null, 2));
			alert(`Failed to leave lobby: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	};

	if (!user) return null;

	if (error) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="text-center">
					<p className="text-red-600 mb-4">Error: {error.message}</p>
					<button
						type="button"
						onClick={() => router.push('/lobbies')}
						className="rounded bg-blue-600 px-4 py-2 text-white"
					>
						Back to Lobbies
					</button>
				</div>
			</div>
		);
	}

	const canStart = isHost && lobby?.status === 'ready';
	const canJoin =
		!isMember && lobby && lobby.members.length < lobby.maxPlayers;
	const lobbyFull = !!(lobby && lobby.members.length >= lobby.maxPlayers);

	return (
		<>
			<LoadingOverlay
				isLoading={isLoading || lobby?.status === 'starting'}
				message={
					lobby?.status === 'starting' ? 'Starting game...' : 'Loading lobby...'
				}
			/>

			<div className="min-h-screen bg-gray-100 p-8">
				<div className="mx-auto max-w-2xl">
					<div className="mb-6 rounded-lg bg-white p-6 shadow">
						<div className="mb-4 flex items-center justify-between">
							<h1 className="text-2xl font-bold">Lobby</h1>
							{isMember && (
								<button
									type="button"
									onClick={handleLeave}
									className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
								>
									Leave
								</button>
							)}
							{!isMember && (
								<button
									type="button"
									onClick={() => router.push('/lobbies')}
									className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
								>
									Back
								</button>
							)}
						</div>

						<div className="mb-4">
							<p className="text-sm text-gray-600">Lobby Code</p>
							<p className="text-xl font-mono font-bold">{lobby?.code}</p>
						</div>

						<div className="mb-4">
							<p className="text-sm text-gray-600">Status</p>
							<p className="capitalize">{lobby?.status}</p>
						</div>
					</div>

					<div className="mb-6 rounded-lg bg-white p-6 shadow">
						<h2 className="mb-4 text-xl font-semibold">
							Players ({lobby?.members.length} / {lobby?.maxPlayers})
						</h2>
						<div className="space-y-2">
							{lobby?.members.map((member) => (
								<div
									key={member.id}
									className="flex items-center gap-3 rounded bg-gray-50 p-3"
								>
									{member.avatarUrl && (
										<img
											src={member.avatarUrl}
											alt={member.displayName}
											className="h-10 w-10 rounded-full"
										/>
									)}
									<div>
										<p className="font-medium">{member.displayName}</p>
										{member.id === lobby.hostId && (
											<span className="text-xs text-blue-600">Host</span>
										)}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Join Button - shown when not a member and space available */}
					{canJoin && (
						<button
							type="button"
							onClick={handleJoin}
							disabled={isJoining || lobbyFull}
							className={`w-full rounded py-3 font-medium text-white mb-4 ${
								isJoining || lobbyFull
									? 'bg-gray-400 cursor-not-allowed'
									: 'bg-green-600 hover:bg-green-700'
							}`}
						>
							{isJoining ? 'Joining...' : lobbyFull ? 'Lobby Full' : 'Join Game'}
						</button>
					)}

					{/* Start Button - shown when host and ready */}
					{isHost && isMember && (
						<button
							type="button"
							onClick={handleStart}
							disabled={!canStart}
							className={`w-full rounded py-3 font-medium text-white ${
								canStart
									? 'bg-green-600 hover:bg-green-700'
									: 'bg-gray-400 cursor-not-allowed'
							}`}
						>
							{canStart ? 'Start Game' : 'Waiting for players...'}
						</button>
					)}

					{/* Waiting message - shown when member but not host */}
					{!isHost && isMember && (
						<div className="text-center text-gray-600">
							Waiting for host to start the game...
						</div>
					)}
				</div>
			</div>
		</>
	);
}