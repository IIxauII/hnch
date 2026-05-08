# ux.md — UX design for hnch v1

Authoritative ref for hnch UX: screen inventory, user flows, per-screen wireframes, interaction patterns, theming. Sibling of [`project.md`](project.md) (what product does) and [`schema.md`](schema.md) (session state shape); `project.md` = *what*, `schema.md` = *state*, this doc = *what user sees and does*.

UX decisions touching architecture cross-linked to governing ADR in [`adr/`](../adr/README.md). Conflicts need UX adjustment or superseding ADR — see [`CLAUDE.md`](../CLAUDE.md) for convention.

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

**iPhone is primary design target.** Mobile-first via Capacitor. Ionic `mode` left at default — auto-detected per platform — iPhone gets iOS rendering, Android/web get Material. Each platform feels native. Wireframes describe iPhone experience; iOS/Material divergences flagged, not overridden.

**Session-first, not navigation-first.** Users open hnch to be in pointing-poker session; rest is infrastructure. Single nav stack (no tabs, no side menu) — no meaningful second destination mid-session. Home = launchpad, not parallel destination.

**Defaults make common path one-tap.** Create room → straight to Lobby with Fibonacci scale, no access control. Every setting has sensible default; config available but never required.

**"Leaving" is reversible.** Per [ADR-0012](../adr/0012-snapshot-policy.md), relay snapshots live 24h. Back-out, app close, or connectivity loss → rejoin without losing seat — `participantId` (per [ADR-0005](../adr/0005-device-identity-capacitor-device-plugin.md)) and vote history persist in Yjs doc. Back button = *navigation*, not *destruction*. Explicit "leave session" / "end session for everyone" in ⋯ menu with destructive confirmation.

**Accessibility, dark mode, safe areas = baseline, not polish.** VoiceOver labels on non-text content (QR codes, card grids). Dark mode follows system pref by default with explicit override. Safe areas via `ion-header` / `ion-footer` — content respects notches, dynamic islands, home indicators.

**Non-goals for v1.** Deliberately out of scope: Team concept from [ADR-0007](../adr/0007-teams-local-only.md) — Teams are device-local saved attendee lists with optional session defaults (scale, name), stored in local preferences; they have no v1 UI and no Yjs presence. Full session history (only single "Jump back in" banner for most recent backed-out session). iPad/landscape layouts (iPhone portrait = design target). Offline session creation (relay assumed reachable at Create time).

---

## 2. App shell & navigation

### Platform mode

Ionic `mode` not set explicitly — per-platform auto-detection. iPhone (Capacitor WebView / mobile Safari) → iOS components, Android → Material, desktop/PWA → Material. No global override, no per-component `mode="ios"` overrides — fix platform-specific issues there instead of forcing look on other.

Rest of doc describes iPhone-first experience. Platform-specific patterns (large titles, swipe-to-go-back, iOS action sheets) noted; Material equivalent = whatever Ionic renders by default.

### Navigation pattern

Single nav stack — no `ion-tabs`, no `ion-menu`. Every screen pushed onto Angular router stack; back nav pops.

**Large titles.** iOS: Ionic renders large title at top of content, collapses into nav bar on scroll — used throughout. Where possible large title replaces duplicated chrome (e.g., room code = Lobby large title). Material: titles render normally in toolbar; visual difference, not structural.

**Swipe-to-go-back** enabled everywhere. iOS = edge-swipe gesture; Material = Ionic equivalent. Leaving session reversible (snapshots live 24h; rejoin via Jump-back-in banner), so accidental swipe safe.

### Nav bar pattern

