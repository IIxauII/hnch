# ux.md — UX flows & interaction for hnch v1

Authoritative ref for hnch user flows and interaction patterns. Sibling of [`project.md`](project.md) (what product does) and [`schema.md`](schema.md) (session state shape).

This doc covers *what the user does* — flows between states and the micro-interactions inside them. Screen layouts, wireframes, and theming live elsewhere (or in code).

UX decisions touching architecture cross-linked to governing ADR in [`adr/`](../adr/README.md). Conflicts need UX adjustment or superseding ADR — see [`CLAUDE.md`](../CLAUDE.md) for convention.

## Table of contents

1. [User flows](#1-user-flows)
2. [Interaction patterns](#2-interaction-patterns)

---

## 1. User flows

### 1.1 First-run onboarding

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

### 1.2 Create room → Lobby → first round

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

### 1.3 Join room — three entry paths

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

### 1.4 Round cycle (Estimating → Lobby → next)

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

### 1.5 Back, rejoin, and leave

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

No relay-side ban: a kicked user can re-enter the room code (their `leftAt` is cleared on re-join). For persistent removal the host changes the room password (ADR-0036, ADR-0017).

**End session for everyone (host only, destructive):**

```
⋯ menu (host) → End session for everyone
  → Confirmation alert: "End this session? All participants will be disconnected."
    → Confirm: write session-ended event to doc, all clients navigate to Home (with toast)
    → Cancel: dismiss
```

### 1.6 Edge-case flows

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

## 2. Interaction patterns

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

**Show QR code** on Lobby → modal with invite URL as large QR. "Done" dismisses.

### Half-sheet modal dismissal

Three standard dismissal gestures:
- Drag grabber down past lowest breakpoint.
- Tap scrim (region above sheet).
- Tap explicit Cancel / Done where present.

Dismissing unsaved picker discards change (pickers commit on radio selection — "unsaved" state only applies to editors with Save button).

### Swipe-to-go-back

Enabled globally via Ionic default `swipeGesture`. Leaving session reversible (snapshots live 24h per [ADR-0012](../adr/0012-snapshot-policy.md); rejoin via Jump-back-in banner), accidental swipes safe.

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
