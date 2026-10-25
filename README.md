# Bame

**A lightweight, zero-dependency, type-safe game engine for singleplayer, local multiplayer, and online multiplayer turn-based games.**

Define your game's state, moves, secret views, and win conditions using pure TypeScript functions—and get turn rotation, deterministic seeded randomness, optimistic-concurrency lobbies/matches, player profiles & leaderboards, and authoritative server transport out of the box.

---

## Why Bame?

- **Pure, Readable Game Logic:** Write `setup`, `moves`, `view`, and `endIf` as regular top-level TypeScript functions and pass them to `defineGame({ ... })`.
- **Zero Dependencies in `@bame/core`:** Works anywhere standard Web APIs exist—Browsers, Node.js, Next.js App Router, Cloudflare Workers, Bun, and Deno.
- **Pay Only for What You Use:** Install only `@bame/core` and bring your own UI/storage, or pick from official **UI adapters** (`@bame/ui-console`, `@bame/ui-react`) and **Storage adapters** (`@bame/storage-local`, `@bame/storage-supabase`, `@bame/storage-firestore`).
- **True Hidden Information & Anti-Cheat:** Run an authoritative server in one line with `createBameHandler(bame)` or `listenBameServer(bame)` so secret cards, hidden moves, and the RNG seed never leave the server.
- **All 6 Combinations Supported Out of the Box:**
  - **Singleplayer** (`players: 1`)
  - **Local Multiplayer** (Pass-and-Play / Hotseat on one device)
  - **Online Server Multiplayer** (Multi-terminal or multi-browser-tab with public/private lobbies & 6-letter join codes)

---

## Quickstart

### Option A: Scaffold a New Game with the CLI

```bash
# Create an interactive terminal game
npx @bame/cli init my-terminal-game --template console

# Or create a Next.js + React game
npx @bame/cli init my-web-game --template react
```

### Option B: Install Packages Directly

```bash
# Core engine only (0 dependencies)
pnpm add @bame/core

# Optional UI adapters
pnpm add @bame/ui-console   # Interactive terminal runner
pnpm add @bame/ui-react     # React Provider, hooks & customizable UI components

# Optional Storage adapters
pnpm add @bame/storage-local      # Local JSON file persistence + standalone Node HTTP server
pnpm add @bame/storage-supabase   # Supabase Postgres + Realtime adapter
pnpm add @bame/storage-firestore  # Firebase Firestore transactional adapter
```

---

## Define a Game in ~25 Lines

```ts
import { defineGame, invalid, type EndIfContext, type MoveContext, type SetupContext } from '@bame/core';

export interface NimState {
	sticks: number;
}

export interface NimConfig {
	sticks?: number;
}

function setup({ config }: SetupContext<NimConfig>): NimState {
	return { sticks: config?.sticks ?? 15 };
}

function take({ state }: MoveContext<NimState>, count: number) {
	if (![1, 2, 3].includes(count) || count > state.sticks) {
		return invalid('Take 1, 2, or 3 sticks (up to remaining sticks)');
	}
	state.sticks -= count;
}

function endIf({ state, player }: EndIfContext<NimState>) {
	if (state.sticks === 0) {
		return { winner: player.id };
	}
	return undefined;
}

export const nim = defineGame({
	name: 'nim',
	players: 2,
	setup,
	moves: { take },
	endIf,
});
```

---

## Monorepo Architecture & Packages

```text
packages/
  core/                   -> @bame/core               (Engine, Lobbies, Matches, Profiles, HTTP+SSE Server/Client, Testing)
  cli/                    -> @bame/cli                (bame init <name> --template console | react)
  ui/
    console/              -> @bame/ui-console         (runConsoleGame for local & online terminal play)
    react/                -> @bame/ui-react           (BameProvider, hooks & customizable UI components)
  storage/
    local/                -> @bame/storage-local      (localFileStorage + listenBameServer)
    supabase/             -> @bame/storage-supabase   (supabaseStorage + supabaseRealtime)
    firestore/            -> @bame/storage-firestore  (firestoreStorage)
```

