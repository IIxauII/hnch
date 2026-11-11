# Relay API

The HTTP API of the hnch relay at `https://hnch.dev`, for anyone building a client. The web app and the CLI (`@xauyxau/hnch`) use exactly this API, through [`packages/shared/src/relay-client.ts`](../packages/shared/src/relay-client.ts).

- **Spec:** [`https://hnch.dev/openapi.json`](https://hnch.dev/openapi.json) (OpenAPI 3.1, source [`packages/client/src/openapi.json`](../packages/client/src/openapi.json)). It is authoritative for request and response shapes.
- **Discovery:** [`https://hnch.dev/.well-known/api-catalog`](https://hnch.dev/.well-known/api-catalog) lists this API per [RFC 9727](https://www.rfc-editor.org/rfc/rfc9727).
- **Status:** `GET https://hnch.dev/health` answers `{"status":"ok","version":"…"}`.

No account or API key is needed. Every response allows any origin (CORS).

## How a client joins a session

1. **Create a room:** `POST /rooms` with `{}` → `201 {"uuid", "code"}`. Share the 6-character `code`; keep the `uuid`.
2. **Find a room by its code:** `GET /rooms/{code}` → `200 {"uuid", "accessMode"}`, or `404 {"reason":"unknown-room"}` when the session has ended.
3. **Join:** open a WebSocket to `wss://hnch.dev/ws/{uuid}?did={deviceId}` (add `&pw={passwordHash}` for a password room) and sync the room's Yjs document with the y-websocket protocol. The document's shape is in [`schema.md`](schema.md).

A refused join closes the socket with a code from 4001 to 4010, for example 4001 for an unknown room, 4002 for a wrong password and 4006 for a full room. The full list is `JOIN_REJECTION_CLOSE_CODES` in [`packages/shared/src/auth.ts`](../packages/shared/src/auth.ts).

## Passwords

`PATCH /rooms/{uuid}/access` with `{"passwordHash": "…"}` protects a room; `{"passwordHash": null}` opens it again. The relay never receives a password: clients send a PBKDF2-SHA-256 hash of it, salted with the room UUID ([ADR-0017](../adr/0017-password-hashing-drop-invite-only.md); see `hashPassword` in [`packages/shared/src/password.ts`](../packages/shared/src/password.ts)). Since the salt is the UUID, a client creates a protected room in two steps: `POST /rooms`, then `PATCH` its access.

## Errors and limits

- `503 {"error":"unavailable"}` is a transient platform failure: retry. Only a `404` with `"reason":"unknown-room"` means the session is gone.
- `POST /rooms` is rate-limited per IP and answers `429` to a burst ([deployment.md](deployment.md#dns-and-edge)).
- Request bodies are JSON of at most 4 KiB.
