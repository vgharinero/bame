# @bame/ui-console

**Interactive terminal UI adapter for [Bame](../../README.md) turn-based games.**

`@bame/ui-console` turns any `defineGame` definition into an interactive command-line game supporting:
1. **Singleplayer** (`mode: 'local'`, `players: ['you']`)
2. **Local Pass-and-Play Multiplayer** (`mode: 'local'`, `players: ['alice', 'bob']`, `passAndPlay: true`)
3. **Online Authoritative Server Multiplayer** (`mode: 'online'` with public lobbies, private 6-letter join codes, and live SSE turn updates across terminals)

---

## Installation

```bash
pnpm add @bame/core @bame/ui-console
```

---

## 1. Local Mode (Singleplayer or Pass-and-Play)

In `'local'` mode (the default), `runConsoleGame` creates an in-process match and prompts the active player on each turn:

```ts
import { runConsoleGame } from '@bame/ui-console';
import { nim } from './game';

await runConsoleGame({
	game: nim,
	players: ['alice', 'bob'], // Pass 1 player for singleplayer, or 2+ for pass-and-play
	render: (view, { print }) => {
		print(`\n  Sticks remaining: ${'| '.repeat(view.state.sticks)}(${view.state.sticks})\n`);
	},
	onTurn: async ({ playerId, ask, move }) => {
		const raw = await ask(`[${playerId}] Take 1, 2, or 3 sticks: `);
		await move('take', Number(raw));
	},
});
```

---

## 2. Online Server Mode (Multi-Terminal Multiplayer)

Connect multiple terminals to a Bame server (`listenBameServer` or `createBameHandler`) using `createBameClient` and `mode: 'online'`:

```ts
import { createBameClient } from '@bame/core';
import { runConsoleGame } from '@bame/ui-console';
import { highCard } from './game';

const client = createBameClient({ url: 'http://localhost:4000/api/bame' });

await runConsoleGame({
	game: highCard,
	mode: 'online',
	bame: client,
	render: (view, { print }) => {
		print(`Your secret card: ${view.state.cards[view.playerId ?? '']}`);
	},
	onTurn: async ({ playerId, ask, move }) => {
		const raw = await ask(`[${playerId}] (1) Reveal or (2) Redraw: `);
		if (raw === '2') {
			await move('redraw');
		} else {
			await move('reveal');
		}
	},
});
```

### What `mode: 'online'` Handles Automatically:
1. Prompts the user for their **Player Name** and ensures their profile exists.
2. Displays an interactive lobby menu:
   - **1) Create a new Lobby (Host)** (prints a 6-character join code like `K7M9P2` to share with friends)
   - **2) Join a Lobby by 6-letter Code**
   - **3) Join an Open Public Lobby**
3. Waits in real time for opponents to join and automatically starts the match when enough players join.
4. Subscribes to the player's private `MatchView` stream—only prompting for input when `view.turn.currentPlayerId === myUserId` and showing `"Waiting for <opponent> to make a move..."` otherwise.
5. Prints a session **Player Leaderboard** (Wins, Losses, Draws, Total Games) when the match concludes.

---

## License

[MIT](../../LICENSE)
