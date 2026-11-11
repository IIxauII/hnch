# hnch — planning poker

> Planning poker for agile teams. No account, no setup — share a code and estimate together.

hnch (a vowel-dropped "hunch") is for estimating stories as a team. Everyone picks a card in private, and the cards are revealed together, so nobody anchors on someone else's estimate.

This is the Markdown version of <https://hnch.dev>, for clients that ask for `text/markdown`. The app itself is interactive: open it in a browser, or use the command-line client.

## Start or join a session

- **In a browser:** open <https://hnch.dev>, choose a nickname, then start a new session or join one with its session code.
- **In a terminal** (Node.js 22 or later): `npx @xauyxau/hnch create` starts a session with you as host. `npx @xauyxau/hnch join K7P9MR` joins one by its code. `npm i -g @xauyxau/hnch` installs the client as `hnch`. The first run asks for a display name.
- **Invite links** look like `https://hnch.dev/join?code=K7P9MR`: the `code` parameter is the session code. Open the link in a browser, or pass the code to `hnch join`. The pages of a running session (`/lobby/K7P9MR`, `/estimating/K7P9MR`) carry the code in the path.

A session code is 6 characters, uppercase letters and digits without the look-alikes 0, O, 1, I and L. It is shown with a dash (`K7P-9MR`) and accepted with or without it, in any case.

A session can have a password. The app asks for it when you join, and so does `hnch join <code> --password`. It is never part of a link.

## How a session works

- Up to 20 people per session, observers included. Each one is a voter or an observer; observers watch without voting.
- The host starts each round, optionally with a title, a ticket ID or a description.
- Voters pick a card or abstain, and can change their choice until the reveal. The round reveals when every online voter has voted, or when the host reveals it.
- After the reveal, the round shows the average and median of numeric votes, the most common card where there is one, and an agreement label: Unanimous, Close or Spread.
- After a reveal the host can call a re-vote: a new round that keeps the link to the one before it.

## Scales

| Scale | Cards |
| --- | --- |
| Fibonacci | 0, 1, 2, 3, 5, 8, 13, 21 |
| T-shirt | XS, S, M, L, XL |
| Powers of 2 | 1, 2, 4, 8, 16, 32, 64 |
| Linear (1–10) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| Risk | Low, Medium, High, Critical |

A custom scale can have any cards, two or more; everyone in the session votes with them.

## Privacy

- No account and no sign-up.
- A session's state (names, votes, round titles) is stored on Cloudflare and deleted 24 to 25 hours after the last person leaves. The relay that syncs it never parses it.

## Links

- App: <https://hnch.dev>
- Command-line client: <https://www.npmjs.com/package/@xauyxau/hnch>
- How agents get into a session: <https://hnch.dev/auth.md>
- Source code (AGPL-3.0-only): <https://github.com/IIxauII/hnch>
- Third-party licenses: <https://hnch.dev/3rdpartylicenses.txt>
