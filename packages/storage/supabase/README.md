# @bame/storage-supabase

**Supabase Postgres storage and Realtime pub/sub adapters for [Bame](../../README.md).**

Provides optimistic concurrency control (`expectedVersion` checks) backed by Postgres and low-latency broadcast channels via Supabase Realtime.

---

## Installation

```bash
pnpm add @bame/core @bame/storage-supabase @supabase/supabase-js
```

---

## 1. Database Schema Setup

Run the following SQL in your Supabase SQL Editor to create the `lobbies`, `matches`, and `profiles` tables:

```sql
create table if not exists public.lobbies (
  id text primary key,
  version integer not null default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  id text primary key,
  version integer not null default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id text primary key,
  version integer not null default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

---

## 2. Usage with `createBame`

```ts
import { createClient } from '@supabase/supabase-js';
import { createBame } from '@bame/core';
import { supabaseRealtime, supabaseStorage } from '@bame/storage-supabase';
import { rockPaperScissors } from './game';

const supabase = createClient(
	process.env.SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const bame = createBame({
	games: [rockPaperScissors],
	storage: supabaseStorage(supabase),
	realtime: supabaseRealtime(supabase),
});
```

---

## License

[MIT](../../LICENSE)
