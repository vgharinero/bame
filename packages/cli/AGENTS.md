# Bame — AI Agent Game Development Guide (`AGENTS.md`)

You are building a turn-based game using **Bame** (`@bame/core`, `@bame/ui-console`, `@bame/ui-react`, `@bame/storage-local`, `@bame/storage-supabase`, `@bame/storage-firestore`).
Follow every rule in this file strictly so the game compiles and runs with **zero TypeScript or runtime errors** on the first attempt.

---

## 1. The 6 Golden Rules (Read First)

1. **Always write `setup`, `moves`, `view`, and `endIf` as named top-level functions** with explicit context types (`SetupContext`, `MoveContext<State>`, `ViewContext<State>`, `EndIfContext<State>`) and pass them into `defineGame({ ... })`. Do not inline large anonymous functions inside `defineGame`.
2. **Never use `Math.random()` or `Date.now()` inside game logic.** Always use the deterministic `random` helper provided in `SetupContext` and `MoveContext`:
   - `random.int(min, max)` — inclusive integer in `[min, max]` (e.g. `random.int(1, 6)` for a 6-sided die)
   - `random.dice(count, sides = 6)` — rolls `count` dice and returns `number[]` (e.g. `random.dice(2, 6)` $\to$ `[4, 2]`)
   - `random.weighted([{ item, weight }, ...])` — picks an item proportionally by weight
   - `random.next()` — float in `[0, 1)`
   - `random.pick(array)` — picks one element from a non-empty array
   - `random.shuffle(array)` — returns a new shuffled copy of `array`
