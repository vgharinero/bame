# Nim (15 Sticks) — Console Local Multiplayer Example

**Play Mode:** Local Multiplayer (2-Player Pass-and-Play / Hotseat)  
**UI Adapter:** [`@bame/ui-console`](../../packages/ui/console)

A playable 2-player terminal game demonstrating how to build a **local pass-and-play multiplayer** game with automatic round-robin turn rotation, move validation (`invalid()`), and custom match configuration (`config`).

---

## Game Rules

1. The game starts with **15 sticks** on the table.
2. Players (**Alice** and **Bob**) alternate turns in the same terminal.
3. On your turn, you must take **1, 2, or 3 sticks** (up to the number of remaining sticks).
4. Whoever takes the **very last stick** wins the match!

---

## How to Play

From the repository root:

```bash
pnpm example:nim
```

Or from inside this folder (`examples/nim`):

```bash
pnpm play
```

---

## Code Structure

- **[`src/game.ts`](./src/game.ts)** — Pure game definition using extracted top-level functions:
  - `setup`: Initializes `{ sticks: config?.sticks ?? 15 }`.
  - `take`: Validates that `count` is `1`, `2`, or `3` and `<= state.sticks` (returning `invalid(...)` otherwise), then subtracts `count` from `state.sticks`.
  - `endIf`: Declares the current player the winner when `state.sticks === 0`.
- **[`src/play.ts`](./src/play.ts)** — Terminal UI runner using `runConsoleGame` from `@bame/ui-console` with `players: ['alice', 'bob']`.
