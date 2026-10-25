import { createBame, defineGame } from '@bame/core';
import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
	BameProvider,
	LobbyGate,
	MatchResult,
	PassAndPlayGuard,
	PlayerStats,
	SeatSwitcher,
	useBame,
	useLeaderboard,
	useLobby,
	useLobbyGate,
	useLocalMatch,
	useMatch,
	useMatchesList,
	useNotifications,
	useProfile,
} from './index';

const testGame = defineGame({
	name: 'test-game',
	players: 2,
	setup: () => ({ count: 0 }),
	moves: {
		inc: ({ state }) => {
			state.count += 1;
		},
	},
});

describe('@bame/ui-react exports and customizable UI components', () => {
	it('exports all hooks and customizable components', () => {
		expect(typeof BameProvider).toBe('function');
		expect(typeof useBame).toBe('function');
		expect(typeof useLobby).toBe('function');
		expect(typeof useLobbyGate).toBe('function');
		expect(typeof useMatch).toBe('function');
		expect(typeof useLocalMatch).toBe('function');
		expect(typeof useMatchesList).toBe('function');
		expect(typeof useNotifications).toBe('function');
		expect(typeof useProfile).toBe('function');
		expect(typeof useLeaderboard).toBe('function');
		expect(typeof PlayerStats).toBe('function');
		expect(typeof SeatSwitcher).toBe('function');
		expect(typeof MatchResult).toBe('function');
		expect(typeof PassAndPlayGuard).toBe('function');
		expect(typeof LobbyGate.Root).toBe('function');
		expect(typeof LobbyGate.Idle).toBe('function');
		expect(typeof LobbyGate.WaitingRoom).toBe('function');
		expect(typeof LobbyGate.Match).toBe('function');
	});

	it('renders MatchResult only when status === "finished" with win/draw data attributes and render prop', () => {
		const activeEl = MatchResult({
			status: 'active',
			result: { winner: 'Alice' },
		});
		expect(activeEl).toBeNull();

		const winEl = MatchResult({
			status: 'finished',
			result: { winner: 'Alice' },
			formatWinner: (w) => `Champion: ${w}`,
			actionLabel: 'Rematch',
			onAction: () => {},
			className: 'result-box',
		}) as ReactElement<Record<string, unknown>>;

		expect(isValidElement(winEl)).toBe(true);
		expect(winEl.props['data-bame-match-result']).toBe('');
		expect(winEl.props['data-outcome']).toBe('win');
		expect(winEl.props['data-winner']).toBe('Alice');
		expect(winEl.props.className).toBe('result-box');

		const drawEl = MatchResult({
			status: 'finished',
			result: { draw: true },
			drawText: 'Stalemate!',
		}) as ReactElement<Record<string, unknown>>;

		expect(drawEl.props['data-outcome']).toBe('draw');
		expect(drawEl.props['data-winner']).toBeUndefined();

		let renderPropArgs: unknown = null;
		MatchResult({
			status: 'finished',
			result: { winner: 'Bob' },
			children: (args) => {
				renderPropArgs = args;
				return <span>Custom</span>;
			},
		});
		expect(renderPropArgs).toEqual({
			outcome: 'win',
			winner: 'Bob',
			result: { winner: 'Bob' },
			onAction: undefined,
		});
	});

	it('creates valid BameProvider element with runtime and userId', () => {
		const bame = createBame({ games: [testGame] });
		const el = (
			<BameProvider bame={bame} userId="Alice">
				<div>Child</div>
			</BameProvider>
		);
		expect(isValidElement(el)).toBe(true);
	});
});