3. **Understand Turn Rotation (`keepTurn`, `endTurn(nextPlayerId?)`, and `allowOutOfTurn`):**
   - **By default**, every valid move by the active player advances the turn clockwise to the next player.
   - **Multi-step turns / phases (Risk, Catan, Singleplayer):** Call `keepTurn()` (or `return keepTurn()`) inside moves that should **not** pass the turn to the next player.
   - **Custom turn order (Catan snake draft, UNO Reverse/Skip):** Call `endTurn(nextPlayerId)` (or `return endTurn(nextPlayerId)`) to jump directly to a specific player.
   - **Simultaneous or Out-of-Turn Moves (Catan market trade responses, robber discards on a 7, Rock-Paper-Scissors, 7 Wonders):** Configure `turn: { allowOutOfTurn: true }` (all moves allowed by any player) or `turn: { allowOutOfTurn: ['acceptTrade', 'discardCards'] }` (specific moves allowed by non-active players during another player's turn).
4. **Never `throw new Error()` for illegal player moves.** Return `invalid('Clear message explaining why the move is illegal')` (or `ctx.invalid(...)`). Returning `invalid(...)` leaves state and turn unchanged and surfaces the message in `result.error` / `useMatch().error`.
5. **State Mutation:** Inside a move function, you may either **mutate `state` in place** (the engine clones state before running your move) and return `void` / `keepTurn()` / `endTurn()`, **or** return a new state object.
6. **Always verify complex games headlessly with `simulate()`** from `@bame/core/testing` before wiring the UI.

---

## 2. `@bame/core` Exact API & Types

```ts
import {
	defineGame,
	invalid,
	keepTurn,
	endTurn,
	createBame,
	createBameHandler,
	createBameClient,
	memoryStorage,
	memoryRealtime,
	type SetupContext,
	type MoveContext,
	type ViewContext,
	type EndIfContext,
	type GameResult,
} from '@bame/core';
```

### Context Signatures
- **`SetupContext<TConfig = unknown>`**:
  `{ players: PlayerRef[]; config: TConfig; random: GameRandom }` $\to$ returns `TState`
- **`MoveContext<TState, TConfig = unknown>`**:
  `{ state: TState; player: PlayerRef; players: PlayerRef[]; turn: TurnState; config: TConfig; random: GameRandom; keepTurn(): TurnDirective; endTurn(nextPlayerId?: string): TurnDirective; invalid(reason: string): InvalidMove; notify(notification: GameNotificationInput): void }`
- **`ViewContext<TState, TConfig = unknown>`**:
  `{ state: TState; playerId: string | null; players: PlayerRef[]; turn: TurnState; config: TConfig }` $\to$ returns `TView`
- **`EndIfContext<TState, TConfig = unknown>`**:
  `{ state: TState; player: PlayerRef; players: PlayerRef[]; turn: TurnState; config: TConfig }` $\to$ returns `GameResult | undefined`
  - Return `undefined` while the game is still active.
  - Return `{ winner: player.id, scores?: { ... }, reason?: '...' }` when a player wins.
  - Return `{ draw: true }` or `{ winner: null }` for a draw.

---

## 3. Advanced Board Game Patterns (Catan & Risk)

### A. Snake Draft, Out-of-Turn Market Trades, & Notifications (Catan Pattern)
```ts
export const catan = defineGame({
	name: 'catan',
	players: { min: 2, max: 6 },
	turn: {
		// Allow other players to accept trades or discard cards on a 7 during the active player's turn!
		allowOutOfTurn: ['acceptTrade', 'declineTrade', 'discardRobberCards'],
	},
	setup,
	moves: {
		placeInitialSettlement: ({ state, player, players, endTurn }, vertexId: string) => {
			// Snake draft: 0 -> 1 -> 2 -> 2 -> 1 -> 0
			// Compute nextPlayerId and pass it to endTurn(nextPlayerId):
			return endTurn(nextPlayerId);
		},
		proposeTrade: ({ state, player, keepTurn, notify }, give: string, want: string) => {
			state.activeTrade = { from: player.id, give, want };
			notify({
				to: 'opponents',
				type: 'trade_offer',
				message: `${player.id} offers 1 ${give} for 1 ${want}`,
				data: { give, want },
			});
			return keepTurn();
		},
		acceptTrade: ({ state, player, invalid }) => {
			if (!state.activeTrade) return invalid('No active trade offer');
			if (state.activeTrade.from === player.id) return invalid('Cannot accept your own offer');
			// Execute trade Swap...
			state.activeTrade = null;
			// Because this is an out-of-turn move, the turn automatically stays on the turn owner!
		},
	},
	view,
	endIf,
});
```

### B. Multi-Phase Strategy Turn (Risk Pattern: Reinforce $\to$ Attack $\to$ Fortify)
```ts
import {
	defineGame,
	invalid,
	keepTurn,
	type EndIfContext,
	type MoveContext,
	type SetupContext,
} from '@bame/core';

export type TurnPhase = 'reinforce' | 'attack' | 'fortify';

export interface Territory {
	id: string;
	name: string;
	owner: string;
	troops: number;
	neighbors: string[];
}

export interface RiskState {
	phase: TurnPhase;
	reinforcementsLeft: number;
	territories: Record<string, Territory>;
}

function setup({ players }: SetupContext): RiskState {
	const [p1, p2] = players;
	return {
		phase: 'reinforce',
		reinforcementsLeft: 3,
		territories: {
			alaska: { id: 'alaska', name: 'Alaska', owner: p1.id, troops: 3, neighbors: ['kamchatka', 'northwest'] },
			northwest: { id: 'northwest', name: 'Northwest Territory', owner: p1.id, troops: 2, neighbors: ['alaska', 'ontario'] },
			ontario: { id: 'ontario', name: 'Ontario', owner: p2.id, troops: 3, neighbors: ['northwest'] },
			kamchatka: { id: 'kamchatka', name: 'Kamchatka', owner: p2.id, troops: 2, neighbors: ['alaska'] },
		},
	};
}

function deploy({ state, player }: MoveContext<RiskState>, territoryId: string, count: number) {
	if (state.phase !== 'reinforce') return invalid('You can only deploy during the reinforce phase');
	const t = state.territories[territoryId];
	if (!t || t.owner !== player.id) return invalid('You do not own that territory');
	if (!Number.isInteger(count) || count < 1 || count > state.reinforcementsLeft) {
		return invalid(`Deploy between 1 and ${state.reinforcementsLeft} troops`);
	}
	t.troops += count;
	state.reinforcementsLeft -= count;
	if (state.reinforcementsLeft === 0) state.phase = 'attack';
	return keepTurn();
}

function attack({ state, player, random }: MoveContext<RiskState>, fromId: string, toId: string) {
	if (state.phase !== 'attack') return invalid('You can only attack during the attack phase');
	const from = state.territories[fromId];
	const to = state.territories[toId];
	if (!from || !to || from.owner !== player.id || to.owner === player.id) return invalid('Invalid territories');
	if (!from.neighbors.includes(toId) || from.troops < 2) return invalid('Cannot attack from this territory');

	const attackDice = Math.min(3, from.troops - 1);
	const defendDice = Math.min(2, to.troops);
	const aRolls = Array.from({ length: attackDice }, () => random.int(1, 6)).sort((a, b) => b - a);
	const dRolls = Array.from({ length: defendDice }, () => random.int(1, 6)).sort((a, b) => b - a);

	for (let i = 0; i < Math.min(aRolls.length, dRolls.length); i++) {
		if (aRolls[i] > dRolls[i]) to.troops -= 1;
		else from.troops -= 1;
	}
	if (to.troops <= 0) {
		to.owner = player.id;
		const moveIn = Math.min(attackDice, from.troops - 1);
		from.troops -= moveIn;
		to.troops = moveIn;
	}
	return keepTurn();
}

function endTurnPhase({ state, player, players }: MoveContext<RiskState>) {
	if (state.phase === 'reinforce' && state.reinforcementsLeft > 0) {
		return invalid('Deploy all reinforcements first');
	}
	const nextIdx = (players.findIndex((p) => p.id === player.id) + 1) % players.length;
	const nextPlayer = players[nextIdx];
	const owned = Object.values(state.territories).filter((t) => t.owner === nextPlayer.id).length;
	state.phase = 'reinforce';
	state.reinforcementsLeft = Math.max(3, Math.floor(owned / 3));
}

function endIf({ state }: EndIfContext<RiskState>) {
	const owners = new Set(Object.values(state.territories).map((t) => t.owner));
	if (owners.size === 1) return { winner: [...owners][0] };
	return undefined;
}

export const miniRisk = defineGame({
	name: 'mini-risk',
	players: { min: 2, max: 6 },
	setup,
	moves: { deploy, attack, endTurnPhase },
	endIf,
});
```

---

## 4. UI Adapter Recipes

### A. Terminal UI (`@bame/ui-console`)

```ts
import { runConsoleGame } from '@bame/ui-console';
import { myGame } from './game';

await runConsoleGame({
	game: myGame,
	mode: 'local', // 'local' (singleplayer / pass-and-play) OR 'online' (multi-terminal via createBameClient)
	players: ['alice', 'bob'], // Optional in 'local' mode
	render: (view, { print, style: c, box }) => {
		print(
			box(JSON.stringify(view.state, null, 2), {
				title: c.cyan(`Turn #${view.turn.number}`),
			}),
		);
	},
	onTurn: async ({ playerId, ask, move, style: c }) => {
		const raw = await ask(`${c.cyan('›')} [${c.bold(playerId)}] Enter move arg: `);
		await move('myMoveName', raw);
	},
});
```

### B. React UI (`@bame/ui-react`)

Prefer high-level lifecycle hooks (`useLocalMatch` for singleplayer/hotseat, `<LobbyGate.*>` for online lobbies) and customizable UI components (`<PlayerStats>`, `<SeatSwitcher>`, `<MatchResult>`, `<PassAndPlayGuard>`) instead of writing manual lobby/match setup boilerplate:

#### 1. Singleplayer or Local Hotseat React Game (`useLocalMatch` + UI Components)
```tsx
'use client';