Every screen with ⋯ menu:

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │
│                                         │
│   Screen title                          │   large title
└─────────────────────────────────────────┘
```

- Left: Ionic platform-appropriate back control (chevron + prev title on iOS, arrow on Material), absent on Home / Onboarding.
- Right: `ion-icon name="ellipsis-horizontal-circle"` → `ion-action-sheet`.
- Large title: primary heading on iOS (collapses on scroll); regular toolbar title on Material.

### Primary action placement

Single primary action (Onboarding Continue, Lobby Start Round, Join Room Join) → `ion-footer` with `ion-toolbar` + `ion-button expand="block" color="primary"`.

Two paired actions (Lobby Re-vote / Next Round, shown after results) → `ion-footer` flex row, primary filled, secondary outlined.

No primary action (Estimating for joiners, Settings) → empty/omitted footer.

### Destructive actions

Leave session, End session for everyone → ⋯ action sheet with `role: 'destructive'` (red text both modes; Ionic handles per-platform rendering). Destructive item tap → `ion-alert` confirmation before commit.

---

## 3. Screen inventory

### Primary screens (v1)

| Screen | Purpose | When shown |
|--------|---------|------------|
| **Onboarding** | Capture display name on first launch | First-ever launch only; never shown again once name set |
| **Home** | Launchpad for Create / Join, rejoin via Jump-back-in banner | Every launch after onboarding |
| **Join Room** | Enter room code, scan QR, or provide password | From Home Join, or invite URL / QR deep link |
| **Lobby** | Pre-round: share invite, see participants, configure settings, start first round; shows inline results after a round is revealed | After Create, Join, or Jump-back-in tap |
| **Estimating** | Pick estimate from scale; see who voted | When host taps Start Round N |
| **Settings** | App prefs: display name, theme, scales, session defaults, relay URL, about | From Home ⋯ → Settings |

### Overlays

| Overlay | Component | Invoked from |
|---------|-----------|--------------|
| iOS share sheet | `Share` plugin (`@capacitor/share`) | Lobby → Share Invite |
| ⋯ action sheet | `ion-action-sheet` | Nav bar ⋯ on Home / Lobby / Estimating / Settings |
| Session settings sheet | `ion-modal` half-sheet (breakpoints `[0, 0.6, 0.95]`) | ⋯ → Session settings on Lobby / Estimating |
| Scale picker | `ion-modal` half-sheet | Session settings → Scale row |
| Access picker | `ion-modal` half-sheet | Session settings → Access row |
| Round-start modal | `ion-modal` half-sheet | Lobby → Start Round N (optional descriptor input) |
| Round descriptor editor | `ion-modal` half-sheet (`app-round-edit-sheet`) | Lobby results → pencil icon on current round results row; Lobby history → pencil icon on a past-round row (host only) |
| Display name editor | `ion-modal` half-sheet | Settings → Display name row |
| Theme picker | `ion-modal` half-sheet | Settings → Theme row |
| Scale picker (settings) | `ion-modal` half-sheet | Settings → Default scale row |
| Custom scale editor | `ion-modal` half-sheet | Scale picker → Create custom scale |
| Session name editor | `ion-modal` half-sheet | Settings → Default session name row |
| Relay URL editor | `ion-modal` half-sheet | Settings → Relay URL row |
| Password prompt | `ion-modal` half-sheet | Home → Create Room (when password-by-default enabled) |
| QR display | `ion-modal` full-screen, dark background | Lobby → Show QR code |
| Voted-participants popover | `ion-popover` | Estimating → tap avatar row |
| Leave-session confirm | `ion-alert` destructive | ⋯ → Leave session |
| End-session-for-all confirm | `ion-alert` destructive | ⋯ → End session for everyone (host only) |
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
  → Optionally adjust Scale, Access
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

### 4.4 Round cycle (Estimating → Lobby → next)

```
Estimating
  → Participants tap cards to vote / change votes (ADR-0013)
  → Avatar row updates in real time (presence, voted-state)
  → Reveal fires when:
      - Host taps Reveal Votes (manual), OR
      - All online participants have voted (unanimous auto-reveal, ADR-0018)
  → All participants navigate to Lobby (results shown inline)

Lobby (post-reveal)
  → Latest round results shown in full (grouped by vote value, voter chips, stats, elapsed time)
  → Below results, past rounds shown as compact history list
  → Host taps:
      - Re-vote: creates new Round with parentRoundId = current, reuses descriptor → Estimating
      - Next Round: opens round-start modal → Estimating
  → Joiners wait (no action buttons; screen updates when host moves on)
```

### 4.5 Back, rejoin, and leave

**Back (graceful disconnect):**

```
User taps back (or swipes back) from Lobby / Estimating
  → WebSocket disconnects; awareness broadcasts offline
  → Navigate to Home
  → Home shows "Jump back in — Room K7P-9MR" banner
    → Tap banner: reconnect to the room, navigate back to whichever screen it's on
    → Ignore banner: fades out when relay snapshot expires (24h)
