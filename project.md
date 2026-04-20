# hnch

Pointing poker (planning poker) application for agile teams.

## Name

**hnch** — a vowel-dropped spelling of "hunch", reflecting the gut-feel nature of story point estimation.

## Concept

A pointing poker tool that enables agile/scrum teams to collaboratively estimate story points. Core mechanic: team members independently select an estimate (typically using Fibonacci-like sequences), then all choices are revealed simultaneously to avoid anchoring bias.

## Principles

- **Quick & lightweight** — minimal setup, instant use
- **Local-first / P2P** — no central server required; peers connect directly
- **No account required** — jump straight into a session, no sign-up or login

## Estimation Scales

The app supports multiple pointing poker styles out of the box and lets users define their own.

### Built-in presets

| Preset | Values |
|---|---|
| Fibonacci | 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89 |
| Modified Fibonacci | 0, ½, 1, 2, 3, 5, 8, 13, 20, 40, 100 |
| T-shirt sizes | XS, S, M, L, XL, XXL |
| Powers of 2 | 1, 2, 4, 8, 16, 32, 64 |
| Time-based (hours) | 1h, 2h, 4h, 8h, 16h, 24h, 40h |
| Time-based (days) | ½d, 1d, 2d, 3d, 5d, 10d, 20d |

All presets include a **?** (unsure / need discussion) option.

### Reveal mode

Configurable per session by the host:

- **Auto** — votes revealed once all voters have submitted
- **Manual** — host triggers the reveal

### Export

Round results can be exported via:

- **Clipboard** — plain text copy
- **Markdown** — formatted for pasting into tools like Jira, Linear, Notion, etc.

### Round Metadata

Each round can have optional metadata — title, description, ticket ID, or any freeform context the host wants to attach.

### Round Analytics

After reveal, each round displays:

- **Visual highlighting** of vote distribution (clustering vs. spread)
- **Average & median** of numeric votes
- **Outlier flagging** — highlight votes far from the group
- **Time to vote** — how long the round took from start to last vote

### Re-voting

Re-votes are always allowed. The group can run as many rounds as needed on the same item.

### Timer

Optional countdown per round, configurable by the host. When the timer expires, votes are revealed regardless of completion.

### Custom scales

Users can define their own scales with arbitrary labels — numeric, text, or mixed. Examples:

- `1, 2, 3, 5, 13`
- `S, M, L, XXXXL`
- `Easy, Medium, Hard, Impossible`

Custom scales can be created per-session and shared with all participants automatically.

## Joining a Session

Multiple join methods to minimize friction:

- **Shareable link** — direct URL to the session
- **Room code** — short, typeable code (e.g. `ABC-123`)
- **QR code** — scannable from another device
- **Nearby discovery** (v2) — detect devices in proximity (e.g. Bluetooth/NFC/mDNS) for in-person meetings. Deferred due to limited Capacitor plugin maturity.

## Identity

User picks a nickname on first app launch. The nickname is persisted locally and tied to a device identifier. Users can optionally change their nickname before joining any session. Each user gets an auto-assigned color and avatar for visual differentiation. Nickname changes within an active session are not allowed.

## Access Control

Sessions are open by default (anyone with the link/code can join). Host can optionally enable:

- **Password-protected** — joiners must enter a password
- **Invite-only** — host explicitly admits participants

**Future consideration:** vote signing via device keys to prevent forgery. Not in scope initially.

## Participants

Hard cap of 20 participants per session (P2P mesh constraint). Participants can switch between **voter** and **viewer** roles at any time. Viewers observe but are not required to vote.

## Session Persistence

Sessions must persist across page reloads and reconnections. Session state (participants, votes, history) is durable — not lost if the browser is closed or the network drops. Sessions never auto-expire; users manage their own storage.

## Networking

### P2P Connectivity

- **Primary** — y-websocket relay via self-hosted server (cross-platform reliable)
- **Enhanced** (where supported) — WebRTC for direct peer-to-peer data channels; public STUN servers for NAT traversal; TURN fallback for restrictive firewalls
- **Local/same-network** (v2) — Bluetooth, multipeer connectivity, mDNS, NFC for fully serverless in-person use

### Signaling Server

Lightweight self-hosted y-websocket server that relays Yjs CRDT sync messages between peers. Stateless — holds no session data, no user data, no votes. Also handles WebRTC signaling where direct P2P is supported. Pure P2P (y-webrtc) is unreliable on iOS WKWebView, so the relay server is the primary sync path for cross-platform compatibility.

### Network Partitions

Handled silently via CRDTs — partitioned groups continue independently and merge on reconnect. No disruptive alerts. Disconnected or unreachable participants are visually distinguished (e.g. greyed out) from connected ones.

## Conflict Resolution

Yjs (CRDT library) for state synchronization. Guarantees all peers converge to the same state regardless of update order. Local persistence via y-indexeddb (PWA) or Capawesome SQLite (native iOS/Android — avoids iOS IndexedDB eviction after 7 days of inactivity).

## Offline Support

The app must work offline. Users can continue interacting with the UI (view past rounds, prepare votes) even without connectivity. Changes sync automatically when back online.

## Host Migration (P2P)

In the P2P model, any participant can become the session host. If the current host drops out (closes browser, loses connection, etc.), ownership automatically transfers to another connected peer so the session continues uninterrupted. There is no single point of failure.

## UX

Mobile-first design. Desktop adapts up. Target platforms: web browser, iOS, Android. WCAG AAA accessibility compliance — screen readers, keyboard navigation, sufficient contrast. Ease of use is a priority. Dark/light mode follows system preference.

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Angular |
| UI | Ionic |
| Native bridge | Capacitor |
| State/sync | Yjs |
| P2P transport | y-websocket (sync relay) + WebRTC where supported |
| Local storage | Capawesome SQLite (native), IndexedDB (PWA) |
| Sync/signaling server | y-websocket server, Node.js (self-hosted) |
| Platforms | PWA + iOS (Capacitor) + Android (Capacitor) |

## Status

Tech stack decided. Architecture and implementation TBD.