import { createBame } from '@bame/core';
import {
	BameProvider,
	MatchResult,
	PassAndPlayGuard,
	PlayerStats,
	SeatSwitcher,
	useLocalMatch,
} from '@bame/ui-react';
import { myGame } from '../game';

const bame = createBame({ games: [myGame] });
const PLAYERS = ['alice', 'bob'] as const;

function LocalGameScreen() {
	const {
		state,
		turn,
		status,
		result,
		error,
		moves,
		canMove,
		undo,
		forfeit,
		restart,
	} = useLocalMatch(myGame, {
		players: PLAYERS,
		autoSwitchSeat: true, // Automatically updates active userId on turn change
	});

	if (!state || !turn) return <div>Loading match...</div>;

	return (
		<div>
			<SeatSwitcher
				players={PLAYERS}
				label="Active Seat:"
				buttonClassName="px-3 py-1 data-[active=true]:bg-indigo-600 data-[active=true]:text-white"
			/>
			<div>
				{PLAYERS.map((p) => (
					<PlayerStats key={p} userId={p} game={myGame} />
				))}
			</div>
			<PassAndPlayGuard currentPlayerId={turn.currentPlayerId}>
				<p>
					Active Player: {turn.currentPlayerId} (Turn #{turn.number})
				</p>
				{error && <p role="alert">{error}</p>}
				{status === 'active' ? (
					<>
						<button
							type="button"
							disabled={!canMove('myMoveName', 'arg1')}
							onClick={() => moves.myMoveName('arg1')}
						>
							Make Move
						</button>
						<button type="button" onClick={() => undo()}>
							Undo
						</button>
						<button type="button" onClick={() => forfeit()}>
							Forfeit
						</button>
					</>
				) : (
					<MatchResult
						status={status}
						result={result}
						actionLabel="Play Again"
						onAction={restart}
					/>
				)}
			</PassAndPlayGuard>
		</div>
	);
}

export default function Page() {
	return (
		<BameProvider bame={bame} userId="alice">
			<LocalGameScreen />
		</BameProvider>
	);
}
```

#### 2. Online Multiplayer React Game (`<LobbyGate.*>` + `useMatch`)
```tsx
'use client';

import { createBameClient } from '@bame/core';
import {
	BameProvider,
	LobbyGate,
	MatchResult,
	PlayerStats,
	useMatch,
} from '@bame/ui-react';
import { myGame } from '../game';

const bameClient = createBameClient({ url: '/api/bame' });

function OnlineMatchArena({
	matchId,
	onLeave,
}: {
	matchId: string;
	onLeave: () => void;
}) {
	const { state, turn, status, result, moves, canMove, error } = useMatch(
		myGame,
		matchId,
	);
	if (!state || !turn) return <div>Connecting...</div>;

	return (
		<div>
			{status === 'active' ? (
				<button
					type="button"
					disabled={!canMove('myMoveName', 'arg1')}
					onClick={() => moves.myMoveName('arg1')}
				>
					Make Move
				</button>
			) : (
				<MatchResult
					status={status}
					result={result}
					actionLabel="Back to Lobby"
					onAction={onLeave}
				/>
			)}
			{error && <p role="alert">{error}</p>}
		</div>
	);
}

export default function OnlinePage() {
	return (
		<BameProvider bame={bameClient} persist="local">
			<PlayerStats game={myGame} />
			<LobbyGate.Root game={myGame}>
				<LobbyGate.Idle>
					<LobbyGate.CreateButton isPrivate>
						Create Private Lobby
					</LobbyGate.CreateButton>
					<LobbyGate.JoinByCodeForm />
					<LobbyGate.Error />
				</LobbyGate.Idle>

				<LobbyGate.WaitingRoom>
					<LobbyGate.CodeBadge />
					<LobbyGate.MemberSummary />
					<LobbyGate.StartButton>Start Online Match</LobbyGate.StartButton>
				</LobbyGate.WaitingRoom>

				<LobbyGate.Match>
					{({ matchId, leave }) => (
						<OnlineMatchArena matchId={matchId} onLeave={leave} />
					)}
				</LobbyGate.Match>
			</LobbyGate.Root>
		</BameProvider>
	);
}
```

### C. Long-Running Async Matches, Interrupts (`waitFor`), Notifications & Auth
- **Pause a turn to wait on specific non-active players (e.g. Catan Robber discard or reaction cards):**
  Call `ctx.waitFor(['bob', 'charlie'])` (or `'opponents'` / `'all'`) inside a move, and call `ctx.waitFor(null)` once all responses are complete. Any player in `turn.waitingFor` is automatically permitted to act and `useMatch().isWaitingForMe` becomes `true`.
- **List active matches for a returning player:**
  `const matches = await bame.matches.list({ userId: 'alice', waitingForUserId: 'alice', status: 'active' });` (or `useMatchesList({ status: 'active' })` in React).
- **Subscribe to real-time in-game & native browser notifications:**
  `useNotifications({ browserNotifications: true, updateDocumentTitle: true })` in `@bame/ui-react` (or `bame.matches.subscribeNotifications('alice', cb)`).
- **Guest Persistence & Auth Integration (`<BameProvider>` & `createBameHandler`):**
  - Omit `userId` on `<BameProvider bame={bame} persist="local">` to auto-generate and persist a guest ID in `localStorage`, or pass `userId={session.user.id}` and `profile={{ displayName, avatarUrl }}` from your Auth provider.
  - On the server, pass `createBameHandler(serverBame, { getUserId: async (req) => ... })` to verify cookies/JWTs and block player impersonation.
- **Server push/email hooks (`createBame`):**
  `createBame({ games: [catan], hooks: { onMove: async (evt) => { ... }, onNotify: async (n) => { ... } } })`