```

**Leave session (explicit, destructive):**

```
Lobby / Estimating → ⋯ → Leave session
  → Confirmation alert: "Leave this session? You'll need the code to rejoin."
    → Confirm: write `leftAt` + `removedBy = self` to own participant record (ADR-0036),
      disconnect, clear jump-back-in cache, navigate to Home (no banner)
    → Cancel: dismiss alert, stay on current screen
```

Effect on peers: the leaver disappears from active rosters (lobby list, voter denominator, "didn't vote" set) immediately. Their votes in already-revealed rounds remain in round history because `round.votes` references `participantId`, and the raw `participants` map still resolves the displayName.

If the leaver later re-enters via room code, `joinSession` clears `leftAt`/`removedBy` for self — they rejoin as an active participant with their existing record (preserves `joinedAt` and any historical vote attribution).

**Host removes a participant (kick, host only, destructive):**

```
Lobby → swipe-left on a participant row (host only, target is not self)
  → Drawer reveals: [Make host] [Remove]
  → Tap "Remove"
    → Confirmation alert:
        "Remove {name} from session?"
        Body: "They'll be disconnected and won't appear in the active roster.
               Their votes in past rounds stay in the round history."
        Buttons: [Cancel] [Remove (red)]
    → Confirm: write `leftAt` + `removedBy = host` to target's record (ADR-0036),
      close the sliding drawer
      → Target client observes own `leftAt` set with `removedBy !== self`
        → Toast: "Removed by host"
        → Clear jump-back-in cache, navigate to Home
    → Cancel: dismiss alert, drawer stays open until tapped away
```

Discoverability: a one-line muted hint under the participants accordion header for hosts only — "Swipe a row for host actions." Non-hosts see no swipe affordance; rendering the row as a plain `ion-item` (no `ion-item-sliding` wrapper) for non-hosts and self.

Tap on a participant row is a no-op in v1 (handoff has moved to the swipe drawer; tap is reserved for a future "view participant" sheet).

No relay-side ban: a kicked user can re-enter the room code (their `leftAt` is cleared on re-join). For persistent removal the host changes the room password (ADR-0036, ADR-0017).

**End session for everyone (host only, destructive):**

```
⋯ menu (host) → End session for everyone
  → Confirmation alert: "End this session? All participants will be disconnected."
    → Confirm: write session-ended event to doc, all clients navigate to Home (with toast)
    → Cancel: dismiss
```

### 4.6 Edge-case flows

**Host drops during active session:**

```
Host's connection is lost
  → Other clients observe host's awareness going offline
  → 5-second debounce (ADR-0010)
  → Lowest peer-ID elected as new host
  → All clients see a toast: "Alice is now hosting"
  → If former host rejoins within snapshot window: they rejoin as a regular participant
```

**Host reveals with nobody voted:**

```
Host taps Reveal with zero votes
  → Reveal event written to doc
  → All clients navigate to Lobby
  → Lobby results section shows only a "Didn't vote" group with every participant in it
  → Host can tap Re-vote to try again
```

**Invite URL to expired/nonexistent room:**

```
User taps URL whose room code no longer exists (snapshot TTL expired)
  → Relay rejects the join (reason: unknown-room, per auth.ts)
  → Client shows error screen or toast: "This room has expired or no longer exists."
  → User returned to Home
