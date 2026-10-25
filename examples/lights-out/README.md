# Lights Out (3×3) — React Singleplayer Example

**Play Mode:** Singleplayer (`players: 1`)  
**UI Adapter:** [`@bame/ui-react`](../../packages/ui/react) (`BameProvider`, `useMatch`, `useProfile`)

A playable Next.js + React puzzle game demonstrating how to build a **singleplayer web game** with Bame where every puzzle board is guaranteed solvable using deterministic seeded RNG (`random.int`) and player win stats are tracked automatically via `useProfile`.

---

## Game Rules

1. The board is a **3×3 grid** of lights (`ON` or `OFF`).
2. Clicking any cell toggles **that cell** and its **orthogonal neighbors** (up, down, left, right).
3. Turn **all 9 lights OFF** in as few moves as possible to win!

---

## How to Play

From the repository root:

```bash
pnpm example:lights-out
```

Or from inside this folder (`examples/lights-out`):

```bash
pnpm dev
```

Then open [http://localhost:3001](http://localhost:3001) in your browser.

---

## Code Structure

- **[`src/game.ts`](./src/game.ts)** — Pure game definition using extracted top-level functions (`turn: { allowUndo: true }`):
  - `setup`: Generates a guaranteed-solvable 3×3 puzzle by starting from all-off and applying random toggles using `random.int(0, 8)`.
  - `toggle`: Flips the target cell and its neighbors, increments `movesCount`, and calls `keepTurn()`.
  - `endIf`: Finishes the match with `{ winner: player.id }` as soon as `state.grid.every((lit) => !lit)`.
- **[`src/app/page.tsx`](./src/app/page.tsx)** — Next.js Client Component using `<BameProvider>`, `useMatch` (including deterministic `undo()`), and `useProfile` from `@bame/ui-react`.
