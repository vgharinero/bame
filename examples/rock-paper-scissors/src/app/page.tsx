'use client';

import { createBameClient } from '@bame/core';
import {
	BameProvider,
	LobbyGate,
	MatchResult,
	PlayerStats,
	useBame,
	useMatch,
} from '@bame/ui-react';
import { useEffect, useState } from 'react';
import { type RpsChoice, rockPaperScissors } from '../game';

const bameClient = createBameClient({ url: '/api/bame' });

const CHOICES: Array<{ id: RpsChoice; label: string; emoji: string }> = [
	{ id: 'rock', label: 'Rock', emoji: '🪨' },
	{ id: 'paper', label: 'Paper', emoji: '📄' },
	{ id: 'scissors', label: 'Scissors', emoji: '✂️' },
];

function MatchArena({
	matchId,
	onLeave,
}: {
	matchId: string;
	onLeave: () => void;
}) {
	const { userId } = useBame();
	const { view, state, turn, status, result, moves, error } = useMatch(
		rockPaperScissors,
		matchId,
	);

	if (!view || !state || !turn) {
		return <div className="text-slate-400">Connecting to server match...</div>;
	}

	return (
		<div className="flex w-full max-w-lg flex-col items-center gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
			<div className="flex w-full justify-between text-sm">
				{view.players.map((p) => (
					<div
						key={p.id}
						className="flex flex-col items-center rounded-xl border border-slate-800 bg-slate-950 px-4 py-2"
					>
						<span className="font-semibold text-white">
							{p.id} {p.id === userId ? '(You)' : ''}
						</span>
						<span className="text-lg font-bold text-indigo-400">
							Score: {state.scores[p.id] ?? 0} / 2
						</span>
					</div>
				))}
			</div>

			{state.lastRound && (
				<div className="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-center text-xs text-slate-300">
					<p className="font-semibold text-slate-200">
						Round {state.lastRound.round} Reveal:
					</p>
					<p className="mt-1">
						{Object.entries(state.lastRound.choices)
							.map(([id, c]) => `${id}: ${c.toUpperCase()}`)
							.join(' vs. ')}
					</p>
					<p className="mt-1 text-emerald-400">
						{state.lastRound.winner === 'draw'
							? 'Round Draw!'
							: `${state.lastRound.winner} won the round!`}
					</p>
				</div>
			)}

			{status === 'active' ? (
				<>
					<p className="text-sm text-slate-300">
						Round <strong>{state.round}</strong> —{' '}
						{!state.myChoice ? (
							<span className="font-semibold text-emerald-400">
								Lock in your secret move!
								{state.chosenPlayerIds.length > 0
									? ' (Opponent has locked in!)'
									: ''}
							</span>
						) : (
							<span className="text-amber-400">
								You locked in <strong>{state.myChoice.toUpperCase()}</strong>.
								Waiting for opponent...
							</span>
						)}
					</p>

					<div className="grid grid-cols-3 gap-3">
						{CHOICES.map((c) => (
							<button
								key={c.id}
								type="button"
								disabled={Boolean(state.myChoice)}
								onClick={() => moves.choose(c.id)}
								className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-5 py-4 transition hover:border-indigo-500 disabled:opacity-40"
							>
								<span className="text-3xl">{c.emoji}</span>
								<span className="text-xs font-semibold">{c.label}</span>
							</button>
						))}
					</div>
				</>
			) : (
				<MatchResult
					status={status}
					result={result}
					formatWinner={(winner) => `🏆 ${winner} Wins Best of 3!`}
					drawText="Match Finished!"
					actionLabel="Back to Lobby"
					onAction={onLeave}
					className="flex flex-col items-center gap-3"
					titleClassName="text-2xl font-bold text-emerald-400"
					buttonClassName="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
				/>
			)}

			{error && <p className="text-xs text-rose-400">{error}</p>}
		</div>
	);
}

export default function Page() {
	const [userId, setUserId] = useState('Player-100');

	useEffect(() => {
		setUserId(`Player-${Math.floor(100 + Math.random() * 900)}`);
	}, []);

	return (
		<BameProvider bame={bameClient} userId={userId} onUserIdChange={setUserId}>
			<main className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-12">
				<header className="text-center">
					<h1 className="text-3xl font-bold text-white">
						Rock-Paper-Scissors (Online Server)
					</h1>
					<p className="mt-1 text-xs text-slate-400">
						Open this page in two browser tabs! Powered by{' '}
						<code className="text-indigo-400">createBameHandler</code> &{' '}
						<code className="text-indigo-400">createBameClient</code>.
					</p>
				</header>

				<div className="flex items-center gap-2 text-xs">
					<span className="text-slate-400">Your Tab Player ID:</span>
					<input
						type="text"
						value={userId}
						onChange={(e) => setUserId(e.target.value)}
						className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-white"
					/>
				</div>

				<div className="flex w-full max-w-md flex-col items-center gap-6">
					<PlayerStats
						fields={['wins', 'losses']}
						labels={{ wins: 'Wins:', losses: 'Losses:' }}
						namePrefix="Connected as "
						separator="|"
						className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs text-slate-300"
						nameClassName="font-bold text-white"
						statClassNames={{
							wins: 'font-bold text-emerald-400',
							losses: 'font-bold text-rose-400',
						}}
					/>

					<LobbyGate.Root game={rockPaperScissors}>
						<LobbyGate.Idle className="flex w-full flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
							<LobbyGate.CreateButton
								isPrivate
								className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-500"
							>
								Create Lobby (Get Join Code)
							</LobbyGate.CreateButton>

							<LobbyGate.JoinByCodeForm
								className="flex items-center gap-2"
								inputClassName="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white uppercase"
								buttonClassName="rounded-xl border border-indigo-500 px-4 py-2 text-sm font-semibold text-indigo-300 hover:bg-indigo-500/10"
							/>

							<LobbyGate.Error className="text-xs text-rose-400" />
						</LobbyGate.Idle>

						<LobbyGate.WaitingRoom className="flex w-full flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
							<p className="text-xs text-slate-400">
								Share this Join Code in a second browser tab:
							</p>
							<LobbyGate.CodeBadge className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-5 py-2 font-mono text-2xl font-bold tracking-widest text-indigo-300" />
							<LobbyGate.MemberSummary className="text-sm text-slate-300" />
							<LobbyGate.StartButton className="w-full rounded-xl bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-500">
								Start Online Match
							</LobbyGate.StartButton>
						</LobbyGate.WaitingRoom>

						<LobbyGate.Match>
							{({ matchId, leave }) => (
								<MatchArena matchId={matchId} onLeave={leave} />
							)}
						</LobbyGate.Match>
					</LobbyGate.Root>
				</div>
			</main>
		</BameProvider>
	);
}
