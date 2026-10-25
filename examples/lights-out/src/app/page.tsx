'use client';

import { createBame } from '@bame/core';
import {
	BameProvider,
	MatchResult,
	PlayerStats,
	useLocalMatch,
} from '@bame/ui-react';
import { lightsOut } from '../game';

const bame = createBame({
	games: [lightsOut],
});

function SingleplayerContainer() {
	const { state, status, result, moves, undo, restart } =
		useLocalMatch(lightsOut);

	return (
		<main className="mx-auto flex max-w-xl flex-col items-center gap-8 px-4 py-12">
			<header className="text-center">
				<h1 className="text-3xl font-bold text-white">Lights Out (Solo)</h1>
				<p className="mt-1 text-sm text-slate-400">
					Turn off all the lights! Clicking a tile toggles it and its adjacent
					neighbors.
				</p>
			</header>

			<PlayerStats
				fields={['wins']}
				labels={{ wins: 'Puzzles Solved:' }}
				namePrefix="Player: "
				separator="|"
				className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs text-slate-300"
				nameClassName="font-bold text-white"
				statClassNames={{ wins: 'font-bold text-emerald-400' }}
			/>

			{!state ? (
				<div className="text-slate-400">Loading puzzle...</div>
			) : (
				<div className="flex flex-col items-center gap-6">
					<div className="flex items-center gap-4 text-sm text-slate-300">
						<span>
							Moves taken:{' '}
							<strong className="text-amber-400">{state.movesCount}</strong>
						</span>
						{status === 'active' && state.movesCount > 0 && (
							<button
								type="button"
								onClick={() => undo()}
								className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-200 hover:border-amber-400"
							>
								Undo Move
							</button>
						)}
					</div>

					<div className="grid grid-cols-3 gap-3">
						{state.grid.map((isOn, idx) => (
							<button
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed 9-tile grid
								key={idx}
								type="button"
								disabled={status !== 'active'}
								onClick={() => moves.toggle(idx)}
								className={`h-24 w-24 rounded-xl border transition ${
									isOn
										? 'border-amber-300 bg-amber-400 shadow-lg shadow-amber-500/30'
										: 'border-slate-800 bg-slate-900 hover:border-slate-700'
								}`}
							/>
						))}
					</div>

					<MatchResult
						status={status}
						result={result}
						formatWinner={() => `Puzzle Solved in ${state.movesCount} moves!`}
						actionLabel="New Puzzle"
						onAction={restart}
						className="flex flex-col items-center gap-3"
						titleClassName="text-xl font-bold text-emerald-400"
						buttonClassName="rounded-lg bg-amber-500 px-5 py-2 font-semibold text-slate-950 hover:bg-amber-400"
					/>
				</div>
			)}
		</main>
	);
}

export default function Page() {
	return (
		<BameProvider bame={bame} userId="SoloPlayer">
			<SingleplayerContainer />
		</BameProvider>
	);
}
