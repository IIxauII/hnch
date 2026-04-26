# hnch

Pointing poker (planning poker) application for agile teams.

## Name

**hnch** — a vowel-dropped spelling of "hunch", reflecting the gut-feel nature of story point estimation.

## Concept

A pointing poker tool that enables agile/scrum teams to collaboratively estimate story points. Core mechanic: team members independently select an estimate (typically using Fibonacci-like sequences), then all choices are revealed simultaneously to avoid anchoring bias.

## Principles

- **Quick & lightweight** — minimal setup, instant use
- **Local-first sync** — clients hold the canonical state; the server is a thin, content-blind relay that never inspects session content
- **No account required** — jump straight into a session, no sign-up or login

## Estimation Scales

The app supports multiple pointing poker styles out of the box and lets users define their own.

### Built-in presets

| Preset | Values |
|---|---|
| Fibonacci | 0, 1, 2, 3, 5, 8, 13, 21 |
| T-shirt | XS, S, M, L, XL |
| Powers of 2 | 1, 2, 4, 8, 16, 32, 64 |
| Linear | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| Risk | Low, Medium, High, Critical |

### Reveal

Reveal is fixed: the host can manually reveal at any time, and the round auto-reveals once every online voter has cast a vote (unanimous). There is no per-session reveal-mode setting (ADR-0018).

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

Re-votes are always allowed. A re-vote creates a *new* round with `parentRoundId` pointing at the previous round and title/metadata inherited by default, preserving the progression of estimates across rounds (e.g. 5 → 8 → 13) for retrospective value. The UI walks the parent chain to render lineage like "Round 2 of 3 on 'Auth migration'."

Before a round's reveal, a user may change their vote any number of times by tapping a different card — only the selection at reveal time counts. This matches physical planning poker (you can flip your card back over before everyone shows).

### Timer

`timerStartedAt` is written at round creation and serves as a stopwatch origin. The estimating screen displays elapsed time counting up from this value. There is no countdown or auto-reveal-on-expiry (ADR-0018).

### Custom scales

Users can define their own scales with arbitrary labels — numeric, text, or mixed. Examples:

- `1, 2, 3, 5, 13`
- `S, M, L, XXXXL`
- `Easy, Medium, Hard, Impossible`

Custom scales can be created per-session and shared with all participants automatically.

## Joining a Session

Multiple join methods to minimize friction:

- **Shareable link** — direct URL to the session
- **Room code** — 6-character alphanumeric (uppercase letters + digits, excluding the look-alikes `0`, `O`, `1`, `I`, `L`). Displayed with a dash for readability (e.g. `K7P-9MR`), but stored and matched in normalized, case-insensitive form.
- **QR code** — scannable from another device
- **Nearby discovery** (v2) — detect devices in proximity (e.g. Bluetooth/NFC/mDNS) for in-person meetings. Deferred due to limited Capacitor plugin maturity.

Internally, each room has a stable UUID; the 6-char code is a lookup pointing at it. When a session ends, the code is reserved for the snapshot TTL window (see *Session Lifetime*) and then released back to the pool.

## Identity

User picks a nickname on first app launch. The nickname is persisted locally and tied to a **device identifier** obtained via the Capacitor Device plugin (`Device.getId()`), cached in Capacitor Preferences (or SQLite) to avoid re-hitting the native bridge on every launch. Durability varies by platform: Android's `ANDROID_ID` is stable across reinstalls under the same signing key; iOS's `identifierForVendor` resets on reinstall for a single-app vendor; web generates and stores a UUID. These limitations are accepted for v1 — if durable cross-device identity becomes a real need, it will be solved at a higher layer (e.g. opt-in passkey), not by fingerprinting.

Users can optionally change their nickname before joining any session. Each user gets an auto-assigned color and avatar for visual differentiation. Nickname changes within an active session are not allowed.

## Teams (local concept)

A **Team** is a device-local, personal saved collection of "people I usually estimate with" plus optional default session settings (e.g. scale). Teams let a user spin up a new session pre-populated with their usual attendees and defaults.

Teams are *not* synced via Yjs and are *not* part of the session document. Each user maintains their own Teams in local storage. There is no shared canonical team entity — Bob and Carol can each have their own "Platform Squad" Team definition, and they may differ.

A session is always ephemeral (per meeting) regardless of whether it was started from a Team or not.

## Access Control

Sessions are open by default (anyone with the link/code can join). Host can optionally enable:

- **Password-protected** — on session creation, the host registers a password hash with the relay. Joiners submit their password as a hash; the relay compares and accepts or rejects at socket connect time.

Access control is *relay-enforced*, not client-side. The relay holds a small amount of per-active-room metadata (password hash) but remains **content-blind** — it never parses session data, votes, or user identity. The password hash is opaque to the relay's semantics.

**Future consideration:** vote signing via device keys to prevent forgery. Not in scope initially.

## Participants

