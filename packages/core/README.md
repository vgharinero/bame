# @bame/core

**Zero-dependency, type-safe turn-based game engine with lobbies, player profiles, secret state projection, deterministic RNG, and authoritative HTTP + SSE transport.**

`@bame/core` uses only standard Web APIs (`crypto`, `fetch`, `Request`, `Response`, `ReadableStream`) and has **0 runtime dependencies** and **0 `node:*` imports**—meaning your game definitions run identically in Browsers, Node.js, Next.js App Router, Cloudflare Workers, Bun, and Deno.

---

## Installation

```bash
pnpm add @bame/core
# or
npm install @bame/core
```

---

## 1. Define a Game (`defineGame`)

Write your game rules as named, pure TypeScript functions and pass them to `defineGame`:

```ts
import {
	defineGame,
	invalid,
	keepTurn,
	type EndIfContext,
	type MoveContext,
	type SetupContext,
	type ViewContext,
} from '@bame/core';

export interface GuessState {
	secret: number;
	guesses: number[];
	hint: 'higher' | 'lower' | 'correct' | null;
}

export type GuessView = Omit<GuessState, 'secret'>;

function setup({ random }: SetupContext): GuessState {
	return {
		secret: random.int(1, 20), // Deterministic seeded RNG
		guesses: [],
		hint: null,
	};
}

function guess({ state }: MoveContext<GuessState>, value: number) {
	if (!Number.isInteger(value) || value < 1 || value > 20) {
		return invalid('Enter a whole number between 1 and 20');
	}
	state.guesses.push(value);
	if (value === state.secret) {
		state.hint = 'correct';
		return;
	}
	state.hint = value < state.secret ? 'higher' : 'lower';
	return keepTurn(); // Keep the turn on the current player
}

// Project state per player so secrets never leak to clients
function view({ state }: ViewContext<GuessState>): GuessView {
	return {
		guesses: state.guesses,
		hint: state.hint,
	};
}

function endIf({ state, player }: EndIfContext<GuessState>) {
	if (state.hint === 'correct') return { winner: player.id };
	if (state.guesses.length >= 5) return { winner: null };
	return undefined;
}

export const guessNumber = defineGame({
	name: 'guess-number',
	players: 1, // Number (e.g. 1 or 2) or range ({ min: 2, max: 4 })
	setup,
	moves: { guess },
	view,
	endIf,
});
```

