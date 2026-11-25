# @bame/storage-local

**Local JSON file storage adapter for [Bame](../../README.md).**

`@bame/storage-local` persists lobbies, matches, and player profiles to a single local JSON file with atomic temp-file writes, PID lock recovery, and optimistic concurrency checks (`VersionConflictError`).

*(For the Node.js HTTP server and Connect middleware, see [`@bame/server-node`](../../server/node/README.md).)*

---

## Installation

```bash
pnpm add @bame/core @bame/storage-local
```

---

## Usage (`localFileStorage`)

```ts
import { createBame } from '@bame/core';
import { localFileStorage } from '@bame/storage-local';
import { highCard } from './game';

const bame = createBame({
	games: [highCard],
	storage: localFileStorage({
		file: './.bame-data.json',
		// Optional: reuse the active in-process writer across Vite/SSR module reloads.
		reuseInProcess: true,
	}),
});
```

---

## License

[MIT](../../LICENSE)
