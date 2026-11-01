# Security policy

## Reporting a vulnerability

Report it privately through GitHub: **[Report a vulnerability](https://github.com/IIxauII/hnch/security/advisories/new)** (Security tab → Advisories → Report a vulnerability). Please don't open a public issue or PR for it.

Include what you found, how to reproduce it, and what an attacker gains. You get a reply on the advisory. A fix ships as a normal release, and the advisory is published once the fix is live.

## What is covered

Only the latest release of each part is supported:

- the web app at https://hnch.dev (`packages/client`)
- the relay behind it (`packages/relay`)
- the CLI on npm, [`@xauyxau/hnch`](https://www.npmjs.com/package/@xauyxau/hnch) (`packages/cli`)

How the relay decides who may join a room is in [ADR-0009](adr/0009-access-control-relay-tokens.md).