### Turn Control & Advanced Board Game Features
- **Default behavior:** After any valid move by the active player, the turn advances clockwise to the next player (`turn.number` increments).
- **`keepTurn()` (`ctx.keepTurn()` or `return keepTurn()`)**: Keep the turn on the current player (for multi-action turns like Risk `reinforce` $\to$ `attack` $\to$ `fortify`, Catan building/trading, or singleplayer puzzles).
- **`endTurn(nextPlayerId?)` (`ctx.endTurn(nextPlayerId)` or `return endTurn(nextPlayerId)`)**: Explicitly advance the turn, optionally jumping directly to `nextPlayerId` (unlocking Catan's snake-draft initial placement $1 \to 2 \to 3 \to 3 \to 2 \to 1$, UNO Reverse/Skip, and time-track turn orders).
- **Out-of-Turn & Simultaneous Moves (`turn: { allowOutOfTurn }`)**:
  - `turn: { allowOutOfTurn: true }` — Any player can make any move at any time (simultaneous games like *Rock-Paper-Scissors*, *7 Wonders*, *Diplomacy*).
  - `turn: { allowOutOfTurn: ['acceptTrade', 'discardCards'] }` — Specific moves can be called by non-active players during another player's turn (e.g. accepting a Catan market offer or discarding cards when a `7` is rolled), while keeping the turn on the active player!
- **In-Game Notifications (`ctx.notify`) & Multi-Day Async Play (`matches.list`, `hooks`)**:
  - Call `ctx.notify({ to: 'opponents', type: 'trade_offer', message: '...' })` inside any move to broadcast real-time notifications (`bame.matches.subscribeNotifications(userId, cb)`).
  - Query a returning player's active multi-day matches via `await bame.matches.list({ userId: 'alice', status: 'active' })`.
  - Pass `hooks: { onMove, onNotify }` to `createBame({ ... })` on your server to trigger emails, web push notifications, or webhooks when a player's turn begins or a market offer is proposed.
- **`invalid(reason)` (`ctx.invalid(reason)` or `return invalid(reason)`)**: Reject an illegal move with a human-readable error message without mutating state or advancing the turn.

### Structured errors

Rules and validators can return language-independent error codes and JSON parameters:

```ts
return invalid({ code: 'NOT_ENOUGH_RESOURCES', params: { required: 3 } });
```

Failed move results carry `{ ok: false, error, code, params }`. `validateArgs` and
`validateConfig` accept the same structured input. Lobby/service exceptions use
`BameError`; HTTP clients preserve metadata on `BameTransportError`.
`getErrorDetails(error)` reads `{ code, params }` from either exceptions or results.
Render the code in the UI using your own copy; an optional `message` supplies a
fallback. Existing string errors and the `error` string field remain supported.

---

## 2. Test Your Game Headlessly (`@bame/core/testing`)

Use `simulate()` in Vitest or Jest to test your game rules synchronously without spinning up lobbies or servers:

```ts
import { simulate } from '@bame/core/testing';
import { guessNumber } from './game';

const match = simulate(guessNumber, {
	players: ['alice'],
	seed: 'fixed-test-seed',
});

// Full authoritative state is inspectable in tests
const secret = match.state.secret;

// Projected player view hides `secret`
const aliceView = match.view('alice');
console.log('secret' in aliceView.state); // false

match.move('alice', 'guess', secret);
console.log(match.status); // 'finished'
console.log(match.result); // { winner: 'alice' }
```

---

## 3. Run Locally with Lobbies, Matches & Profiles (`createBame`)

```ts
import { createBame, memoryRealtime, memoryStorage } from '@bame/core';
import { nim } from './game';

const bame = createBame({
	games: [nim],
	storage: memoryStorage(),   // Or localFileStorage / supabaseStorage / firestoreStorage
	realtime: memoryRealtime(), // Or supabaseRealtime
});

// 1. Create a public or private lobby (private lobbies generate a 6-char code)
const lobby = await bame.lobbies.create({
	userId: 'alice',
	game: 'nim',
	isPrivate: true,
});

// 2. Join by lobby ID (public) or 6-char code (private)
await bame.lobbies.joinByCode({ userId: 'bob', code: lobby.code! });

// 3. Start the match
const match = await bame.lobbies.start({ userId: 'alice', lobbyId: lobby.id });

// 4. Subscribe to player-specific realtime match views
const unsub = bame.matches.subscribe(match.id, 'bob', (view) => {
	console.log('Bob sees state:', view.state, 'Turn:', view.turn);
});

// 5. Submit moves
await bame.matches.move({
	userId: 'alice',
	matchId: match.id,
	move: 'take',
	args: [3],
});

// 6. Inspect player profiles (wins/losses/draws are recorded automatically when a match finishes)
const aliceProfile = await bame.profiles.get('alice');
console.log(aliceProfile?.stats);
```

---

## 4. Run an Authoritative Online Server (`createBameHandler` & `createBameClient`)

For online games with hidden information (cards, fog of war, simultaneous secret choices) or strict anti-cheat, run `bame` on a server and expose it via `createBameHandler(bame)`:

### Server (Next.js App Router `app/api/bame/route.ts` or Cloudflare Worker)
```ts
import { createBame, createBameHandler } from '@bame/core';
import { rockPaperScissors } from '@/game';

const serverBame = createBame({ games: [rockPaperScissors] });

// Exports GET (SSE realtime stream) and POST (JSON-RPC commands)
// Optional: pass `{ getUserId: async (req) => ... }` to verify session cookies or JWTs and prevent impersonation!
export const { GET, POST } = createBameHandler(serverBame, {
	getUserId: async (req) => {
		// Return the authenticated user's ID from your auth provider (or omit `getUserId` for open/guest play)
		return req.headers.get('x-user-id');
	},
});
```

*(For a standalone Node.js HTTP server, see `listenBameServer` in [`@bame/storage-local`](../storage/local/README.md)).*

### Client (Browser or Node.js Terminal)
```ts
import { createBameClient } from '@bame/core';

// Implements the exact same `BameRuntime` interface (`lobbies`, `matches`, `profiles`)!
const bameClient = createBameClient({ url: '/api/bame' });
```

**Security Guarantee:** `createBameHandler` never transmits `seed`, `rngState`, or raw `Match.state` over the wire. Every `matches.get`, `matches.move`, and SSE push is filtered through your game's `view({ state, playerId })` function for that specific player.

---

## 5. Writing a Custom Storage or Realtime Adapter

Implement the 5-method `Storage` interface for collections `'lobbies' | 'matches' | 'profiles'`:

```ts
import { VersionConflictError, type Storage } from '@bame/core';

export const myCustomStorage = (): Storage => ({
	async get(collection, id) { /* ... */ },
	async find(collection, filter) { /* ... */ },
	async create(collection, doc) { /* ... */ },
	async update(collection, doc, expectedVersion) {
		// Compare stored version with expectedVersion; throw new VersionConflictError(collection, doc.id, expectedVersion) on mismatch
	},
	async delete(collection, id) { /* ... */ },
});
```

---

## License

[MIT](../../LICENSE)
