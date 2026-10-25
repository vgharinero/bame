# @bame/ui-react

**React Provider, hooks, and customizable headless UI components for [Bame](../../README.md) turn-based games.**

`@bame/ui-react` works seamlessly with both:
- **In-Browser Runtime (`createBame`)** for Singleplayer and Local Hotseat Multiplayer games.
- **Remote Authoritative Server Client (`createBameClient`)** for Online Multiplayer games where secret state and RNG stay on the server.

---

## Installation

```bash
pnpm add @bame/core @bame/ui-react react
```

---

## 1. Provide the Bame Runtime (`<BameProvider>`)

### Option A: Local In-Browser Game (Singleplayer or Hotseat)
```tsx
import { createBame } from '@bame/core';
import { BameProvider } from '@bame/ui-react';
import { ticTacToe } from './game';

const bame = createBame({ games: [ticTacToe] });

export default function App() {
	return (
		<BameProvider bame={bame} userId="Alice">
			<GameScreen />
		</BameProvider>
	);
}
```

### Option B: Online Server Multiplayer Game (Guest Mode or With Auth)
```tsx
import { createBameClient } from '@bame/core';
import { BameProvider } from '@bame/ui-react';

// Connects to createBameHandler(serverBame) at /api/bame
const bameClient = createBameClient({ url: '/api/bame' });

export default function App({ session }: { session?: { id: string; name: string; avatar: string } }) {
	return (
		// If `userId` is omitted, <BameProvider> automatically generates & persists a guest ID in localStorage!
		// If `userId` and `profile` are passed from your Auth system (Clerk, NextAuth, Supabase), it syncs them automatically!
		<BameProvider
			bame={bameClient}
			userId={session?.id}
			profile={session ? { displayName: session.name, avatarUrl: session.avatar } : undefined}
			persist="local" // 'local' (default) | 'session' | false
		>
			<OnlineLobbyAndGame />
		</BameProvider>
	);
}
```

---

## 2. Hooks Reference

### `useLocalMatch(game, options?)`
Turnkey hook for **Singleplayer** and **Local Hotseat Multiplayer** games. Automatically creates a local lobby, joins all `players`, starts/restarts the match, and optionally switches the active seat in `<BameProvider>` on each turn (`autoSwitchSeat`):

```tsx
const {
	matchId,        // string | null
	state,          // TView | null
	turn,           // TurnState | null
	status,         // 'active' | 'finished' | null
	result,         // GameResult | undefined
	isMyTurn,       // boolean
	moves,          // Typed proxy: e.g. await moves.place(0)
	canMove,        // Dry-run check: e.g. canMove('place', 0) -> boolean
	undo,           // () => Promise<MoveResult>
	forfeit,        // () => Promise<MoveResult>
	startMatch,     // () => Promise<Match | null>
	restart,        // Alias for startMatch
} = useLocalMatch(ticTacToe, {
	players: ['Alice', 'Bob'], // Omit for 1-player solo games
	autoStart: true,           // Set to false to show a start button before starting
	autoSwitchSeat: true,      // Auto-advance BameProvider userId to turn.currentPlayerId
});
```

### `useMatch(game, matchId, optionsOrUserId?)`
Subscribes to a live `MatchView` (local or online) and returns a fully typed `moves` proxy inferred directly from `game`:

```tsx
const {
	view,           // MatchView<TView> | null
	state,          // TView | null
	turn,           // TurnState | null
	status,         // 'active' | 'finished' | null
	result,         // GameResult | undefined
	isMyTurn,       // boolean (status === 'active' && turn.currentPlayerId === activeUserId)
	isWaitingForMe, // boolean (true when it's your turn OR `turn.waitingFor` includes you during an interrupt!)
	loading,        // boolean
	acting,         // boolean (true while a move/undo/forfeit RPC is in flight)
	error,          // Last invalid() move message or network error
	moves,          // Typed proxy: e.g. await moves.place(0) or await moves.choose('rock')
	canMove,        // Dry-run check: e.g. canMove('place', 0) -> boolean
	undo,           // () => Promise<MoveResult> (when turn.allowUndo: true)
	forfeit,        // () => Promise<MoveResult> (resign/forfeit active match)
} = useMatch(rockPaperScissors, matchId);
```

### `useLobby(controlledLobbyId?)`
Subscribes to a lobby's realtime state (controlled or uncontrolled) and provides helpers to create, join by ID or 6-letter join code, toggle ready, leave, or start the match:

