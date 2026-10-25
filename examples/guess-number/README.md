# Guess the Number — Console Singleplayer Example

**Play Mode:** Singleplayer (`players: 1`)  
**UI Adapter:** [`@bame/ui-console`](../../packages/ui/console)

A playable terminal game demonstrating how to build a **singleplayer** game with Bame using deterministic seeded randomness (`random.int`), secret state projection (`view`), and multi-step turns (`keepTurn()`).

---

## Game Rules

1. At the start of the match, the engine picks a secret number between **1** and **20** using Bame's deterministic RNG (`random.int(1, 20)`).
2. You have **5 attempts** to guess the secret number.
3. After each guess, the game tells you whether the secret is **HIGHER** or **LOWER** and keeps the turn on you (`keepTurn()`).
4. Guess the exact number within 5 attempts to win!

---

## How to Play

From the repository root:

```bash
pnpm example:guess-number
```

Or from inside this folder (`examples/guess-number`):

```bash
pnpm play
```

---

## Code Structure

- **[`src/game.ts`](./src/game.ts)** — Pure game definition using extracted top-level functions:
  - `setup`: Picks `secret: random.int(1, 20)`.
  - `guess`: Validates the guess, updates `hint: 'higher' | 'lower' | 'correct'`, and calls `keepTurn()`.
  - `view`: Strips `secret` from the player view (`Omit<GuessNumberState, 'secret'>`) so the player cannot see the answer before guessing.
  - `endIf`: Ends the match when `hint === 'correct'` (`winner: player.id`) or when `guesses.length >= maxAttempts` (`winner: null`).
- **[`src/play.ts`](./src/play.ts)** — Terminal UI runner using `runConsoleGame` from `@bame/ui-console`.
