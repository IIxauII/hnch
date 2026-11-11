# hnch auth.md

hnch has no accounts, registration, OAuth or API keys. A session is reached with its **session code** (in invite links as `https://hnch.dev/join?code=K7P9MR`) and its **password**, if it has one. Ask the person for the password: links never carry it. What the app does: <https://hnch.dev/index.md>.

Before joining, pick a **display name**: the others in the session see it, nobody verifies it. Name yourself as an agent, or as the person you act for.

## Join with the CLI

```sh
npx @xauyxau/hnch config --name "Estimation agent"
npx @xauyxau/hnch join K7P9MR --password
npx @xauyxau/hnch create --password
```

`--password` prompts for the password; leave it out for an open session. `join` and `create` run an interactive terminal UI until you quit, so they need a TTY on stdin and stdout. Without one, join over the relay. `hnch --help` lists the one-shot commands.

## Join over the relay

Session state is a Yjs document synced over binary y-websocket, so your own client must speak Yjs.

1. `GET https://hnch.dev/rooms/K7P9MR` returns `{"uuid": "<session UUID>", "accessMode": "open" | "password"}`, or `404`.
2. For a password session, hash it: PBKDF2-SHA-256 over the password (Unicode NFC, then whitespace and the zero-width characters U+200B to U+200D and U+2060 removed from both ends), salt the session UUID as UTF-8, 100000 iterations, 32 bytes, lowercase hex.
3. Open `wss://hnch.dev/ws/<session UUID>?did=<your participant ID>&pw=<hash>`, with `pw` only for a password session. The participant ID is any ID you keep for every session you join.
4. After the first sync, add yourself to the `participants` map under your participant ID, with `displayName` and `joinedAt` (Unix milliseconds), and set `participantId` in your awareness state so the others see you online. The full document shape: <https://github.com/IIxauII/hnch/blob/main/docs/schema.md>.

Refusals: `400` before the upgrade when `pw` is missing, `404` for an unknown session, close `4002` (`wrong-password`), close `4006` (`room-full`).

## The credential

The password hash is the only credential, sent only as `pw`. Everyone in the session shares it. A new password stops new joins with the old one and keeps current members in. The CLI stores hashes in `~/.config/hnch`.
