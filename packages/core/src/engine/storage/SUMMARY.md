# engine/storage — Summary

## Architecture

Storage is decoupled from domain via a layered design:
**Domain types** (engine/domain) -> **Mappers** -> **Schema records** -> **DataSource** (infra)

The `DataSource` interface is the only contract infra must implement.
All storage adapters extend `VersionedStorage`, which handles version bumps and timestamps.

## Layer diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SERVER ACTIONS / HOOKS                       │
│              (server/actions/game, lobby, transitions)              │
│                  consume adapters, return domain types               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ uses
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      STORAGE ADAPTERS                               │
│                   engine/storage/adapters/                           │
│                                                                     │
│  GameStorageAdapter ✅    LobbyStorageAdapter ❌   ProfileAdapter ❌ │
│  ├─ getGame               (empty)                  (empty)          │
│  ├─ updateGame                                                      │
│  └─ applyAction                                                     │
│                                                                     │
│  All extend VersionedStorage (base/)                                │
│  Orchestrate mappers + DataSource calls                             │
└──────────┬──────────────────────────────┬──────────────────────────-┘
           │ maps with                    │ reads/writes via
           ▼                              ▼
┌────────────────────────┐  ┌────────────────────────────────────────┐
│       MAPPERS          │  │          BASE ABSTRACTIONS             │
│  engine/storage/       │  │       engine/storage/base/             │
│       mappers/         │  │                                        │
│                        │  │  DataSource (interface)                │
│  GameMapper ✅         │  │  ├─ performGet/GetMany                 │
│  PlayerMapper ✅       │  │  ├─ performGetByField/GetManyByField   │
│  LobbyMapper ✅        │  │  ├─ performInsert/Update/Delete        │
│  LobbyMemberMapper ✅  │  │  └─ performAtomic                     │
│  ProfileMapper ✅      │  │                                        │
│  ActionMapper ✅       │  │  AtomicOperation (union type)          │
│                        │  │  VersionedStorage (abstract class)     │
│  domain ←→ record      │  │  └─ version/timestamp stamping        │
└──────┬─────────────────┘  └─────────────────┬──────────────────────┘
       │ converts                             │ operates on
       ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     STORAGE SCHEMA                                  │
│                  engine/storage/schema/                              │
│                                                                     │
│  Registered in SCHEMAS map:         NOT registered (schema exists): │
│  ├─ games     (GameRecord)          ├─ lobbies      (LobbyRecord)   │
│  ├─ players   (PlayerRecord)        └─ lobby_members (LobbyMember~) │
│  ├─ profiles  (ProfileRecord)                                       │
│  └─ actions   (ActionRecord)                                        │
│                                                                     │
│  primitives: TableSchema, ColumnDef, JsonValue, ForeignKeyRef       │
│  versioned:  VersionedRecord (id, version, createdAt, updatedAt)    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ implemented by
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     INFRA (e.g. Supabase)                           │
│              infra/supabase/storage/                                 │
│                                                                     │
│  SupabaseDataSource ✅  ── implements DataSource                    │
│  └─ wraps SupabaseClient, translates to .from().select/insert/etc.  │
│                                                                     │
│  SupabaseStorageFactory (draft)                                     │
│  └─ creates GameStorageAdapter (+ future Lobby, Profile adapters)   │
└─────────────────────────────────────────────────────────────────────┘
```

## Domain entities (engine/domain) — for context

```
VersionedEntity<TId = string>
├── Game ── has Player[], Turn, publicState, config, seed
├── Lobby ── has LobbyMember[], gameConfig, code, hostId
├── Player ── id: {gameId, userId}, has privateState, extends PublicUserInfo
├── LobbyMember ── id: {lobbyId, userId}, extends PublicUserInfo
├── Profile ── extends PublicUserInfo, has ProfileStats
└── User ── extends PublicUserInfo, has id

Action ── userId, timestamp, discriminated type+payload
Turn ── currentPlayerId, allowedActions, discriminated phase+phaseData
RealtimeEvent ── type, version, payload
├── GameRealtimeEvent (state_updated, action_applied, player_dis/reconnected, finished)
├── LobbyRealtimeEvent (updated, member_joined/left, transitioned)
├── LobbiesRealtimeEvent (available/updated_public_lobby)
└── ProfileRealtimeEvent (new_stats)
```

## Realtime subsystem

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│    CLIENT (hooks)       │        │  REALTIME ADAPTER ❌          │
│  useGame / useLobby     │◄──────▶│  (empty — needs subscribe/   │
│                         │        │   unsubscribe contract)      │
│  StateSynchronizer ✅   │        │                              │
│  ├─ version tracking    │        │  Future infra impl:          │
│  ├─ gap detection       │        │  SupabaseRealtimeAdapter     │
│  └─ full-state recovery │        └──────────────────────────────┘
└─────────────────────────┘
```

