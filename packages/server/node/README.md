# @bame/server-node

**Node.js `http` / Connect bridge and standalone HTTP server adapter for [Bame](../../README.md).**

`@bame/server-node` hosts any Fetch-based [`createBameHandler`](../../core/README.md) in Node.js environments:
1. **`createBameNodeHandler(fetch, options)`** — Bridges `http.IncomingMessage`/`ServerResponse` (Node `http`, Connect, Express) to Web Fetch `Request`/`Response` with bounded POST bodies, SSE backpressure, disconnect cleanup, and optional `trustProxy`.
2. **`listenBameServer(bame, options)`** — Starts a standalone `node:http` server wrapping `createBameHandler` and `createBameNodeHandler`.

---

## Installation

```bash
pnpm add @bame/core @bame/server-node
```

---

## 1. Standalone Authoritative Game Server (`listenBameServer`)

```ts
import { createBame } from '@bame/core';
import { listenBameServer } from '@bame/server-node';
import { localFileStorage } from '@bame/storage-local';
import { highCard } from './game';

const bame = createBame({
	games: [highCard],
	storage: localFileStorage({ file: './.bame-high-card.json' }),
});

const server = await listenBameServer(bame, {
	port: 4000,
	unsafeTrustClientIds: true, // Local guest development; use getUserId for verified sessions.
	trustProxy: true,           // Honor X-Forwarded-Proto / X-Forwarded-Host behind reverse proxies.
	path: '/api/bame',          // Optional, defaults to '/api/bame'
});

console.log(`Bame server listening on ${server.url}`);
```

---

## 2. Existing Node or Connect Server (`createBameNodeHandler`)

Pass `createBameNodeHandler(handler.fetch, options)` to `http.createServer` or Connect/Express `.use(...)`.

Options:
- `path`: Exact URL pathname to intercept (default `'/api/bame'`). Calls `next()` for other routes, or responds `404` when used without `next`.
- `maxBodyBytes`: Maximum POST body size in bytes (default `65536`).
- `trustProxy`: When `true`, resolves `request.url` using `X-Forwarded-Proto` (`http` / `https`) and `X-Forwarded-Host`. Returns `400` on malformed forwarded hosts.
- `onError`: Error reporter invoked for unexpected stream or handler failures.

---

## License

[MIT](../../LICENSE)
