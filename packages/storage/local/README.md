# @bame/storage-local

**Local JSON file storage adapter and standalone Node.js HTTP server for [Bame](../../README.md).**

`@bame/storage-local` provides storage and HTTP adapters for Node.js environments:
1. **`localFileStorage({ file })`** — Persists lobbies, matches, and player profiles to a local JSON file with atomic writes and optimistic concurrency checks (`VersionConflictError`).
2. **`listenBameServer(bame, options)`** — Spins up a standalone Node.js HTTP server (`node:http`) wrapping `createBameHandler(bame)` with CORS, JSON-RPC (`POST`), and Server-Sent Events (`GET`) streaming.
3. **`createBameNodeHandler(fetch, options)`** — Adapts a Fetch handler for an existing Node or Connect server.

---

## Installation

```bash
pnpm add @bame/core @bame/storage-local
```

---

## 1. Local JSON File Storage (`localFileStorage`)

```ts
import { createBame } from '@bame/core';
import { localFileStorage } from '@bame/storage-local';
import { highCard } from './game';

const bame = createBame({
	games: [highCard],
	storage: localFileStorage({ file: './.bame-data.json' }),
});
```

---

## 2. Standalone Authoritative Game Server (`listenBameServer`)

Use `listenBameServer` to host an authoritative multiplayer server that terminal clients (`@bame/ui-console`) or browser clients (`@bame/ui-react`) can connect to via `createBameClient`:

```ts
import { createBame } from '@bame/core';
import { listenBameServer, localFileStorage } from '@bame/storage-local';
import { highCard } from './game';

const bame = createBame({
	games: [highCard],
	storage: localFileStorage({ file: './.bame-high-card.json' }),
});

const server = await listenBameServer(bame, {
	port: 4000,
	unsafeTrustClientIds: true, // Local guest development; use getUserId for verified sessions.
	path: '/api/bame', // Optional, defaults to '/api/bame'
});

console.log(`Bame server listening on ${server.url}`);
// Connect clients with: createBameClient({ url: server.url })
```

---

## 3. Existing Node or Connect server

Pass `createBameNodeHandler(handler.fetch, options)` to `http.createServer` or a Connect-style `use` method. Create `handler` with `createBameHandler(bame, { getUserId })` or explicit guest mode. Options include `path` (default `/api/bame`), `maxBodyBytes` (default 65,536), and `onError`.

The listener matches exact URL paths, invokes Connect's `next` for other routes (or returns 404 without it), bounds POST bodies before calling the Fetch handler, and honors response backpressure. Disconnects abort the Fetch request and cancel its response stream. Multiple `Set-Cookie` response headers remain separate. Unexpected failures reach `onError`; reporting failures cannot prevent socket cleanup. `listenBameServer` uses the same bridge and closes active HTTP connections during shutdown.

---

## License

[MIT](../../LICENSE)
