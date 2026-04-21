# ux.md — UX design for hnch v1

This document is the authoritative reference for hnch's user experience: screen inventory, user flows, per-screen wireframes, interaction patterns, and theming decisions. It is a sibling of [`project.md`](project.md) (what the product does) and [`schema.md`](schema.md) (the shape of session state); where `project.md` defines *what* and `schema.md` defines *state*, this document defines *what the user sees and does*.

UX decisions that touch architectural or structural concerns are cross-linked to their governing ADR in [`adr/`](adr/README.md). Changes here that would conflict with an ADR need either an adjustment to the UX decision or a superseding ADR — see [`CLAUDE.md`](CLAUDE.md) for the convention.

## Table of contents

1. [Goals & principles](#1-goals--principles)
2. [App shell & navigation](#2-app-shell--navigation)
3. [Screen inventory](#3-screen-inventory)
4. [User flows](#4-user-flows)
5. [Per-screen wireframes](#5-per-screen-wireframes)
6. [Interaction patterns](#6-interaction-patterns)
7. [Theming](#7-theming)
8. [Open UX questions](#8-open-ux-questions)

---

## 1. Goals & principles

**Feel iOS-native everywhere.** hnch is a mobile-first app targeting iPhone via Capacitor. We lock Ionic's `mode` to `'ios'` globally (see [§7 Theming](#7-theming)), so every platform — iPhone, Android, PWA, web — renders iOS-style components. The look is consistent regardless of device; an Android user isn't running a different design.

**Session-first, not navigation-first.** Users open hnch to be in a pointing-poker session; the rest of the app is infrastructure for that. The top-level navigation pattern is a single nav stack (not tabs, not a side menu) because there is no meaningful second destination when you're mid-session. Home is a launchpad, not a parallel destination.

**Defaults make the common path one-tap.** Creating a room drops you straight into the Lobby with Fibonacci scale, no access control, no timer. Every setting has a sensible default; nobody has to configure anything before starting a round. Configuration is available but never required.

**"Leaving" is reversible.** Per [ADR-0012](adr/0012-relay-snapshots-24h-in-memory.md), relay-side session snapshots live for 24 hours. A user who taps back out of a session, closes the app, or loses connectivity can rejoin without losing their seat — their `participantId` (per [ADR-0005](adr/0005-identity-device-id.md)) and vote history persist in the Yjs doc. Because of this, the back button is *navigation*, not *destruction*. Explicit "leave session" and "end session for everyone" actions live in the ⋯ menu and use destructive confirmation patterns.

**Accessibility, dark mode, and safe areas are baseline, not polish.** VoiceOver labels on non-text content (QR codes, card grids). Dark mode follows system preference by default with explicit override. Safe areas handled via `ion-header` / `ion-footer` (not raw layout) so content respects notches, dynamic islands, and home indicators.

**Non-goals for v1.** The following are deliberately out of scope for the first shipping version: the Team concept from [ADR-0007](adr/0007-team-local-only-concept.md) (present in the architecture, no UI in v1), full session history (only a single "Jump back in" banner for the most recent backed-out session), iPad-specific or landscape-first layouts (iPhone portrait is the design target), non-iOS platform-native flavors (Material Design mode), and offline session creation (relay is assumed reachable at Create time).

---

## 2. App shell & navigation

### Mode and platform lock

Ionic is configured with `mode: 'ios'` globally via `provideIonicAngular`:

```ts
bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular({ mode: 'ios' }),
    // ...
  ],
});
```

This forces iOS-style component rendering on all platforms and removes any need for per-component `mode` overrides.

### Navigation pattern

Single nav stack — no tabs (`ion-tabs`), no side menu (`ion-menu`). Every user-visible screen is pushed onto the Angular router stack; back navigation pops it.

**Large titles** are the default iOS convention and we use them throughout. A screen's title appears as a large title at the top of the content area on initial render and collapses into the nav bar on scroll. Where possible, the large title replaces duplicated chrome (e.g., the room code is the Lobby's large title rather than appearing separately in the content).

**Swipe-to-go-back** is enabled everywhere. Because leaving a session is reversible (snapshots live 24h; rejoin via the Jump-back-in banner on Home), an accidental swipe does not lose session state.

### Nav bar pattern

Every screen with a ⋯ menu follows this layout:

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │
│                                         │
│   Screen title                          │   large title
└─────────────────────────────────────────┘
```

- Left: native iOS back button (chevron + previous title), or absent on Home / Onboarding.
- Right: `ion-icon name="ellipsis-horizontal-circle"` button that opens an `ion-action-sheet`.
- Large title: the screen's primary heading, collapses on scroll.

### Primary action placement

Screens with a single primary action (Onboarding's "Continue", Lobby's "Start Round N", Join Room's "Join") use `ion-footer` containing an `ion-toolbar` with an `ion-button expand="block" color="primary"`.

Screens with two paired actions (Revealed's "Re-vote" / "Next Round") use `ion-footer` with a flex row of two `ion-button` components, the primary filled and the secondary outlined.

Screens with no primary action at footer level (Estimating for joiners, Settings) leave the footer empty or omit it entirely.

### Destructive actions

Destructive actions (Leave session, End session for everyone) live in the ⋯ action sheet with `role: 'destructive'` styling (iOS red text). Tapping a destructive menu item fires an `ion-alert` confirmation before the action commits.

---

## 3. Screen inventory

### Primary screens (v1)

| Screen | Purpose | When shown |
|--------|---------|------------|
| **Onboarding** | Capture the user's display name on first launch | First-ever launch only; never shown again once name is set |
| **Home** | Launchpad for Create / Join, and rejoin entry via Jump-back-in banner | Every launch after onboarding |
| **Join Room** | Enter a room code, scan a QR, or (if password required) provide credentials | Pushed from Home's Join button, or when opened via an invite URL / QR deep link |
| **Lobby** | Pre-round: share invite, see participants, configure session settings, start first round | Pushed after Create, after Join, or after "Jump back in" banner tap |
| **Estimating** | Pick an estimate from the scale; see who has voted | Pushed when host taps Start Round N |
| **Revealed** | See the grouped results; choose Re-vote or Next Round | Pushed when reveal fires (manual by host, or timer expiry) |
| **Settings** | App-level preferences: display name, theme, about | Pushed from Home's ⋯ menu → Settings |

### Overlays

| Overlay | Component | Invoked from |
|---------|-----------|--------------|
| iOS share sheet | `Share` plugin (`@capacitor/share`) | Lobby → Share Invite button |
| ⋯ action sheet | `ion-action-sheet` | Nav bar ⋯ button on Home / Lobby / Estimating / Revealed / Settings |
| Session settings sheet | `ion-modal` half-sheet (breakpoints `[0, 0.6, 0.95]`) | ⋯ menu on Lobby / Estimating / Revealed → Session settings |
| Scale picker | `ion-modal` half-sheet | Session settings → Scale row |
| Timer picker | `ion-modal` half-sheet | Session settings → Timer row |
| Access picker | `ion-modal` half-sheet | Session settings → Access row |
| Round-start modal | `ion-modal` half-sheet | Lobby → Start Round N button (when round has optional descriptor input) |
| Display name editor | `ion-modal` half-sheet | Settings → Display name row |
| Theme picker | `ion-modal` half-sheet | Settings → Theme row |
| Voted-participants popover | `ion-popover` | Estimating → tap on the avatar row |
| Leave-session confirm | `ion-alert` with destructive role | ⋯ menu → Leave session |
| End-session-for-all confirm | `ion-alert` with destructive role | ⋯ menu → End session for everyone (host only) |
| Toast (host changed, link copied, etc.) | `ion-toast`, `position: 'top'`, duration 2000ms | Various system events |

---

## 4. User flows

### 4.1 First-run onboarding

```
App launch (no stored display name)
  → Onboarding screen
    → User types display name
    → Tap Continue
      → Name persisted to Capacitor Preferences
      → If pending-join-URL was the launch trigger:
          → Navigate to Join Room with code pre-filled
      → Else:
          → Navigate to Home
```

### 4.2 Create room → Lobby → first round

```
Home
  → Tap Create Room
    → Client generates participantId from deviceId (ADR-0005)
    → Client creates Yjs doc with default settings
    → Client connects to relay; relay mints the room code (ADR-0008)
    → Navigate to Lobby (as host)

Lobby (host)
  → Optionally adjust Scale, Timer, Access
  → Share invite (share sheet) and/or read code aloud
  → Wait for participants (appear in list as they connect)
  → Tap Start Round 1
    → Round-start modal opens
    → Host optionally types a descriptor
    → Tap Start
      → Writes Round 1 to Yjs doc, pushes Estimating
```

### 4.3 Join room — three entry paths

**Via invite URL** (most common for remote teams):

```
User taps invite URL in Messages/Slack/email
  → App launches (or foregrounds) via universal link handler
  → If no display name yet: show Onboarding, stash pending join
  → Else: Navigate to Join Room with code pre-filled
    → If room is public: auto-attempt connect → Lobby
    → If room requires password: show password field inline, wait for Join tap
```

**Via QR code** (co-located meetings):

```
Home
  → Tap Join Room
    → Navigate to Join Room
    → Tap Scan QR code
      → Capacitor BarcodeScanner opens camera view
      → User scans → code captured
      → Auto-populate code input
      → Continue as URL flow from "auto-attempt connect"
```

**Via manual entry** (fallback):

```
Home
  → Tap Join Room
    → Navigate to Join Room
    → User types 6-character code
    → Tap Join
      → Same as URL flow from "auto-attempt connect"
```

### 4.4 Round cycle (Estimating → Revealed → next)

```
Estimating
  → Participants tap cards to vote / change votes (ADR-0013)
  → Avatar row updates in real time (presence, voted-state)
  → Reveal fires when:
      - Host taps Reveal Votes (manual), OR
      - Timer expires (host's client writes the reveal event per ADR-0011)
  → Navigate to Revealed (all participants simultaneously)

Revealed
  → Results shown grouped by vote value
  → Host taps:
      - Re-vote: creates new Round with parentRoundId = current, reuses descriptor → Estimating
      - Next Round: opens round-start modal → Estimating
  → Joiners wait (no action buttons; screen updates when host moves on)
```

### 4.5 Back, rejoin, and leave

**Back (graceful disconnect):**

```
User taps back (or swipes back) from Lobby / Estimating / Revealed
  → WebSocket disconnects; awareness broadcasts offline
  → Navigate to Home
  → Home shows "Jump back in — Room K7P-9MR" banner
    → Tap banner: reconnect to the room, navigate back to whichever screen it's on
    → Ignore banner: fades out when relay snapshot expires (24h)
```

**Leave session (explicit, destructive):**

```
Lobby / Estimating / Revealed → ⋯ → Leave session
  → Confirmation alert: "Leave this session? You'll need the code to rejoin."
    → Confirm: remove local participant entry, disconnect, navigate to Home (no banner)
    → Cancel: dismiss alert, stay on current screen
```

**End session for everyone (host only, destructive):**

```
⋯ menu (host) → End session for everyone
  → Confirmation alert: "End this session? All participants will be disconnected."
    → Confirm: write session-ended event to doc, all clients navigate to Home (with toast)
    → Cancel: dismiss
```

### 4.6 Edge-case flows

**Host drops during an active session:**

```
Host's connection is lost
  → Other clients observe host's awareness going offline
  → 5-second debounce (ADR-0010)
  → Lowest peer-ID elected as new host
  → All clients see a toast: "Alice is now hosting"
  → If former host rejoins within snapshot window: they rejoin as a regular participant
```

**Round times out with nobody voted:**

```
Timer expires during Estimating
  → Reveal event written to doc (ADR-0011)
  → All clients navigate to Revealed
  → Revealed shows only a "Didn't vote" group with every participant in it
  → Host can tap Re-vote to try again
```

**Invite URL to an expired or nonexistent room:**

```
User taps URL whose room code no longer exists (snapshot TTL expired)
  → Relay rejects the join (reason: unknown-room, per auth.ts)
  → Client shows error screen or toast: "This room has expired or no longer exists."
  → User returned to Home
```

---

## 5. Per-screen wireframes

Wireframes below are ASCII sketches — they communicate structure, hierarchy, and component choice, not pixel layout. Every wireframe assumes portrait iPhone, `mode: 'ios'`, and the nav bar pattern from [§2](#2-app-shell--navigation).

### 5.1 Onboarding

Shown once, on first launch (or after a user clears app data). No back button; no ⋯ menu. The sole job is to capture a display name so it can be attached to the `participantId` (per [ADR-0005](adr/0005-identity-device-id.md)).

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│   Welcome to hnch                       │  large title
│                                         │
│   Pick a name your team will see        │  body text
│   next to your votes.                   │
│                                         │
│   ┌───────────────────────────────┐     │
│   │ Display name                  │     │  ion-input (filled)
│   └───────────────────────────────┘     │
│                                         │
│   You can change this later in          │  small helper text
│   Settings.                             │
│                                         │
│   .                                     │
│   .                                     │
├─────────────────────────────────────────┤
│ ┌───────────────────────────────────┐   │
│ │           Continue                │   │  ion-footer > ion-button
│ └───────────────────────────────────┘   │  expand="block" color="primary"
└─────────────────────────────────────────┘
```

Continue is disabled while the input is empty or whitespace-only. On tap: name is saved to `@capacitor/preferences`, and the app navigates either to a pending Join URL (if that's what triggered launch) or to Home.

### 5.2 Home

Launchpad for every subsequent launch. Two primary entry points (Create, Join), plus the conditional "Jump back in" banner for the most recent backed-out session, plus ⋯ for Settings and About.

```
┌─────────────────────────────────────────┐
│                                     ⋯   │  nav bar (no back button)
│                                         │
│   hnch                                  │  large title
│                                         │
│   ┌───────────────────────────────┐     │
│   │  ⤴  Jump back in              │     │  ion-card (conditional)
│   │     Room K7P-9MR • 4 people   │     │  tap → reconnect + nav to
│   │     Estimating                │     │  current screen of session
│   └───────────────────────────────┘     │
│                                         │
│   ┌───────────────────────────────┐     │
│   │  +  Create Room               │     │  ion-item button
│   │     Start a new session       │     │
│   └───────────────────────────────┘     │
│                                         │
│   ┌───────────────────────────────┐     │
│   │  →  Join Room                 │     │  ion-item button
│   │     Enter a code or scan QR   │     │
│   └───────────────────────────────┘     │
│                                         │
│   .                                     │
│   .                                     │
└─────────────────────────────────────────┘
```

- Jump-back-in banner is rendered iff there's a non-expired "last backed-out session" in local state (session id, room code, screen snapshot, last-seen timestamp within 24h per [ADR-0012](adr/0012-relay-snapshots-24h-in-memory.md)). If the relay has since evicted the room, the banner shows a muted appearance and, on tap, surfaces a toast ("This room has expired") and removes itself.
- ⋯ menu items: **Settings**, **About hnch**.

### 5.3 Join Room

Reached from Home's Join Room button, from an invite URL deep link, or from a QR scan. The same screen serves all three entry modes — the difference is what's pre-populated.

```
┌─────────────────────────────────────────┐
│ ←                                       │  nav bar, back chevron
│                                         │
│   Join a Room                           │  large title
│                                         │
│   ┌───────────────────────────────┐     │
│   │ Room code                     │     │  ion-input
│   │ K 7 P - 9 M R                 │     │  6-char formatted
│   └───────────────────────────────┘     │  (auto-uppercased)
│                                         │
│   ┌───────────────────────────────┐     │
│   │ 📷  Scan QR code              │     │  ion-item button
│   └───────────────────────────────┘     │  opens BarcodeScanner
│                                         │
│   ── if room requires password ──       │
│   ┌───────────────────────────────┐     │
│   │ Password                      │     │  ion-input type="password"
│   └───────────────────────────────┘     │  appears after code
│                                         │  validates as protected
│   .                                     │
│   .                                     │
├─────────────────────────────────────────┤
│ ┌───────────────────────────────────┐   │
│ │            Join                   │   │  primary action
│ └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

- Code input uses a monospace hint style and formats as `XXX-XXX` live; excludes look-alike characters per [ADR-0008](adr/0008-room-codes.md).
- Scan QR opens `@capacitor-mlkit/barcode-scanning` in a modal camera view; on a successful scan the code is written into the input and the Join button becomes active.
- Password field materializes inline only after the relay responds that the entered code maps to a password-protected room (per [ADR-0009](adr/0009-access-control.md)). For invite-token URLs the token is consumed silently with no extra input.
- Join is disabled until the code is well-formed. On tap: connects to the relay; on success, pushes Lobby; on failure, shows an inline error (invalid, expired, wrong password).

### 5.4 Lobby

The pre-round holding room. Two variants — host vs. joiner — differ in who can mutate settings and who has the Start button.

**Lobby (host):**

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │  nav bar
│                                         │
│   K7P-9MR                               │  large title = room code
│   Round 1 • Fibonacci • No timer        │  subtitle (settings summary)
│                                         │
│   ┌───────────────────────────────┐     │
│   │ 📤  Share invite              │     │  ion-item button
│   │                               │     │  → iOS share sheet
│   └───────────────────────────────┘     │
│                                         │
│   ┌───────────────────────────────┐     │
│   │ ▤▤▤  Show QR code             │     │  ion-item button
│   │                               │     │  → QR modal
│   └───────────────────────────────┘     │
│                                         │
│   Participants (3)                      │  section header
│   ┌───────────────────────────────┐     │
│   │ 👑  You (Xau)                 │     │  host badge
│   │ 🟢  Alice                     │     │  online
│   │ 🟢  Bob                       │     │
│   └───────────────────────────────┘     │
│                                         │
│   .                                     │
├─────────────────────────────────────────┤
│ ┌───────────────────────────────────┐   │
│ │         Start Round 1             │   │  primary action
│ └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Lobby (joiner):**

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │
│                                         │
│   K7P-9MR                               │
│   Round 1 • Fibonacci • No timer        │
│                                         │
│   Waiting for Xau to start the round…   │  status line (italic, muted)
│                                         │
│   ┌───────────────────────────────┐     │
│   │ 📤  Share invite              │     │
│   └───────────────────────────────┘     │
│                                         │
│   Participants (3)                      │
│   ┌───────────────────────────────┐     │
│   │ 👑  Xau                       │     │
│   │ 🟢  You (Alice)               │     │
│   │ 🟢  Bob                       │     │
│   └───────────────────────────────┘     │
│                                         │
│   .                                     │
└─────────────────────────────────────────┘
```

- Large title is the room code because it's the single most important piece of information in this screen — it's what gets read aloud in co-located meetings.
- Subtitle summarizes session settings at a glance (scale, timer, access). Tapping the subtitle opens the Session settings sheet (also reachable via ⋯ menu → **Session settings**). This is a discoverability affordance, not a substitute for the menu entry.
- Show QR code is a secondary invite path for co-located meetings where the inviter doesn't want to open the share sheet. It opens an `ion-modal` with a full-screen QR encoding the invite URL.
- ⋯ menu items: **Session settings**, **Leave session** (destructive), **End session for everyone** (destructive, host only).

### 5.5 Estimating

The core interaction screen. Every participant sees the card grid; presence of a vote is public, the value is hidden until reveal.

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │
│                                         │
│   Round 1                               │  large title
│   API rate-limit middleware             │  descriptor (if present)
│                                         │
│   2:14                                  │  timer (if enabled) — large,
│                                         │    monospaced, muted red <30s
│   ● ● ● ○ ○   3 of 5 voted              │  avatar row — filled = voted
│                                         │  tap row → popover of voters
│                                         │
│   Pick your estimate                    │  section header
│                                         │
│   ┌─────┐ ┌─────┐ ┌─────┐               │
│   │  0  │ │  1  │ │  2  │               │  ion-card grid 3-col
│   └─────┘ └─────┘ └─────┘               │
│   ┌─────┐ ┌─────┐ ┌─────┐               │
│   │  3  │ │  5  │ │  8  │               │
│   └─────┘ └─────┘ └─────┘               │
│   ┌─────┐ ┌─────┐ ┌─────┐               │
│   │ 13  │ │ 21  │ │  ?  │               │
│   └─────┘ └─────┘ └─────┘               │
│   ┌─────┐                               │
│   │ ☕  │                               │  coffee (pass)
│   └─────┘                               │
│                                         │
│   .                                     │
├─────────────────────────────────────────┤
│ ┌───────────────────────────────────┐   │  host-only footer
│ │         Reveal Votes              │   │  expand="block"
│ └───────────────────────────────────┘   │  (hidden for joiners)
└─────────────────────────────────────────┘
```

- Cards are `ion-card` tiles with large numerals. Selecting a card sets your vote (and fires `Haptics.impact({ style: 'Light' })`). The selected card shows a primary-color border and a filled background; other cards remain outlined. Tapping the selected card again deselects (ADR-0013: vote change allowed until reveal).
- The avatar row at the top is a compact "who has voted" indicator — grey circle = connected, no vote; filled circle = voted. Tapping the row opens an `ion-popover` listing names grouped by voted / not-voted.
- Timer display is only rendered when the session has a timer configured. Format: `M:SS` above 60 seconds, `0:SS` below. Turns subtle red in the final 30 seconds. Font is the iOS monospaced variant (`font-variant-numeric: tabular-nums`) to prevent digit jitter.
- Only the host sees the **Reveal Votes** footer button. Joiners see an empty footer area (or no footer at all) and wait.
- ⋯ menu items (host): **Session settings**, **Leave session**, **End session for everyone**.
- ⋯ menu items (joiner): **Session settings** (read-only), **Leave session**.

### 5.6 Revealed

Results appear all at once; the ordering is grouped by vote value descending by count, with ties broken by value ascending.

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │
│                                         │
│   Round 1 Results                       │  large title
│   API rate-limit middleware             │  descriptor (if present)
│                                         │
│   ┌───────────────────────────────┐     │
│   │ 5    (3 votes)                │     │  ion-item-group
│   │   🟢 Alice  🟢 Bob  🟢 Carol  │     │  ion-chip row of voters
│   ├───────────────────────────────┤     │
│   │ 3    (1 vote)                 │     │
│   │   🟢 You                      │     │
│   ├───────────────────────────────┤     │
│   │ 8    (1 vote)                 │     │
│   │   🟢 Xau                      │     │
│   ├───────────────────────────────┤     │
│   │ ☕   (1 pass)                 │     │
│   │   🟢 Dave                     │     │
│   └───────────────────────────────┘     │
│                                         │
│   .                                     │
├─────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────────┐   │  host-only footer row
│ │   Re-vote    │ │   Next Round     │   │  outlined / filled
│ └──────────────┘ └──────────────────┘   │
└─────────────────────────────────────────┘
```

- Each group is an `ion-item-group` with the vote value as a large heading and `(N votes)` as a caption. Beneath it, the voters are rendered as an `ion-chip` row (avatar + name). This scales naturally from 2 people to 20+ without grid reflow weirdness.
- Non-voters (timer expiry case) appear as a trailing group labeled **Didn't vote** with a muted style, so the dominant visual is still the actual vote distribution.
- Footer buttons only render for the host. **Re-vote** reuses the descriptor and creates a new Round with `parentRoundId` set to this round (ADR-0013). **Next Round** opens the round-start modal fresh (no parent, no descriptor prefilled).
- Joiners see no footer — they wait for the host to decide the next step.

### 5.7 Settings

App-level preferences. Reached from Home's ⋯ menu → **Settings**. No session context; safe to navigate to mid-session because your session state persists on the relay.

```
┌─────────────────────────────────────────┐
│ ←                                       │  back to Home
│                                         │
│   Settings                              │  large title
│                                         │
│   Profile                               │  section header
│   ┌───────────────────────────────┐     │
│   │ Display name            Xau  ›│     │  ion-item with detail
│   └───────────────────────────────┘     │  tap → name editor sheet
│                                         │
│   Appearance                            │
│   ┌───────────────────────────────┐     │
│   │ Theme              System    ›│     │  tap → theme picker
│   └───────────────────────────────┘     │
│                                         │
│   About                                 │
│   ┌───────────────────────────────┐     │
│   │ Version              1.0.0    │     │  no chevron (read-only)
│   │ Open source licenses         ›│     │
│   │ Privacy                      ›│     │
│   └───────────────────────────────┘     │
│                                         │
│   .                                     │
└─────────────────────────────────────────┘
```

No ⋯ menu on Settings — there's nothing destructive to hide. Rows open half-sheet modals (name editor, theme picker) rather than pushing new routes; Settings is a leaf, not a hub.

### 5.8 Overlays

#### Session settings (half-sheet modal)

Invoked from ⋯ → **Session settings** on Lobby / Estimating / Revealed, or by tapping the settings-summary subtitle on Lobby. Host can mutate; joiners see read-only.

```
┌─────────────────────────────────────────┐
│        ━━━━                             │  grabber (handle)
│   Session settings                      │
│                                         │
│   ┌───────────────────────────────┐     │
│   │ Scale          Fibonacci     ›│     │  → scale picker
│   │ Timer          None          ›│     │  → timer picker
│   │ Access         Open          ›│     │  → access picker
│   └───────────────────────────────┘     │
│                                         │
│   Joiners see the same sheet without    │  (italic hint shown to host
│   chevrons — values are read-only.      │   only — UI explainer)
│                                         │
│   .                                     │
└─────────────────────────────────────────┘
```

Breakpoints `[0, 0.6, 0.95]` so the user can dismiss by dragging down, view comfortably at 60%, or expand nearly full-screen for the pickers.

#### Scale picker (half-sheet)

```
┌─────────────────────────────────────────┐
│        ━━━━                             │
│   Scale                                 │
│                                         │
│   ○ Fibonacci     0 1 2 3 5 8 13 21 ?  │  ion-radio-group
│   ● Modified Fib  0 ½ 1 2 3 5 8 13 ?   │
│   ○ T-shirt       XS S M L XL XXL ?     │
│   ○ Powers of 2   1 2 4 8 16 32 64 ?    │
│                                         │
└─────────────────────────────────────────┘
```

Selecting a radio commits immediately (no Save button) — this is the iOS picker idiom. Committed value is written to the Yjs doc, which all peers observe.

#### Timer picker (half-sheet)

```
┌─────────────────────────────────────────┐
│        ━━━━                             │
│   Timer                                 │
│                                         │
│   ○ None                                │
│   ○ 30 seconds                          │
│   ● 1 minute                            │
│   ○ 2 minutes                           │
│   ○ 3 minutes                           │
│   ○ 5 minutes                           │
│                                         │
└─────────────────────────────────────────┘
```

Timer is session-level and applies to every subsequent round (per our decision earlier). Changing it mid-round does not affect the running timer — the change takes effect at the next Start Round.

#### Access picker (half-sheet)

```
┌─────────────────────────────────────────┐
│        ━━━━                             │
│   Access                                │
│                                         │
│   ● Open           Anyone with the code │
│   ○ Password       Set a shared password│
│   ○ Invite only    Single-use links     │
│                                         │
│   ── if Password selected ──            │
│   ┌───────────────────────────────┐     │
│   │ Password                      │     │
│   └───────────────────────────────┘     │
│                                         │
└─────────────────────────────────────────┘
```

Per [ADR-0009](adr/0009-access-control.md), the relay enforces access via opaque tokens. Changing this mid-session does not evict existing participants — it only affects future joins.

#### Round-start modal (half-sheet)

Invoked by the host tapping **Start Round N** on Lobby, or **Next Round** on Revealed.

```
┌─────────────────────────────────────────┐
│        ━━━━                             │
│   Start Round 2                         │
│                                         │
│   ┌───────────────────────────────┐     │
│   │ What are you estimating?      │     │  optional descriptor
│   │ (e.g., Login redesign)        │     │
│   └───────────────────────────────┘     │
│                                         │
│   This will appear on everyone's        │
│   Estimating screen.                    │
│                                         │
│   ┌───────────────────────────────┐     │
│   │            Start              │     │
│   └───────────────────────────────┘     │
└─────────────────────────────────────────┘
```

Descriptor is optional (empty is valid). Start is always enabled. On tap: writes the new round to the doc; all clients navigate to Estimating.

#### Display name editor (half-sheet)

```
┌─────────────────────────────────────────┐
│        ━━━━                             │
│   Display name                          │
│                                         │
│   ┌───────────────────────────────┐     │
│   │ Xau                           │     │  pre-filled with current
│   └───────────────────────────────┘     │
│                                         │
│   This is the name your team will see   │
│   next to your votes.                   │
│                                         │
│   ┌───────────────────────────────┐     │
│   │            Save               │     │
│   └───────────────────────────────┘     │
└─────────────────────────────────────────┘
```

Save is disabled when empty or whitespace-only. Change is persisted to Preferences immediately; if the user is mid-session, their awareness state updates and peers see the new name via Yjs awareness.

#### Theme picker (half-sheet)

```
┌─────────────────────────────────────────┐
│        ━━━━                             │
│   Theme                                 │
│                                         │
│   ● System                              │
│   ○ Light                               │
│   ○ Dark                                │
│                                         │
└─────────────────────────────────────────┘
```

**System** is the default and respects `prefers-color-scheme`. Explicit Light / Dark overrides the system preference app-wide.

#### ⋯ action sheet

Invoked by tapping the ⋯ nav-bar button. Content varies by screen (see per-screen notes above for which items appear where). iOS action sheet styling: destructive items in red, Cancel always present as the last item.

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│                                         │
│  ┌────────────────────────────────┐     │
│  │ Session settings               │     │
│  ├────────────────────────────────┤     │
│  │ Leave session          (red)   │     │  role: destructive
│  ├────────────────────────────────┤     │
│  │ End session for everyone (red) │     │  host only
│  └────────────────────────────────┘     │
│  ┌────────────────────────────────┐     │
│  │ Cancel                         │     │  role: cancel
│  └────────────────────────────────┘     │
└─────────────────────────────────────────┘
```

---

## 6. Interaction patterns

### Card selection and vote change

Tapping an estimate card on Estimating:

1. Immediate visual feedback: the card gets a primary-color border, filled background, and a subtle scale-down-then-up press animation (`transform: scale(0.95)` → `scale(1.0)` over 120ms).
2. `Haptics.impact({ style: 'Light' })` fires.
3. The vote is written to the Yjs doc. Presence (your avatar fills in on everyone's screen) is immediate; the *value* is hidden until reveal.
4. Tapping the same card again deselects (vote cleared). Tapping a different card replaces the vote. Both are allowed any time before reveal — see [ADR-0013](adr/0013-rounds-lineage.md).

### Reveal animation

On transition to Revealed, cards enter with an 80 ms staggered fade-in-and-up (`opacity 0 → 1, translateY 8px → 0`, duration 200 ms). Groups render top-down. After the last group settles, `Haptics.notification({ type: 'Success' })` fires once, signaling "results are final."

### Share sheet

Tapping **Share invite** calls `Share.share({ title, text, url })` from `@capacitor/share`. Content:

- `title`: `"Join my hnch session"`
- `text`: `"Room code: K7P-9MR"` (or equivalent)
- `url`: the invite URL

On native, this produces the iOS share sheet with AirDrop, Messages, Mail, Slack, etc. On web, it falls back to the browser's native share or (if unavailable) copies the URL to clipboard and shows a toast.

### QR scanning

Tapping **Scan QR code** on Join Room opens `@capacitor-mlkit/barcode-scanning` in full-screen camera mode. On a successful scan (QR containing an hnch invite URL), the code is extracted, the scanner dismisses, and the code input auto-populates. If the scanned content is not an hnch URL, show a toast ("That doesn't look like an hnch invite") and stay in the scanner.

### QR display

Tapping **Show QR code** on Lobby opens an `ion-modal` (not half-sheet — full-screen, dark background) with the invite URL encoded as a large QR. A "Done" button dismisses.

### Half-sheet modal dismissal

All half-sheets accept the three standard dismissal gestures:
- Drag the grabber down past the lowest breakpoint.
- Tap the scrim (region above the sheet).
- Tap an explicit Cancel / Done button where present.

Dismissing an unsaved picker discards the change (pickers commit on radio selection, so there is no "unsaved" state — this only applies to editors with a Save button).

### Swipe-to-go-back

Enabled globally via Ionic's default `swipeGesture`. Because leaving a session is reversible ([§1](#1-goals--principles)), accidental swipes on Lobby / Estimating / Revealed do not destroy session state — the user can tap the Jump-back-in banner on Home to return.

### Destructive confirmation

Any destructive action (Leave session, End session for everyone) is confirmed via `ion-alert` before committing. Alert structure:

```
Title:   "Leave this session?"
Message: "You'll need the code to rejoin."
Buttons: [Cancel]   [Leave]   (Leave role: destructive)
```

For **End session for everyone**: the destructive button is **End session** and the message calls out that "all participants will be disconnected." No "don't ask again" option — destructive actions should be intentional every time.

### Toast patterns

`ion-toast` is used for transient system messages. Conventions:

- Position: `top` (so it doesn't clash with the footer primary-action area).
- Duration: 2000 ms for informational, 4000 ms for errors.
- No close button on short toasts; a close icon for the 4000 ms error variant.
- Non-blocking — toasts never prevent user action.

Common toasts: host handoff ("Alice is now hosting"), link copied ("Invite link copied"), room expired ("This room has expired or no longer exists"), scan failure ("That doesn't look like an hnch invite").

### Haptic feedback map

| Event | Haptic |
|-------|--------|
| Vote cast / changed | `impact`, `Light` |
| Host taps Reveal Votes | `impact`, `Medium` |
| Reveal animation completes | `notification`, `Success` |
| Destructive confirm (Leave / End) | `impact`, `Heavy` on confirm tap |
| Timer reaches the final 10 seconds | `impact`, `Light` once, at t-10s |
| Timer expires | `notification`, `Warning` |
| Host handoff toast | `notification`, `Warning` |

Haptics fire via `@capacitor/haptics` on native; on web they are no-ops (the API is a safe stub).

---

## 7. Theming

### Mode lock

Ionic's `mode` is set to `'ios'` globally via `provideIonicAngular({ mode: 'ios' })` at bootstrap. This is enforced centrally — no per-component `mode="ios"` overrides — and it means the app looks identical across iPhone, Android, PWA, and web. See [§2](#2-app-shell--navigation) for the bootstrap snippet.

### Palette (v1 placeholder)

Until brand direction is set, v1 uses Ionic's default iOS palette untouched. The primary action color is Ionic's default `--ion-color-primary` blue; destructive actions use the default iOS red via the `role: 'destructive'` property on action-sheet items and button `color="danger"` in alerts.

A palette revision (custom brand blue, accent, card grid colors) is a future pass and should be driven by a small style-guide doc once brand direction exists. Palette changes are *not* architectural and do not require an ADR.

### Dark mode

Dark mode follows `prefers-color-scheme` by default, via Ionic's `.ion-palette-dark` class toggled at the `<html>` level. The Settings → Theme picker provides explicit **System / Light / Dark** overrides; the chosen value is persisted in Preferences and applied at app boot before the first paint.

### Typography

Ionic's iOS mode already uses the system font stack (`-apple-system, BlinkMacSystemFont, ...`). We do not ship a custom font in v1 — matching the OS is the entire point of `mode: 'ios'`. Numerals in the timer display and on estimate cards use `font-variant-numeric: tabular-nums` to prevent layout jitter during countdowns and reveal.

### Safe areas

All screens are built with `ion-header` and `ion-footer` rather than raw CSS — Ionic handles safe-area insets for notches, dynamic islands, and home indicators automatically. Custom content (the card grid, the participant list) goes inside `ion-content`, which also respects insets.

### Liquid Glass / iOS 26 theming (deferred)

The community package `@rdlabo/ionic-theme-ios26` provides iOS 26-style Liquid Glass theming on top of Ionic's iOS mode. We are *not* adopting it in v1 — our floor is "looks good and iOS-native on iOS 17+." Revisit for v1.1+ once the package stabilizes and our minimum-supported iOS version is settled.

### Accessibility baseline

- All non-text interactive elements (QR button, estimate cards, avatars, ⋯ button) have explicit `aria-label` / `alt` text.
- Touch targets are ≥ 44×44 pt per Apple HIG. Estimate cards in the 3-column grid are sized so that even on the smallest supported iPhone the tap target clears this.
- Focus indicators use Ionic's default iOS focus rings — we do not suppress them.
- Motion preferences are respected: the reveal stagger and card press animations honor `prefers-reduced-motion` by collapsing to instant transitions.
- Dynamic Type scales text within reason; the card numerals are intentionally capped so they stay readable in the grid.

---

## 8. Open UX questions

These are acknowledged gaps and deferred decisions. They are not blocking v1 implementation but should be answered (or explicitly re-deferred) before the corresponding feature is built.

**Consensus indicator on Revealed.** When all votes match, should we surface a celebratory state (checkmark, "Consensus!" banner, distinct haptic)? Deferred — we'll see real usage first before adding ornament.

**Re-vote breadcrumb.** On a re-voted round, the Revealed screen currently doesn't surface that this is the second (or third) attempt on a story. `parentRoundId` is in the doc — we could show "Round 2 • re-vote of Round 1" or similar. Deferred; resolve when we design the optional session-history view (post-v1).

**Reconnecting banner.** During a momentary disconnect, we should probably show a non-blocking banner ("Reconnecting…") above content. Not yet designed — tracks with how we wire y-websocket's reconnection events.

**Host-election transition state.** During the 5-second debounce ([ADR-0010](adr/0010-host-election.md)) after a host drop, joiners briefly have no host. Do we show a status line ("Waiting for a new host…"), or is the 5-second gap short enough to skip the UI? Resolve during implementation.

**Expired-room error screen.** A dedicated screen vs. a toast vs. an inline error on Join Room — we've picked toast + return to Home, but a full screen may be warranted if the URL-deep-link path feels jarring. Revisit after first testing on real devices.

**Timer display at low durations.** Current format is `M:SS` above 60s, `0:SS` below. Do we switch to a large center-screen countdown in the final 10 seconds, or keep it inline? Current thinking: keep inline, add a haptic at t-10s.

**Invite URL shape with credentials.** For password-protected rooms, does the invite URL embed a hint that a password is required (so the Join Room screen can skip the round-trip and show the field immediately)? TBD — decision interacts with [ADR-0009](adr/0009-access-control.md)'s opaque-token model.

**Liquid Glass adoption timeline.** When (if ever) we adopt `@rdlabo/ionic-theme-ios26`. See [§7](#7-theming).

**Round-times-out-with-nobody-voted.** Currently handled as "Revealed with only a Didn't-vote group." Is that the right UX, or should we skip reveal and offer a direct re-start? Revisit with real usage.

**Schema implications of this document.**

This document commits us to two schema-level decisions that need to be reflected in [`schema.md`](schema.md):

1. **Timer is session-level, not per-round.** `timerDurationMs` belongs on the session settings object and applies to every round, not to individual rounds. (See also ADR-0011's phrasing "configurable per round" — that line pre-dates this UX decision and should be corrected via minor edit, or superseded by a new ADR if we decide the phrasing is load-bearing.)
2. **Rounds have an optional descriptor.** Each round object should carry `description: string | null` (free-text, ≤ ~200 chars, set at round start via the round-start modal).

Neither is architecturally novel — these are shape adjustments, not new concepts — so they can land as a schema.md edit with a brief note, no new ADR required.