```tsx
const {
	lobby,          // Current Lobby object (or null)
	lobbyId,        // string | null
	matchId,        // string | null (populated once lobby.status === 'started')
	isHost,         // boolean
	isReady,        // boolean
	canStart,       // boolean
	loading,        // boolean
	acting,         // boolean
	error,          // string | null
	create,         // ({ game, config, isPrivate }) => Promise<Lobby>
	join,           // (targetLobbyId?) => Promise<Lobby | null>
	joinByCode,     // (code: string) => Promise<Lobby>
	setReady,       // (ready: boolean) => Promise<Lobby | null>
	leave,          // () => Promise<Lobby | null>
	start,          // () => Promise<Match | null>
	reset,          // () => void
} = useLobby();
```

### `useMatchesList(filter?)`
Fetches a player's active or finished matches (ideal for multi-day async game dashboards):

```tsx
const {
	matches,        // MatchView<TView>[]
	loading,
	error,
	refresh,        // () => Promise<MatchView<TView>[]>
} = useMatchesList({ status: 'active' });
```

### `useNotifications(optionsOrUserId?)`
Subscribes to real-time in-game notifications (both custom `ctx.notify(...)` events and automatic `'your_turn'` alerts), with optional native Browser Desktop Notifications (`window.Notification`) and document tab title badges:

```tsx
const {
	notifications,      // GameNotification<TData>[]
	latest,             // GameNotification<TData> | null
	dismiss,            // (id: string) => void
	clear,              // () => void
	requestPermission,  // () => Promise<NotificationPermission | 'unsupported'>
} = useNotifications({
	browserNotifications: true, // Pops native OS/Browser notifications!
	updateDocumentTitle: true,  // Updates tab title to "(1) ..."
});
```

### `useProfile(targetUserId?)` & `useLeaderboard()`
Fetches and subscribes to a player's profile (`displayName`, `avatarUrl`, `stats`, and per-game `statsByGame`) or lists the top profiles:

```tsx
const { profile, stats, loading, updateProfile } = useProfile();
const { profiles, refresh } = useLeaderboard();
```

---

## 3. Customizable Headless UI Components

All UI components are **unstyled by default**, expose semantic `data-*` attributes for Tailwind (`data-[active=true]:...`) or CSS styling, and support render-prop escape hatches.

### `<LobbyGate.*>` (Compound Online Lobby Flow)
Manages the entire Create/Join Lobby $\to$ Waiting Room $\to$ Active Match flow declaratively:

```tsx
import { LobbyGate } from '@bame/ui-react';

<LobbyGate.Root game={rockPaperScissors}>
	<LobbyGate.Idle>
		<LobbyGate.CreateButton isPrivate>Create Private Lobby</LobbyGate.CreateButton>
		<LobbyGate.JoinByCodeForm />
		<LobbyGate.Error />
	</LobbyGate.Idle>

	<LobbyGate.WaitingRoom>
		<LobbyGate.CodeBadge />
		<LobbyGate.MemberSummary />
		<LobbyGate.StartButton>Start Online Match</LobbyGate.StartButton>
	</LobbyGate.WaitingRoom>

	<LobbyGate.Match>
		{({ matchId, leave }) => <MatchArena matchId={matchId} onLeave={leave} />}
	</LobbyGate.Match>
</LobbyGate.Root>
```

### `<PlayerStats />`
Renders a player's display name and W/L/D stats (global or per-game via `game={myGame}`):
```tsx
<PlayerStats
	userId="Alice"
	game={ticTacToe}
	fields={['wins', 'losses', 'draws']}
	statClassNames={{ wins: 'text-emerald-400', losses: 'text-rose-400' }}
/>
```

### `<SeatSwitcher />` & `<PassAndPlayGuard />`
Switch active seats in local hot-seat games or hide the board between turns so players don't see each other's secret hands:
```tsx
<SeatSwitcher
	players={['Alice', 'Bob']}
	label="Active Seat:"
	buttonClassName="px-3 py-1 data-[active=true]:bg-indigo-600 data-[active=true]:text-white"
/>

<PassAndPlayGuard currentPlayerId={turn.currentPlayerId}>
	<SecretHandBoard />
</PassAndPlayGuard>
```

### `<MatchResult />`
Renders the winner or draw banner and a rematch/leave button when `status === 'finished'`:
```tsx
<MatchResult
	status={status}
	result={result}
	actionLabel="Play Again"
	onAction={restart}
/>
```

---

## License

[MIT](../../LICENSE)