```

---

## 5. Per-screen wireframes

ASCII sketches — communicate structure/hierarchy/component choice, not pixel layout. Portrait iPhone assumed. Nav bar pattern from [§2](#2-app-shell--navigation). Material renders same components with Material defaults; structure identical, chrome differs per mode.

### 5.1 Onboarding

Shown once, first launch (or after data clear). No back button; no ⋯ menu. Sole job: capture display name for `participantId` (per [ADR-0005](../adr/0005-device-identity-capacitor-device-plugin.md)).

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

Continue disabled while input empty/whitespace-only. On tap: name saved to `@capacitor/preferences`, navigates to pending Join URL (if launch trigger) or Home.

### 5.2 Home

Launchpad for every post-onboarding launch. Two primary entries (Create, Join), conditional Jump-back-in banner for most recent backed-out session, ⋯ for Settings/About.

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

- Jump-back-in banner rendered iff non-expired "last backed-out session" in local state (session id, room code, screen snapshot, last-seen timestamp within 24h per [ADR-0012](../adr/0012-snapshot-policy.md)). If relay evicted room, banner shows muted appearance; on tap → toast ("This room has expired") + self-removes.
- ⋯ menu: **Settings**, **About hnch**.

### 5.3 Join Room

From Home Join button, invite URL deep link, or QR scan. Same screen for all three entry modes — difference is pre-population.

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

- Code input: monospace hint, formats `XXX-XXX` live; excludes look-alike chars per [ADR-0008](../adr/0008-room-code-format.md).
- Scan QR opens `@capacitor-mlkit/barcode-scanning` modal camera; on success → code written to input, Join activates.
- Password field materializes inline only after relay confirms code maps to password-protected room (per [ADR-0009](../adr/0009-access-control-relay-tokens.md)).
- Join disabled until code well-formed. On tap: connects to relay; success → Lobby; failure → inline error (invalid, expired, wrong password).

### 5.4 Lobby

Persistent session hub. Lobby serves two roles depending on session state:

1. **Pre-round / between rounds:** Share invite, see participants, configure settings, start the next round.
2. **Post-reveal:** Shows latest round results inline (full grouped cards, voter chips, stats, elapsed time), plus a compact history list of past rounds below. Re-vote and Next Round buttons appear for the host.

After a round is revealed, all participants navigate from Estimating back to Lobby. No separate Revealed screen exists — results live here.

**Lobby (host, pre-round):**

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │  nav bar
│                                         │
│   K7P-9MR                               │  large title = room code
│   Round 1 • Fibonacci                   │  subtitle (settings summary)
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
│   │ 🟢  Bob  (observer)           │     │  viewer — role indicator
│   └───────────────────────────────┘     │
│                                         │
│   .                                     │
├─────────────────────────────────────────┤
│ ┌───────────────────────────────────┐   │
│ │         Start Round 1             │   │  primary action
│ └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Lobby (host, post-reveal — results + history):**

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │  nav bar
│                                         │
│   K7P-9MR                               │
│   Round 3 • Fibonacci                   │
│                                         │
│   Participants (6)                      │  section header
│   ┌───────────────────────────────┐     │
│   │ 👑  You (Xau)                 │     │
│   │ 🟢  Alice  🟢  Bob  🟢  Carol │     │
│   │ 🟢  Eve  (observer)           │     │  viewer — role indicator
│   └───────────────────────────────┘     │
│                                         │
│   ── Round 2 Results ──                 │  results section
│   ┌───────────────────────────────┐     │
│   │ 5    (3 votes)                │     │  ion-item-group
│   │   🟢 Alice  🟢 Bob  🟢 You   │     │  ion-chip row of voters
│   ├───────────────────────────────┤     │
│   │ 8    (2 votes)                │     │
│   │   🟢 Carol  🟢 Dave           │     │
│   ├───────────────────────────────┤     │
│   │ Didn't vote (1)               │     │  muted trailing group (voters + viewers with no entry in round.votes)
│   │   🟢 Eve  (observing)         │     │
│   └───────────────────────────────┘     │
│   ⏱ 0:42                               │  elapsed time
│                                         │
│   ── History ──────────────────         │  past rounds (compact)
│   Round 1: Auth migration               │
│     5×3, 8×1, 13×1 — 0:38              │
│                                         │
│   .                                     │
├─────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────────┐   │  host-only footer row
│ │   Re-vote    │ │   Next Round 3   │   │  outlined / filled
│ └──────────────┘ └──────────────────┘   │
└─────────────────────────────────────────┘
```