Hard cap of 20 participants per session — more than enough for any real planning poker session and keeps relay bandwidth bounded. Participants can switch between **voter** and **viewer** roles at any time. Viewers observe but are not required to vote.

## Session Lifetime & Persistence

A session is **ephemeral — one session per estimation meeting**. It contains participants, rounds, votes, and history for that meeting. Reloads, network blips, and brief disconnects all rehydrate cleanly: connected clients hold the canonical state, and each client persists its own copy to local storage (IndexedDB for PWA, Capawesome SQLite on native).

When the *last* peer disconnects from a room, the relay retains the session's opaque CRDT state in memory for **24 hours** (see *Ephemeral Room Snapshots* under Networking). A peer returning within that window rehydrates the session even if nobody else is online. After 24 hours with no connections, the snapshot is discarded and the session is gone — its code is released back to the pool.

Teams (see *Identity*) are a separate, local-only concept that persists on the user's device indefinitely; they exist independently of any session lifecycle.

## Networking

### Sync Transport

- **Primary (and only supported path)** — y-websocket relay via self-hosted Node server. Cross-platform reliable, works through corporate firewalls, no NAT traversal headaches.
- **Local/same-network** (v2) — Bluetooth, multipeer connectivity, mDNS, NFC for fully serverless in-person use. Deferred.

Direct WebRTC peer-to-peer data channels were considered and dropped from the roadmap. The latency benefit over a relay is imperceptible for the message sizes and human-paced interactions involved in planning poker, while the costs (TURN server operation, NAT traversal complexity, iOS WKWebView unreliability, mesh connection overhead) are real. The relay handles all sync.

### Relay Server

Lightweight self-hosted y-websocket server that forwards Yjs CRDT sync messages between clients in the same room. **Content-blind** — it never inspects, parses, or persists vote data, user identity, or round metadata. Messages pass through as opaque binary CRDT updates.

The relay holds a small amount of *access-control and routing* metadata per active room: the internal room UUID, the current room code pointing at it, optional password hash, and (when the room has gone empty) an in-memory snapshot. This is not session content — it is what the relay needs to do its job.

**Ephemeral room snapshots** — when a room goes empty, the relay retains the last Yjs state in memory, keyed by the internal room UUID, with a 24-hour TTL. Returning peers rehydrate from the snapshot even if no other client is currently connected. Snapshots are opaque CRDT blobs, not persisted to disk; a relay restart loses them (accepted v1 trade-off).

### Network Partitions

Handled silently via CRDTs — partitioned groups continue independently and merge on reconnect. No disruptive alerts. Disconnected or unreachable participants are visually distinguished (e.g. greyed out) from connected ones.

## Conflict Resolution

Yjs (CRDT library) for state synchronization. Guarantees all peers converge to the same state regardless of update order. Local persistence via y-indexeddb (PWA) or Capawesome SQLite (native iOS/Android — avoids iOS IndexedDB eviction after 7 days of inactivity).

## Offline Support

The app must work offline. Users can continue interacting with the UI (view past rounds, prepare votes) even without connectivity. Changes sync automatically when back online.

## Host Migration

The session *creator* is the initial host. If the host disconnects, election proceeds as follows: wait a 5-second debounce (most disconnects are transient), then elect the connected peer with the lowest-sorted device ID (lexicographic). If the original host later reconnects, they do **not** reclaim — the newly-elected host keeps the role until they themselves disconnect.

Peer ID is the device identifier from *Identity*. Election happens in the shared Yjs doc; the relay is not involved.

Host responsibilities — manual-reveal trigger, access-mode and password management — are scoped to the current elected host. A subtle crown icon in the participant list surfaces who holds the role.

## UX

Mobile-first design. Desktop adapts up. Target platforms: web browser, iOS, Android. WCAG AAA accessibility compliance — screen readers, keyboard navigation, sufficient contrast. Ease of use is a priority. Dark/light mode follows system preference.

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Angular |
| UI | Ionic |
| Native bridge | Capacitor |
| State/sync | Yjs |
| Sync transport | y-websocket (relay) |
| Local storage | Capawesome SQLite (native), IndexedDB (PWA) |
| Relay server | y-websocket server, Node.js (self-hosted, content-blind) |
| Platforms | PWA + iOS (Capacitor) + Android (Capacitor) |

## Status

Implementation through Phase 6a (PWA polish). Phases 1–4 shipped the scaffold, Yjs doc/CRDT layer, relay sync, multi-client sessions, timer-driven reveal, and host election. Phase 5 added password-protected rooms, share/QR/deep-link join paths, and a Playwright e2e suite. Phase 6a added settings screen, theme picker, reveal animation, haptic wiring, and an accessibility pass. Next: Phase 6b (native iOS build).

A CLI client (`@hnch/cli`, `packages/cli`) ships alongside the mobile/PWA client as a terminal interface for developers and automation. It speaks the same relay protocol with no feature delta. See [`cli.md`](cli.md) for conventions and commands.
