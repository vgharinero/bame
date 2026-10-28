# Remote client identity, deadlines, and cancellation

Private lobby subscriptions require an explicit caller. Pass
`lobbies.subscribe(id, callback, { userId })` or set a client-wide `userId`.
Profile writes and lobby reads do not set subscription identity. React
`useLobby` and the console adapter pass their active player ID automatically.
Authenticated servers verify the bearer/cookie identity and reject claims
that do not match it; a client ID is not authentication.

`createBameClient({ url, requestTimeoutMs })` defaults to a 15000ms deadline for
one entire RPC, including header lookup, preflight version fetch, retries, and
response parsing. Use `false` to disable the deadline. The same setting bounds
SSE HTTP connection establishment; it does not end an established stream.

`client.withOptions({ signal, requestTimeoutMs })` creates an independent scope.
Cancellation aborts that scope's requests/subscriptions without mutating the
original client. `useLobby` automatically aborts its remote reads and stream when
its effect cleans up. Custom fetch implementations should respect AbortSignal;
caller promises still settle on timeout even if a custom fetch ignores it.

Errors distinguish `REQUEST_TIMEOUT`, `REQUEST_ABORTED`, and `TRANSPORT_ERROR`.
Authorization errors use the same `UNAUTHORIZED`/`FORBIDDEN`/`NOT_FOUND` codes in
RPC and SSE. `BameTransportError.httpStatus` preserves HTTP status separately.

Mutation retries preserve the same request ID. A timeout or cancellation cannot
prove whether the server committed a mutation: reconcile the latest snapshot or
retry with the error's request ID, never with a new ID. Do not blindly retry lobby
creation, which does not use match-action receipts.

Authentication is provider-neutral. Dynamic `headers` callbacks resolve for every RPC
attempt and SSE reconnect, supporting refreshed bearer tokens. Token changes do
not replace an already-open stream. Dispose scopes when identity changes or on
logout, and establish new subscriptions using the new identity/credentials.
