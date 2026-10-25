# @bame/storage-firestore

**Firebase Firestore transactional storage adapter for [Bame](../../README.md).**

Implements Bame's `Storage` interface (`lobbies`, `matches`, `profiles`) using Firestore transactions (`runTransaction`) to guarantee atomic optimistic concurrency (`expectedVersion` checks).

---

## Installation

```bash
pnpm add @bame/core @bame/storage-firestore
```

---

## Usage with `createBame`

`@bame/storage-firestore` accepts any Firestore client implementing the minimal `FirestoreLike` interface (compatible with `firebase-admin/firestore` and modular wrappers):

```ts
import { createBame } from '@bame/core';
import { firestoreStorage } from '@bame/storage-firestore';
import { ticTacToe } from './game';

export const bame = createBame({
	games: [ticTacToe],
	storage: firestoreStorage(db, {
		prefix: 'bame_', // Optional collection prefix (e.g., 'bame_lobbies', 'bame_matches', 'bame_profiles')
	}),
});
```

---

## License

[MIT](../../LICENSE)
