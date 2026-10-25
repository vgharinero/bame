export type TemplateType = 'console' | 'react';

export const GAME_TEMPLATE = `import {
	defineGame,
	invalid,
	type EndIfContext,
	type MoveContext,
	type SetupContext,
} from '@bame/core';

export interface GameState {
	sticks: number;
}

export interface GameConfig {
	sticks?: number;
}

function setup({ config }: SetupContext<GameConfig>): GameState {
	return { sticks: config?.sticks ?? 15 };
}

function take({ state }: MoveContext<GameState>, count: number) {
	if (![1, 2, 3].includes(count) || count > state.sticks) {
		return invalid('Take 1, 2, or 3 sticks (up to remaining sticks)');
	}
	state.sticks -= count;
}

function endIf({ state, player }: EndIfContext<GameState, GameConfig>) {
	if (state.sticks === 0) {
		return { winner: player.id };
	}
	return undefined;
}

export const game = defineGame({
	name: 'my-game',
	players: 2,
	setup,
	moves: { take },
	endIf,
});
`;

export const CONSOLE_PLAY_TEMPLATE = `import { runConsoleGame } from '@bame/ui-console';
import { game } from './game';

await runConsoleGame({
	game,
	players: ['alice', 'bob'],
	render: (view, { print }) => {
		const sticksVisual = '| '.repeat(view.state.sticks).trim() || '(none)';
		print(\`  Sticks remaining (\${view.state.sticks}): \${sticksVisual}\`);
	},
	onTurn: async ({ playerId, ask, move }) => {
		const raw = await ask(\`  [\${playerId}] Take 1, 2, or 3 sticks: \`);
		await move('take', Number(raw));
	},
});
`;

export const REACT_APP_TEMPLATE = `import { createBame } from '@bame/core';
import {
	BameProvider,
	MatchResult,
	PlayerStats,
	SeatSwitcher,
	useLocalMatch,
} from '@bame/ui-react';
import { game } from './game';

const bame = createBame({ games: [game] });
const PLAYERS = ['Alice', 'Bob'] as const;

function GameBoard() {
	const { state, turn, status, result, moves, canMove, error, restart } =
		useLocalMatch(game, { players: PLAYERS });

	if (!state || !turn) {
		return <div>Loading match...</div>;
	}

	return (
		<main>
			<h1>Nim (Take 1, 2, or 3 Sticks)</h1>
			<SeatSwitcher players={PLAYERS} label="Active Seat:" />
			<PlayerStats userId={turn.currentPlayerId} />

			<p>Sticks remaining: {state.sticks}</p>
			<p>Current Turn: {turn.currentPlayerId}</p>

			{error && <p role="alert">{error}</p>}

			{status === 'active' ? (
				<div>
					{[1, 2, 3].map((count) => (
						<button
							key={count}
							type="button"
							disabled={!canMove('take', count)}
							onClick={() => void moves.take(count)}
						>
							Take {count}
						</button>
					))}
				</div>
			) : (
				<MatchResult
					status={status}
					result={result}
					actionLabel="Play Again"
					onAction={() => void restart()}
				/>
			)}
		</main>
	);
}

export default function App() {
	return (
		<BameProvider bame={bame} userId={PLAYERS[0]}>
			<GameBoard />
		</BameProvider>
	);
}
`;

export const createTsconfigJson = (isReact: boolean) => ({
	compilerOptions: {
		target: 'ES2022',
		lib: isReact ? ['ES2022', 'DOM', 'DOM.Iterable'] : ['ES2022'],
		module: 'ESNext',
		moduleResolution: 'bundler',
		strict: true,
		skipLibCheck: true,
		noEmit: true,
		...(isReact ? { jsx: 'react-jsx' } : {}),
	},
	include: ['src'],
});

export const createPackageJson = (name: string, isReact: boolean) => ({
	name,
	version: '0.1.0',
	private: true,
	type: 'module',
	scripts: isReact
		? {
				typecheck: 'tsc --noEmit',
			}
		: {
				play: 'tsx src/play.ts',
				typecheck: 'tsc --noEmit',
			},
	dependencies: {
		'@bame/core': '^0.2.0',
		...(isReact
			? { '@bame/ui-react': '^0.2.0', react: '^19.0.0' }
			: { '@bame/ui-console': '^0.2.0' }),
	},
	devDependencies: {
		...(isReact ? { '@types/react': '^19.0.0' } : { tsx: '^4.19.0' }),
		typescript: '^5.0.0',
	},
});
