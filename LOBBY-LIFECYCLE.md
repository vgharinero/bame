# Lobby lifecycle and recovery

Local matches use `useLocalMatch`. Online games can use `useLobby`
with their own UI or `LobbyGate` with its composable components. Games do not
need separate implementations of subscription ordering or recovery polling.

`useLobby(lobbyId, { initialLobby, pollIntervalMs })` can seed a room returned by
create/join. It ignores duplicate/older versions, refreshes when the subscription
becomes ready, and polls every 2000ms by default. Polling waits for each request
to settle before scheduling the next one. Pass `pollIntervalMs: false` to disable
polling. Subscription and request errors surface through `error`/`errorDetails`;
a successful refresh clears them. Effects cancel timers/subscriptions and ignore
late responses after cleanup.

- `lobbies.leave({ userId, lobbyId })`: remove only the caller; transfer host
  ownership to the next member if needed.
- `lobbies.close({ userId, lobbyId })`: host only. Persist and publish a `closed`
  lobby snapshot. Repeated closure is idempotent. Closure does not end/delete an
  existing match; match history and participant access remain intact. Closed rooms
  cannot be joined or started. `LobbyGate.Idle` renders again for closed rooms.
- `lobbies.start({ userId, lobbyId })`: host only. Repeated starts return the
  existing match; they never implicitly create a new round.
- `lobbies.rematch({ userId, lobbyId, matchId })`: host only, after the referenced
  match finishes. Reopen the same room with its members, readiness, invitation code,
  and configuration. Existing matches remain unchanged. The next Start creates a
  distinct match. A stale rematch request cannot reopen a subsequent round.

The React hook exposes `close()` and `rematch(matchId)` alongside `leave()` and
`start()`. For a custom online UI, separate Resume (open the existing match),
Rematch (prepare a finished round), and Close (close the room for everyone).

Use stable guest/authenticated user IDs. Display names belong in profiles and
may be edited or shared by multiple players. `BameProvider` can generate and
persist guest IDs independently of profile metadata.

`lobbies.previewByCode(code)` returns metadata for an open invitation without
joining it. The preview contains game/player limits and member names/avatars,
excluding configuration, readiness, timestamps, statistics, and match state.
It uses the same deadlines and cancellation scopes as other client operations.
Closed, started, missing, or ambiguous invitation codes return `null`.
