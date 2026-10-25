'use client';

import { createBame } from '@bame/core';
import {
	BameProvider,
	MatchResult,
	PlayerStats,
	SeatSwitcher,
	useBame,
	useLocalMatch,
} from '@bame/ui-react';
import { ticTacToe } from '../game';

const bame = createBame({
	games: [ticTacToe],
});

const PLAYERS = ['Alice', 'Bob'] as const;

function GameLobbyAndTable() {
	const { userId } = useBame();
	const {
		matchId,
		state,
		turn,
		status,
		result,
		isMyTurn,
		moves,
		canMove,
		undo,
		forfeit,
		error,
		startMatch,
	} = useLocalMatch(ticTacToe, {
		players: PLAYERS,
		autoStart: false,
		autoSwitchSeat: true,
	});

	return (
		<main className="mx-auto flex max-w-2xl flex-col items-center gap-8 px-4 py-12">
			<header className="text-center">
				<h1 className="text-3xl font-bold tracking-tight text-white">
					Tic-Tac-Toe
				</h1>
				<p className="mt-1 text-sm text-slate-400">
					Built with <code className="text-indigo-400">@bame/core</code> &{' '}
					<code className="text-indigo-400">@bame/ui-react</code>
				</p>
			</header>

			<section className="flex flex-wrap items-center justify-center gap-3">
				{PLAYERS.map((p) => (
					<PlayerStats
						key={p}
						userId={p}
						className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs"
						nameClassName="font-semibold text-white"
						statClassNames={{
							wins: 'text-emerald-400',
							losses: 'text-rose-400',
							draws: 'text-amber-400',
						}}
					/>
				))}
			</section>

			<SeatSwitcher
				players={PLAYERS}
				label="Active Seat:"
				className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-xs"
				labelClassName="px-2 text-slate-400"
				buttonClassName="rounded-lg px-3 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800 data-[active=true]:bg-indigo-600 data-[active=true]:text-white"
			/>

			{!matchId ? (
				<div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
					<p className="text-sm text-slate-300">
						Start a local 2-player match between Alice (X) and Bob (O).
					</p>
					<button
						type="button"
						onClick={startMatch}
						className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow hover:bg-indigo-500"
					>
						Start Match (Alice vs. Bob)
					</button>
				</div>
			) : !state || !turn ? (
				<div className="text-slate-400">Loading match...</div>
			) : (
				<div className="flex flex-col items-center gap-6">
					<div className="text-center">
						{status === 'active' ? (
							<p className="text-lg font-medium">
								Current Turn:{' '}
								<span className="font-bold text-indigo-400">
									{turn.currentPlayerId}
								</span>{' '}
								({turn.currentPlayerIndex === 0 ? 'X' : 'O'})
								{!isMyTurn && (
									<span className="ml-2 text-xs text-amber-400">
										(Switch active seat to {turn.currentPlayerId} to play)
									</span>
								)}
							</p>
						) : (
							<MatchResult
								status={status}
								result={result}
								actionLabel="Play Another Round"
								onAction={startMatch}
								className="space-y-3"
								titleClassName="text-2xl font-bold text-emerald-400"
								buttonClassName="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
							/>
						)}
					</div>

					{error && (
						<div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-300">
							{error}
						</div>
					)}

					<div className="grid grid-cols-3 gap-3">
						{state.board.map((cell, index) => (
							<button
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed 9-cell board
								key={index}
								type="button"
								disabled={!canMove('place', index)}
								onClick={() => moves.place(index)}
								className="flex h-24 w-24 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-4xl font-bold transition hover:border-indigo-500 disabled:cursor-default disabled:hover:border-slate-700"
							>
								<span
									className={
										cell === 'X'
											? 'text-indigo-400'
											: cell === 'O'
												? 'text-emerald-400'
												: ''
									}
								>
									{cell}
								</span>
							</button>
						))}
					</div>

					{status === 'active' && (
						<div className="flex items-center gap-3">
							<button
								type="button"
								disabled={turn.number <= 1}
								onClick={() => undo()}
								className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-indigo-500 disabled:opacity-40"
							>
								Undo Move
							</button>
							<button
								type="button"
								onClick={() => forfeit()}
								className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
							>
								Forfeit ({userId})
							</button>
						</div>
					)}

					<p className="text-xs text-slate-400">
						Viewing as seat:{' '}
						<strong className="text-slate-200">{userId}</strong>
					</p>
				</div>
			)}
		</main>
	);
}

export default function Page() {
	return (
		<BameProvider bame={bame} userId="Alice">
			<GameLobbyAndTable />
		</BameProvider>
	);
}
