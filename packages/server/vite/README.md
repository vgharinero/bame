# @bame/server-vite

**Vite dev and preview middleware adapter for [Bame](../../README.md).**

`@bame/server-vite` mounts a Bame Web Fetch handler at `/api/bame` (or a custom path) inside both Vite dev (`ssrLoadModule`) and `vite preview` (`runnerImport`), using [`createBameNodeHandler`](../node/README.md) with `trustProxy: true` by default.

---

## Installation

```bash
pnpm add @bame/core @bame/server-vite
```

---

## Usage (`vite.config.ts`)

```ts
import { bameVitePlugin } from '@bame/server-vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		react(),
		bameVitePlugin({
			// Defaults:
			// entry: '/src/server/handler.ts',
			// exportName: 'buildBameHandler',
			// path: '/api/bame',
			// trustProxy: true,
		}),
	],
});
```

Your server entry module exports `buildBameHandler()` returning `{ fetch(request: Request): Response | Promise<Response> }` (e.g., from `createBameHandler`).

---

## License

[MIT](../../LICENSE)