| Package | Description | Docs |
| :--- | :--- | :--- |
| [`@bame/core`](./packages/core) | Zero-dependency game engine (`defineGame`, `createBame`, `createBameHandler`, `createBameClient`, `simulate`) | [README](./packages/core/README.md) |
| [`@bame/cli`](./packages/cli) | Project scaffolder (`bame init <name> --template console \| react`) | [README](./packages/cli/README.md) |
| [`@bame/ui-console`](./packages/ui/console) | Terminal UI runner (`runConsoleGame` with `mode: 'local' \| 'online'`) | [README](./packages/ui/console/README.md) |
| [`@bame/ui-react`](./packages/ui/react) | React hooks (`useLocalMatch`, `useMatch`, `useLobby`) & customizable UI (`LobbyGate`, `PlayerStats`, `SeatSwitcher`, `MatchResult`) | [README](./packages/ui/react/README.md) |
| [`@bame/storage-local`](./packages/storage/local) | Local JSON file storage (`localFileStorage`) & Node HTTP server (`listenBameServer`) | [README](./packages/storage/local/README.md) |
| [`@bame/storage-supabase`](./packages/storage/supabase) | Supabase Postgres + Realtime adapter with optimistic concurrency | [README](./packages/storage/supabase/README.md) |
| [`@bame/storage-firestore`](./packages/storage/firestore) | Firebase Firestore transactional storage adapter | [README](./packages/storage/firestore/README.md) |

---

## Playable Example Games (`examples/`)

Every example in [`examples/`](./examples) is a **real, playable game** demonstrating one combination of **Play Mode × UI Adapter**:

| Play Mode | Console UI (`@bame/ui-console`) | React UI (`@bame/ui-react`) |
| :--- | :--- | :--- |
| **1. Singleplayer** | [**Guess the Number**](./examples/guess-number)<br>`pnpm example:guess-number` | [**Lights Out (3×3)**](./examples/lights-out)<br>`pnpm example:lights-out` |
| **2. Local Multiplayer (Hotseat)** | [**Nim (15 Sticks)**](./examples/nim)<br>`pnpm example:nim` | [**Tic-Tac-Toe**](./examples/tic-tac-toe)<br>`pnpm example:tic-tac-toe` |
| **3. Online Authoritative Server** | [**High Card Showdown**](./examples/high-card)<br>Server: `pnpm example:high-card:server`<br>Clients: `pnpm example:high-card:play` | [**Rock Paper Scissors**](./examples/rock-paper-scissors)<br>`pnpm example:rps` *(open in 2 browser tabs)* |

---

## Running, Testing & Contributing

### Prerequisites
- **Node.js** $\ge 20$ (tested on Node v24)
- **pnpm** $\ge 9$

### Setup & Build
```bash
# 1. Install dependencies across all workspace packages and examples
pnpm install

# 2. Build all @bame/* packages
pnpm build
```

### Run Unit & Integration Tests
All game engine rules, deterministic RNG/clocks, storage adapters, authoritative server/client RPC + SSE streams, and all 6 example game definitions are tested via **Vitest**:

```bash
# Run the full test suite once
pnpm test

# Run tests in interactive watch mode
pnpm test:watch
```

### Typecheck & Lint
```bash
# Typecheck all packages and examples
pnpm typecheck

# Run Biome formatter & linter check
pnpm check

# Auto-fix formatting and lint issues
pnpm check:fix
```

---

## Building Games with AI Agents (`AGENTS.md`)

Bame includes a comprehensive AI Agent guide in **[`packages/cli/AGENTS.md`](./packages/cli/AGENTS.md)** (also generated automatically in your project root when you run `npx @bame/cli init`).
- **In AI IDEs (Gemini / Antigravity, Cursor, Windsurf, Copilot, Claude Code):** The agent reads `AGENTS.md` automatically.
- **In Web Chat (Gemini, ChatGPT, Claude):** Upload [`packages/cli/AGENTS.md`](./packages/cli/AGENTS.md) and ask: *"Using this Bame guide, build me a playable ----- game in React."*

---

## License

[MIT](./LICENSE) © [Víctor Granados (@vgharinero)](https://github.com/vgharinero)