**Lobby (joiner):**

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │
│                                         │
│   K7P-9MR                               │
│   Round 1 • Fibonacci                   │
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
│   │ 🟢  Bob  (observer)           │     │  viewer — role indicator
│   └───────────────────────────────┘     │
│                                         │
│   .  (results section appears here      │
│      after a round is revealed;         │
│      no Re-vote / Next Round buttons)   │
└─────────────────────────────────────────┘
```

- Large title = room code — most important info, read aloud in co-located meetings.
- Subtitle summarizes settings (scale). Tapping subtitle opens Session settings sheet (also via ⋯ → **Session settings**). Discoverability affordance, not substitute for menu.
- Show QR = secondary invite for co-located meetings. Opens `ion-modal` with full-screen QR encoding invite URL.
- Participant list: viewers render with an `(observer)` suffix after their name. Voters have no suffix. Role is session-wide and visible in all three Lobby variants (ADR-0020). Participants who have left or been removed (`leftAt` set, ADR-0036) are omitted from this list — their votes still appear in round history below.
- Host-only swipe actions on participant rows: swipe-left reveals **Make host** + **Remove** (ADR-0036, §4.5). Hint copy "Swipe a row for host actions" appears under the participants header for the host. Non-host viewers see no swipe drawer; tap is a no-op.
- Results section (`VoteResultsComponent`): each group = `ion-item-group` with vote value as large heading + `(N votes)` caption. Voters rendered as `ion-chip` row (avatar + name). Trailing muted "Didn't vote" group (all participants — voters and viewers — who have no entry in `round.votes`). Elapsed time shown below groups. If all votes match, a "Consensus!" overlay animates in with haptic feedback and auto-dismisses after 3 s.
- History (`RoundHistoryComponent`): compact one-liner per past revealed round (all revealed rounds except the latest), reverse chronological. Skipped when only one round revealed.
- Footer when results shown (host only): **Re-vote** (reuses descriptor, creates new Round with `parentRoundId` = current, per ADR-0013) and **Next Round N** (opens round-start modal). Joiners see no footer — wait for host.
- ⋯ menu: **Session settings**, **Leave session** (destructive), **End session for everyone** (destructive, host only).

### 5.5 Estimating

Core interaction screen. Every participant sees card grid (voters) or an observer notice (viewers); vote presence public, value hidden until reveal.

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │
│                                         │
│   Round 1                               │  large title
│   API rate-limit middleware             │  descriptor (if present)
│                                         │
│   [● Voter]                             │  role chip — primary (blue) when voter
│                                         │
│   2:14                                  │  elapsed time — large, mono
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
│   ┌─────┐ ┌─────┐                       │
│   │ 13  │ │ 21  │                       │  8 cards (canonical Fibonacci)
│   └─────┘ └─────┘                       │
│                                         │
│   .                                     │
├─────────────────────────────────────────┤
│ ┌───────────────────────────────────┐   │  host-only footer
│ │         Reveal Votes              │   │  expand="block"
│ └───────────────────────────────────┘   │  (hidden for joiners)
└─────────────────────────────────────────┘
```

**Observer variant** (when role = viewer):

```
┌─────────────────────────────────────────┐
│ ←                                  ⋯    │
│                                         │
│   Round 1                               │
│   API rate-limit middleware             │
│                                         │
│   [○ Observing]                         │  role chip — medium (gray) when viewer
│                                         │
│   2:14                                  │
│   ● ● ●       3 of 3 voted              │  denominator = voters only
│                                         │
│                                         │
│   You're observing this round           │  empty-state notice; no card grid
│                                         │
│   .                                     │
└─────────────────────────────────────────┘
```

- Cards = `ion-card` tiles with large numerals. Selecting sets vote + fires `Haptics.impact({ style: 'Light' })`. Selected card gets primary-color border + filled background; others outlined. Re-tap deselects (ADR-0013: vote change allowed until reveal).
- Avatar row = compact "who voted" indicator — grey circle = connected no vote; filled = voted. Tap row → `ion-popover` listing names grouped voted/not-voted.
- Elapsed time counts up from round start. Format: `M:SS`. Uses `font-variant-numeric: tabular-nums` to prevent digit jitter. Auto-reveal fires when all online **voters** have voted (ADR-0018, ADR-0020).
- Role chip (`[● Voter]` / `[○ Observing]`) appears below the round title. Tap toggles between voter and viewer mid-session. Chip color: primary (blue) when voter, medium (gray) when viewer. Distinct aria-labels for screen readers. Switching to viewer hides the card grid and shows the observer notice; switching back to voter restores it.
- Viewers are excluded from the "X of Y voted" denominator and from the unanimous auto-reveal check. If all online participants are viewers, auto-reveal does not fire.
- Only host sees **Reveal Votes** footer. Joiners see empty/no footer.
- ⋯ menu (host): **Session settings**, **Leave session**, **End session for everyone**.
- ⋯ menu (joiner): **Session settings** (read-only), **Leave session**.