## Data flow: action lifecycle

```
Client ──action──▶ Server Action
                      │
                      ├─ adapter.getGame()
                      │    └─ DataSource.performGet (games)
                      │    └─ DataSource.performGetManyByField (players)
                      │    └─ DataSource.performGetMany (profiles)
                      │    └─ GameMapper.toDomain()
                      │
                      ├─ engine.applyAction(game, action)  ← pure domain logic
                      │
                      └─ adapter.applyAction(game, action)
                           └─ GameMapper.toRecord()
                           └─ ActionMapper.toRecord()
                           └─ DataSource.performAtomic([updateGame, insertAction])
```

## What's done

### base/
- `DataSource` — generic interface for CRUD + atomic operations over typed table records.
- `AtomicOperation` — discriminated union for insert/update/delete operations within a transaction.
- `VersionedStorage` — abstract class that stamps version, createdAt, updatedAt on records.
  Provides both immediate (`insertVersionedRecord`, `updateVersionedRecord`) and deferred (`prepareInsert`, `prepareUpdate`) methods for atomic batches.

### schema/
- `primitives` — defines `TableSchema`, `ColumnDef`, `JsonValue`, and `ForeignKeyRef` types.
- `versioned` — `VersionedRecord` interface (id, version, createdAt, updatedAt).
- `game` — `GameRecord` + `GAMES_SCHEMA`.
- `player` — `PlayerRecord` + `PLAYER_SCHEMA`.
- `profile` — `ProfileRecord` + `PROFILES_SCHEMA`.
- `action` — `ActionRecord` + `ACTIONS_SCHEMA` (not versioned, append-only).
- `lobby` — `LobbyRecord` + `LOBBIES_SCHEMA`.
- `lobby-member` — `LobbyMemberRecord` + `LOBBY_MEMBER_SCHEMA`.
- `index` — registers `SCHEMAS` map and derives `TableName`/`TableRecord` utility types.
  Only games, players, profiles, and actions are registered. **Lobby and lobby-member schemas are NOT registered.**

### mappers/
Bidirectional mappers between domain types and storage records (`toDomain` / `toRecord`):
- `GameMapper` — maps Game + nested Players. Requires `PublicUserInfo` from profile records.
- `PlayerMapper` — maps Player. Composite id: `gameId:userId`.
- `LobbyMapper` — maps Lobby + nested LobbyMembers.
- `LobbyMemberMapper` — maps LobbyMember. Composite id: `lobbyId:userId`.
- `ProfileMapper` — trivial spread (domain and record are nearly identical).
- `ActionMapper` — maps Action. Composite id: `gameId:timestamp:userId`.
- All six mappers are exported from `mappers/index`.

### adapters/
- `GameStorageAdapter` — full implementation: `getGame`, `updateGame`, `applyAction`.
  Uses atomic operations to persist game + player records together.
- `LobbyStorageAdapter` — **file exists but is empty.**
- `ProfileStorageAdapter` — **file exists but is empty.**
- `adapters/index` — only re-exports `GameStorageAdapter`.

### realtime/
- `StateSynchronizer` — client-side versioned event stream handler.
  Detects version gaps and triggers full-state recovery.
  Has a complete test suite.
- `RealtimeAdapter` — **file exists but is empty.** Should define the realtime subscription contract.

## What's missing

### Critical
- `LobbyStorageAdapter` — needs `getLobby`, `createLobby`, `joinLobby`, `updateLobby`, `deleteLobby`.
- `ProfileStorageAdapter` — needs `getProfile`, `createProfile`, `updateProfile`.
- `RealtimeAdapter` — needs subscribe/unsubscribe contract for realtime channels.
- Lobby and lobby-member schemas must be registered in `schema/index` SCHEMAS map.
- `adapters/index` must re-export lobby and profile adapters once implemented.

### Secondary
- `GameStorageAdapter` is missing `createGame` (insert, used during lobby-to-game transition).
- No `ActionStorageAdapter` — action reads (history/replay) have no adapter yet.
- `StateSynchronizer` test imports from `../../types` (old path) instead of `../../domain`.
- `generateLobbyCode` lives inside the lobby schema file — may belong in domain or a utility.
