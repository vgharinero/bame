# @bame/storage-local

**Local JSON file storage adapter and standalone Node.js HTTP server for [Bame](../../README.md).**

`@bame/storage-local` provides two zero-configuration utilities for Node.js environments:
1. **`localFileStorage({ file })`** — Persists lobbies, matches, and player profiles to a local JSON file with atomic writes and optimistic concurrency checks (`VersionConflictError`).
2. **`listenBameServer(bame, options)`** — Spins up a standalone Node.js HTTP server (`node:http`) wrapping `createBameHandler(bame)` with CORS, JSON-RPC (`POST`), and Server-Sent Events (`GET`) streaming.

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
	path: '/api/bame', // Optional, defaults to '/api/bame'
});

console.log(`Bame server listening on ${server.url}`);
// Connect clients with: createBameClient({ url: server.url })
```

---

## License

[MIT](../../LICENSE)
