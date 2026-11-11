# hnch auth.md

> How an agent gets into a hnch session. There is nothing to register for: hnch has no accounts, no sign-up, no OAuth and no API keys.

This file is for AI agents and the tools that drive them, acting for a person who wants to start or join a planning-poker session on <https://hnch.dev>. A person's guide to the app is at <https://hnch.dev/index.md>.

## Registration

None. There is no registration endpoint, no authorization server and no token to obtain. hnch publishes no `/.well-known/oauth-protected-resource` or `/.well-known/oauth-authorization-server` metadata, because there is no protected resource behind an account.

What stands in for an account:

- **A display name.** Everyone picks one on first visit: the app asks for it before anything else, the command-line client on its first run. It is the name the others in a session see. It is kept on the device only (browser storage, or `~/.config/hnch/config.json` for the command-line client) and is never checked by anyone. An agent should use a name that says it is an agent, or the name of the person it acts for, as that person asks.
- **A participant ID.** A random ID the client makes once and keeps with the display name. It tells the session's members apart. It is not a secret and proves nothing.

## Getting into a session

What an agent needs is what a person needs: the **session code**, and the session's **password** if it has one.

- A session code is 6 characters, uppercase letters and digits without 0, O, 1, I and L, for example `K7P9MR`. It is shown with a dash (`K7P-9MR`) and accepted with or without it, in any case.
- An invite link carries the code: `https://hnch.dev/join?code=K7P9MR`. A trailing `&pw=1` only means the session has a password; the password itself is never part of a link. Ask the person for it.
- Whoever has the code can join an open session. Up to 20 people per session, observers included; a full session refuses the next one.
- Someone who joins votes by default and can switch to observer. The person who started the session is its host, and hosting passes to another member only when the host drops out.

## Supported methods

### Command-line client (recommended)

The command-line client `hnch` does everything below for you. It needs Node.js 22 or later and is published on npm as [`@xauyxau/hnch`](https://www.npmjs.com/package/@xauyxau/hnch).

```sh
npx @xauyxau/hnch config --name "Estimation agent"
npx @xauyxau/hnch join K7P9MR
npx @xauyxau/hnch join K7P9MR --password
npx @xauyxau/hnch create --password
```

- `config --name` sets the display name without a prompt. Run it first: otherwise the first `join` or `create` asks for one.
- `--password` reads the password from a hidden prompt, or one line from standard input when there is no terminal. It is never a command-line argument.
- `join` and `create` open an interactive terminal view that runs until you quit or the session ends.
- `hnch agenda add|list|skip|cancel|mv` changes the session's agenda (the rounds queued for later) and exits. It acts on the session last joined with `hnch join` on the same machine.

### Relay protocol (advanced)

The browser app and the command-line client talk to the relay on `hnch.dev`. A session's state is a [Yjs](https://yjs.dev) document, synced over a WebSocket in the binary y-websocket protocol. There is no JSON or REST API for votes or rounds, so a client of its own must speak Yjs.

1. `GET https://hnch.dev/rooms/K7P9MR` answers `200 {"uuid": "…", "accessMode": "open" | "password"}`, or `404` for a code that does not exist (or no longer does).
2. For a password session, compute the password hash: PBKDF2-SHA-256 over the password (Unicode NFC, surrounding whitespace removed), salt the session UUID from step 1 as UTF-8, 100000 iterations, 32 bytes, lowercase hex. The plain password never leaves the client.
3. Open `wss://hnch.dev/ws/<uuid>?did=<participant ID>&pw=<password hash>`. Leave out `pw` for an open session.
4. To start a session instead: `POST https://hnch.dev/rooms` with an empty body answers `201 {"uuid": "…", "code": "…"}`. To give it a password, hash the password with the UUID it returned (step 2) and send `PATCH https://hnch.dev/rooms/<uuid>/access` with `{"passwordHash": "<hash>"}`, or `{"passwordHash": null}` to remove it. The command-line client does both for you.

The relay closes the WebSocket with code `4002` (`wrong-password`) for a wrong password and `4006` (`room-full`) when the session is full. A password session opened without `pw` answers `400` before the upgrade, an unknown session `404`.

## Using the credential

The only credential is the password hash, and it is sent only as the `pw` parameter of the WebSocket URL: no `Authorization` header, no cookie, no bearer token. It is good until the session's password is changed or removed. It cannot be revoked per member, because there are no members to revoke: everyone in a session shares one password.

- Keep the password and its hash out of logs, links and messages. Share only the session code.
- Session state (display names, votes, round titles) is deleted 24 to 25 hours after the last person leaves. There is nothing to sign out of.

## Links

- App: <https://hnch.dev>
- The app in Markdown: <https://hnch.dev/index.md>
- Command-line client: <https://www.npmjs.com/package/@xauyxau/hnch>
- Source code (AGPL-3.0-only): <https://github.com/IIxauII/hnch>