### 5.6 Settings

App-level prefs. From Home ⋯ → **Settings**. No session context; safe to navigate mid-session (session state persists on relay).

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
│   Scales                                │
│   ┌───────────────────────────────┐     │
│   │ Default scale    Fibonacci   ›│     │  tap → scale picker
│   └───────────────────────────────┘     │
│                                         │
│   Session Defaults                      │
│   ┌───────────────────────────────┐     │
│   │ Default session name    None ›│     │  tap → session name editor
│   │ Password by default      [ ] │     │  ion-toggle
│   └───────────────────────────────┘     │
│                                         │
│   Advanced                              │
│   ┌───────────────────────────────┐     │
│   │ Relay URL          Default   ›│     │  tap → relay URL editor
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

No ⋯ menu on Settings — nothing destructive. Rows open half-sheet modals (name editor, theme picker) not new routes; Settings = leaf, not hub.

### 5.7 Overlays

#### Session settings (half-sheet modal)

From ⋯ → **Session settings** on Lobby / Estimating, or tapping settings-summary subtitle on Lobby. Host can mutate; joiners read-only.

```
┌─────────────────────────────────────────┐
│        ━━━━                             │  grabber (handle)
│   Session settings                      │
│                                         │
│   ┌───────────────────────────────┐     │
│   │ Session name       [       ] │     │  ion-input, host-only (disabled for joiners)
│   │ Scale          Fibonacci     ›│     │  → scale picker
│   │ Access         Open          ›│     │  → access picker
│   └───────────────────────────────┘     │
│                                         │
│   Joiners see the same sheet without    │  (italic hint shown to host
│   chevrons — values are read-only.      │   only — UI explainer)
│                                         │
│   .                                     │
└─────────────────────────────────────────┘
```

Breakpoints `[0, 0.6, 0.95]` — dismiss by drag down, comfortable view at 60%, near full-screen for pickers.

**Participant roles** — each participant defaults to `voter`. Any participant can toggle their own role to `viewer` (observer) via the role chip on the Estimating screen (see §5.5). Role persists in the Yjs doc for the session duration and survives reconnects. Viewers are excluded from the unanimous auto-reveal denominator; if all online participants are viewers, auto-reveal does not fire. See [ADR-0020](../adr/0020-participant-viewer-voter-role.md).

#### Scale picker (half-sheet)

```
┌─────────────────────────────────────────┐
│        ━━━━                             │
│   Scale                                 │
│                                         │
│   ○ Fibonacci     0 1 2 3 5 8 13 21     │  ion-radio-group
│   ○ T-shirt       XS S M L XL           │
│   ○ Powers of 2   1 2 4 8 16 32 64      │
│   ○ Linear        1 2 3 4 5 6 7 8 9 10  │
│   ○ Risk        Low Medium High Critical│
│                                         │
└─────────────────────────────────────────┘
```

Radio selection commits immediately (no Save button) — iOS picker idiom. Value written to Yjs doc, all peers observe.

#### Access picker (half-sheet)

```
┌─────────────────────────────────────────┐
│        ━━━━                             │
│   Access                                │
│                                         │
│   ● Open           Anyone with the code │
│   ○ Password       Set a shared password│
│                                         │
│   ── if Password selected ──            │
│   ┌───────────────────────────────┐     │
│   │ Password                      │     │
│   └───────────────────────────────┘     │
│                                         │
└─────────────────────────────────────────┘
```

Per [ADR-0009](../adr/0009-access-control-relay-tokens.md), relay enforces access via opaque tokens. Mid-session change does not evict existing participants — only affects future joins.

#### Round-start modal (half-sheet)

Host taps **Start Round N** on Lobby (before any round), or **Next Round** from the Lobby results section after a round is revealed.

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

Descriptor optional (empty valid). Start always enabled. On tap: writes new round to doc; all clients navigate to Estimating.

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

Save disabled when empty/whitespace-only. Change persisted to Preferences immediately; mid-session → awareness state updates, peers see new name via Yjs awareness.

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

**System** = default, respects `prefers-color-scheme`. Light/Dark override system pref app-wide.

#### ⋯ action sheet

