# @bame/cli

**Official CLI project scaffolder for the [Bame](../../README.md) turn-based game engine.**

Quickly bootstrap a playable terminal game (`@bame/ui-console`) or a web game (`@bame/ui-react` + Next.js) in seconds.

---

## Usage

Run directly with `npx` or `pnpm dlx`:

```bash
# Scaffold an interactive terminal game (Console template)
npx @bame/cli init my-game --template console

# Scaffold a Next.js + React web game (React template)
npx @bame/cli init my-web-game --template react
```

### Options

| Flag / Argument | Description | Default |
| :--- | :--- | :--- |
| `<name>` | Target directory and package name for your new game project | *(Required)* |
| `-t, --template <type>` | Project template: `console` (`@bame/ui-console`) or `react` (`@bame/ui-react` + Next.js) | `console` |

---

## What Gets Generated?

### 1. `--template console`
Generates a starter terminal game project with:
- `src/game.ts` — Clean `defineGame` definition with extracted top-level functions (`setup`, `take`, `endIf`).
- `src/play.ts` — Interactive terminal runner powered by `runConsoleGame` from `@bame/ui-console`.
- `package.json` & `tsconfig.json` — Preconfigured with `pnpm play` and `pnpm typecheck` scripts.

### 2. `--template react`
Generates a Next.js App Router project with:
- `src/game.ts` — Clean `defineGame` definition.
- `src/app/page.tsx` — Playable React UI wired with `<BameProvider>`, `useMatch`, and `useProfile` from `@bame/ui-react`.
- `package.json` & `tsconfig.json` — Preconfigured with `pnpm dev`, `pnpm build`, and `pnpm typecheck`.

---

## License

[MIT](../../LICENSE)
