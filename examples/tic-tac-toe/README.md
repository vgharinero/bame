# Tic-Tac-Toe — React Local Multiplayer Example

**Play Mode:** Local Multiplayer (2-Player Hotseat on One Screen)  
**UI Adapter:** [`@bame/ui-react`](../../packages/ui/react) (`BameProvider`, `useMatch`, `useProfile`)

A playable Next.js + React game demonstrating **2-player local hotseat multiplayer** in the browser with automatic turn rotation, invalid move feedback, and live Player X vs. Player O win/loss/draw tracking.

---

## Game Rules

1. Two players (**Player X** and **Player O**) share the same browser screen.
2. Players alternate clicking an empty square on the 3×3 board.
3. The first player to align 3 marks horizontally, vertically, or diagonally wins! If all 9 squares are filled with no line of 3, the match ends in a draw.

---

## How to Play

From the repository root:

```bash
pnpm example:tic-tac-toe
```

Or from inside this folder (`examples/tic-tac-toe`):

```bash
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Code Structure

- **[`src/game.ts`](./src/game.ts)** — Pure game definition using extracted top-level functions (`setup`, `place`, `endIf`, with `turn: { allowUndo: true }`).
- **[`src/app/page.tsx`](./src/app/page.tsx)** — Next.js UI using `<BameProvider>`, `useMatch` (demonstrating `canMove('place', index)`, `undo()`, and `forfeit()`), and `useProfile` from `@bame/ui-react`.
