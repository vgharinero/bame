# High Card Showdown — Console Online Server Multiplayer Example

**Play Mode:** Online Authoritative Server Multiplayer (Multi-Terminal)  
**UI Adapter:** [`@bame/ui-console`](../../packages/ui/console) (`mode: 'online'`)  
**Storage / Server Adapter:** [`@bame/storage-local`](../../packages/storage/local) (`localFileStorage` + `listenBameServer`)

A playable multi-terminal card game demonstrating **authoritative online multiplayer** where each player holds a **secret card** that their opponent cannot see until both players reveal.

---

## Game Rules

1. Both players are dealt a **secret card** (`1` to `13`) from a shuffled deck on the server.
2. Each terminal only receives its own card via `view({ state, playerId })`—your opponent's unrevealed card and the deck stay hidden on the server.
3. On your turn, you can either:
   - **(1) Reveal** your card and lock it in, or
   - **(2) Redraw** a new card from the deck (allowed **at most once** per match).
4. Once both players have revealed their cards, the higher card wins!

---

## How to Play (2 Terminals)

### Step 1: Start the Authoritative Game Server (Terminal 1)
From the repository root:
```bash
pnpm example:high-card:server
```
*(Listens on `http://localhost:4000/api/bame` and persists state to `.bame-high-card.json`.)*

### Step 2: Launch Player 1 & Create a Lobby (Terminal 2)
```bash
pnpm example:high-card:play
```
Enter your name (e.g. `alice`) and choose **1) Create Public Lobby** or **2) Create Private Lobby (with 6-letter code)**.

### Step 3: Launch Player 2 & Join (Terminal 3)
```bash
pnpm example:high-card:play
```
Enter your name (e.g. `bob`) and choose **3) Join Lobby** (either by selecting the public lobby or typing the 6-letter private code). The match starts automatically!

---

## Code Structure

- **[`src/game.ts`](./src/game.ts)** — Pure game definition (`setup`, `redraw`, `reveal`, `view`, `endIf`). Notice how `view` filters `state.cards` so a player only sees their own card until `state.revealed[opponentId]` is `true`.
- **[`src/server.ts`](./src/server.ts)** — Starts the authoritative Node HTTP server using `listenBameServer` and `localFileStorage` from `@bame/storage-local`.
- **[`src/play.ts`](./src/play.ts)** — Connects to the server with `createBameClient` and runs `runConsoleGame` in `mode: 'online'`.