From ⋯ nav-bar button. Content varies by screen (see per-screen notes). Ionic per-platform defaults: destructive items red, Cancel always last (iOS visually separated; Material at end of list).

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

Tapping estimate card on Estimating:

1. Immediate visual feedback: primary-color border, filled background, subtle scale-down-then-up press animation (`transform: scale(0.95)` → `scale(1.0)` over 120ms).
2. `Haptics.impact({ style: 'Light' })` fires.
3. Vote written to Yjs doc. Presence (avatar fills on everyone's screen) immediate; *value* hidden until reveal.
4. Re-tap same card = deselect (vote cleared). Tap different card = replace vote. Both allowed before reveal — see [ADR-0013](../adr/0013-round-model-flat-parentroundid.md).

### Reveal animation

When the results section appears in Lobby after reveal: cards enter with 80ms staggered fade-in-and-up (`opacity 0 → 1, translateY 8px → 0`, duration 200ms). Groups render top-down. After last group settles, `Haptics.notification({ type: 'Success' })` fires once — "results final."

### Share sheet

**Share invite** calls `Share.share({ title, text, url })` from `@capacitor/share`:

- `title`: `"Join my hnch session"`
- `text`: `"Room code: K7P-9MR"` (or equivalent)
- `url`: invite URL

Native → iOS share sheet (AirDrop, Messages, Mail, Slack, etc.). Web → browser native share or clipboard copy + toast fallback.

### QR scanning

**Scan QR code** on Join Room opens `@capacitor-mlkit/barcode-scanning` full-screen camera. Successful scan (QR containing hnch invite URL) → code extracted, scanner dismisses, code input auto-populates. Non-hnch content → toast ("That doesn't look like an hnch invite"), stay in scanner.

### QR display

**Show QR code** on Lobby → `ion-modal` (full-screen, dark background) with invite URL as large QR. "Done" dismisses.

### Half-sheet modal dismissal

Three standard dismissal gestures:
- Drag grabber down past lowest breakpoint.
- Tap scrim (region above sheet).
- Tap explicit Cancel / Done where present.

Dismissing unsaved picker discards change (pickers commit on radio selection — "unsaved" state only applies to editors with Save button).

### Swipe-to-go-back

Enabled globally via Ionic default `swipeGesture`. Leaving session reversible ([§1](#1-goals--principles)), accidental swipes safe — Jump-back-in banner on Home to return.

### Destructive confirmation

Destructive actions confirmed via `ion-alert` before committing:

```
Title:   "Leave this session?"
Message: "You'll need the code to rejoin."
Buttons: [Cancel]   [Leave]   (Leave role: destructive)
```

**End session for everyone**: destructive button = **End session**, message: "all participants will be disconnected." No "don't ask again" — destructive actions intentional every time.

### Toast patterns

`ion-toast` for transient system messages:

- Position: `top` (no clash with footer primary-action area).
- Duration: 2000ms informational, 4000ms errors.
- No close button on short toasts; close icon for 4000ms error variant.
- Non-blocking — never prevents user action.

Common toasts: host handoff ("Alice is now hosting"), link copied ("Invite link copied"), room expired ("This room has expired or no longer exists"), scan failure ("That doesn't look like an hnch invite").

### Haptic feedback map

| Event | Haptic |
|-------|--------|
| Vote cast / changed | `impact`, `Light` |
| Host taps Reveal Votes | `impact`, `Medium` |
| Reveal animation completes | `notification`, `Success` |
| Destructive confirm (Leave / End) | `impact`, `Heavy` on confirm tap |
| Unanimous auto-reveal fires | `notification`, `Success` |
| Host handoff toast | `notification`, `Warning` |

Haptics fire via `@capacitor/haptics` on native; web = no-ops (safe stub).

---

## 7. Theming

### Platform mode

Ionic `mode` left at default, auto-detected per platform: iOS on iPhone (Capacitor WebView / mobile Safari), Material on Android/desktop/PWA. No single mode forced globally, no per-component `mode="ios"` overrides. Goal: feels native on each platform, not identical across all. See [§2](#2-app-shell--navigation).

### Palette (v1 placeholder)

Until brand direction set, v1 uses Ionic default palette per platform, untouched. Primary action = `--ion-color-primary`; destructive = default danger red via `role: 'destructive'` and `color="danger"`.

Palette revision (custom brand blue, accent, card grid colors) = future pass driven by style-guide doc once brand direction exists. Not architectural, no ADR needed.

### Dark mode

Follows `prefers-color-scheme` by default via Ionic `.ion-palette-dark` class on `<html>`. Settings → Theme picker provides **System / Light / Dark** overrides; persisted in Preferences, applied at boot before first paint.

### Typography

Ionic per-platform font stack — iOS uses Apple system fonts (`-apple-system, BlinkMacSystemFont, ...`), Material uses Roboto/platform system font. No custom font in v1. Matching OS = the point. Elapsed time display and estimate cards use `font-variant-numeric: tabular-nums` to prevent layout jitter.

### Safe areas

All screens built with `ion-header` / `ion-footer` — Ionic handles safe-area insets for notches, dynamic islands, home indicators automatically. Custom content (card grid, participant list) inside `ion-content`, which also respects insets.

### Liquid Glass / iOS 26 theming (deferred)

`@rdlabo/ionic-theme-ios26` provides iOS 26 Liquid Glass theming. Not adopting in v1 — floor = "looks good and platform-native." Revisit v1.1+ once package stabilizes and minimum iOS version settled; adoption iOS-only, no Material impact.

### Accessibility baseline

- All non-text interactive elements (QR button, estimate cards, avatars, ⋯ button) have explicit `aria-label` / `alt` text.
- Touch targets ≥ 44×44 pt per Apple HIG. Estimate cards in 3-col grid sized so smallest supported iPhone clears this.
- Focus indicators use Ionic default iOS focus rings — not suppressed.
- Motion: reveal stagger and card press animations honor `prefers-reduced-motion` by collapsing to instant transitions.
- Dynamic Type scales text within reason; card numerals intentionally capped for grid readability.

---

## 8. Open UX questions

Acknowledged gaps and deferred decisions. Not blocking v1 but should be answered (or re-deferred) before corresponding feature built.

**Re-vote breadcrumb.** On re-voted round, the Lobby results section doesn’t surface attempt count. `parentRoundId` in doc — could show “Round 2 • re-vote of Round 1.” Deferred; resolve when designing optional session-history view (post-v1).

**Reconnecting banner.** Implemented as `ConnectionStatusBannerComponent` (`packages/client/src/app/shared/connection-status-banner.component.ts`), mounted at the top of `<ion-content>` on Lobby and Estimating. Shown when `DocService.reconnecting()` is true (already debounced ~5 s and gated on first-connect — banner does not flash on initial join). Inline `<div role="status" aria-live="polite">` with a `sync-outline` glyph and copy "Reconnecting…", styled with `--ion-color-warning` tokens (light + dark via Ionic palette). Non-blocking — scrolls with content and never overlays the `ion-footer` primary-action area. On reconnect (falling edge of `reconnecting()`), a transient top `ion-toast` (`color="success"`, `duration="1500"`, message "Reconnected") confirms recovery and self-dismisses. Replaces the placeholder bottom toast that previously lived inline on each page. See [ADR-0025](../adr/0025-reconnect-backoff.md) §8 for the underlying status-signal contract.

**Host-election transition state.** ~~During 5-second debounce ([ADR-0010](../adr/0010-host-election.md)) after host drop, joiners have no host. Show status line (“Waiting for a new host…”) or is 5s gap short enough to skip UI?~~ Resolved (issue #43): no inline status during debounce; instead the post-election toast names the prior host (`"Alice disconnected. Bob is now the host."`), so participants understand what happened once the new host is selected. The 5-second silence is accepted as too short for a useful inline indicator.

**Expired-room error screen.** Dedicated screen vs toast vs inline error on Join Room — currently picked toast + return to Home, but full screen may be warranted if URL deep-link path feels jarring. Revisit after real-device testing.

**Invite URL shape with credentials.** For password-protected rooms, does invite URL embed hint that password required (skip round-trip, show field immediately)? TBD — interacts with [ADR-0009](../adr/0009-access-control-relay-tokens.md) opaque-token model.

**Liquid Glass adoption timeline.** When (if ever) adopt `@rdlabo/ionic-theme-ios26`. See [§7](#7-theming).