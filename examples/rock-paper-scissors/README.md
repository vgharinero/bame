# Rock Paper Scissors — React Online Server Multiplayer Example

**Play Mode:** Online Authoritative Server Multiplayer (Multi-Tab / Multi-Browser)  
**UI Adapter:** [`@bame/ui-react`](../../packages/ui/react) (`BameProvider`, `useLobby`, `useMatch`, `useProfile`)  
**Server Transport:** `createBameHandler` (Next.js App Router `/api/bame`) + `createBameClient`

A playable Next.js + React online multiplayer game demonstrating **public and private lobbies (with 6-letter join codes)**, **simultaneous secret moves** hidden on the server via `view()`, and **live Server-Sent Events (SSE)** updates across browser tabs.

---

## Game Rules

1. Two players connect from separate browser tabs/windows via a **Public Lobby** or a **Private 6-Letter Join Code**.
2. Each round, players lock in **Rock**, **Paper**, or **Scissors**.
3. When the first player locks in a choice, the second player's screen updates in real time to show **"Opponent has locked in!"**—*without* revealing what the opponent picked (`view` hides `currentChoices[opponentId]`).
4. As soon as the second player locks in, the server resolves the round, reveals both choices, and awards a point.
5. First player to **2 round wins** (Best of 3) wins the match!

---

## How to Play (2 Browser Tabs)

From the repository root:

```bash
pnpm example:rps
```

Or from inside this folder (`examples/rock-paper-scissors`):

```bash
pnpm dev
```

1. Open **Tab 1** at [http://localhost:3002](http://localhost:3002), enter a name (e.g. `Alice`), and click **Create Public Lobby** or **Create Private Lobby (Code)**.
2. Open **Tab 2** at [http://localhost:3002](http://localhost:3002), enter a different name (e.g. `Bob`), and join Alice's lobby from the public list or by entering the 6-character code.
3. Play Best-of-3 Rock Paper Scissors in real time!

---

## Code Structure

- **[`src/game.ts`](./src/game.ts)** — Pure game definition (`setup`, `choose`, `view`, `endIf`, with `turn: { allowOutOfTurn: true }` so either player can lock in first). `view` returns `myChoice` and `chosenPlayerIds` so a player never sees their opponent's choice until the round resolves.
- **[`src/app/api/bame/route.ts`](./src/app/api/bame/route.ts)** — Authoritative Next.js API route exposing `export const { GET, POST } = createBameHandler(serverBame)`.
- **[`src/app/page.tsx`](./src/app/page.tsx)** — Multi-tab React client using `createBameClient({ url: '/api/bame' })`, `<BameProvider persist="session">`, `useLobby`, `useMatch`, `useMatchesList` (to resume active matches after refreshing), `useNotifications` (with browser notifications & tab title badges), and `useProfile`.
