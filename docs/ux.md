# ux.md — UX flows & interaction for hnch v1

Authoritative ref for hnch user flows and interaction patterns. Sibling of [`project.md`](project.md) (what product does) and [`schema.md`](schema.md) (session state shape).

This doc covers *what the user does* — flows between states and the micro-interactions inside them. Screen layouts, wireframes, and theming live elsewhere (or in code).

**Words on screen.** The thing people meet in is a **session**, everywhere the user can read it: "New session", "Join session", "Session code". (`room` stays the word in code, the relay API and the ADRs.) What gets estimated is a **story**. A participant is a **Voter** or an **Observer** (`viewer` in the doc). Copy is sentence case: "Start round 1", "Reveal votes".

UX decisions touching architecture cross-linked to governing ADR in [`adr/`](../adr/README.md). Conflicts need UX adjustment or superseding ADR — see [`CLAUDE.md`](../CLAUDE.md) for convention.

## Table of contents

1. [User flows](#1-user-flows)
2. [Interaction patterns](#2-interaction-patterns)
3. [Desktop surface adaptation](#3-desktop-surface-adaptation)

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
          → Navigate to Join session with code pre-filled
      → Else:
          → Navigate to Home
```

### 1.2 New session → Lobby → first round

```
Home
  → Tap New session
    → Client generates participantId from deviceId (ADR-0005)
    → Client creates Yjs doc with default settings
    → Client connects to relay; relay mints the room code (ADR-0008)
      → Relay unreachable: toast, stay on Home, nothing created
    → If "Ask for a password" is on (Settings): Session password sheet
        → Done with a password: session is protected
        → Skip, Done left blank, or sheet swiped away: session is open
    → Navigate to Lobby (as host)

Lobby (host)
  → Optionally adjust name, scale, password (tap the summary line under the code, or ⋯ → Session settings)
  → Share invite (share sheet), show the QR code, and/or read code aloud
  → Wait for participants (appear in list as they connect)
  → Tap Start round 1
    → Round-start modal opens, pre-filled from the next story on the agenda
    → Host optionally types a descriptor
    → Tap Start
      → Writes Round 1 to Yjs doc, pushes Estimating

Lobby (everyone else)
  → Same screen without the host's controls
  → In the session card, under the code: "Waiting for {host} to start the first round."
```

### 1.3 Join session — three entry paths

**Via invite URL** (most common for remote teams):

```
User taps invite URL in Messages/Slack/email
  → App launches (or foregrounds) via universal link handler
  → If no display name yet: show Onboarding, stash pending join
  → Else: Navigate to Join session with code pre-filled
    → If session is open: auto-attempt connect → Lobby
    → If session requires password: show password field inline (focused), wait for Join tap
```

**Via QR code** (co-located meetings):

```
Home
  → Tap Join session
    → Navigate to Join session
    → Tap Scan QR code
      → Capacitor BarcodeScanner opens camera view
      → User scans → code captured
      → Auto-populate code input
      → Continue as URL flow from "auto-attempt connect"
```

**Via manual entry** (fallback):

```
Home
  → Tap Join session
    → Navigate to Join session (first tile focused)
    → User types or pastes the 6-character code
    → The sixth character submits — no Join tap
      → Same as URL flow from "auto-attempt connect"
      → Code not active: toast, code stays in the tiles to be corrected;
        the same code is not re-submitted until it changes or Join is tapped
```

The Join button stays on the page: it is how a password is submitted, and how a code that failed is retried.

A link is acted on when it is followed, not every time the page it opened is come back to: the browser's Back from the Lobby lands on Join session with the code still in the tiles, and stays there. (The Lobby's own back button goes Home — §1.4.)

**Passwords.** A password is what was typed, without the whitespace around it — wherever one is set or entered, in the app and in the CLI. A password pasted with a trailing space still opens the session, and so does one pasted out of a chat with characters around it that cannot be seen. An accented letter is the same letter whichever way the keyboard wrote it (the password is compared in Unicode's NFC form); nothing else is folded together — capitals stay capitals. A password of nothing but spaces is no password: the app does not send one, and the CLI says "Password cannot be empty." rather than open a session that was meant to be protected. A password has at most 120 characters.

A session whose password was set before this rule, with whitespace around it and from somewhere that kept it (an older CLI), is asked for with a password no current client can type: the host sets it again.

### 1.3b Pre-session agenda (ADR-0042)

Host may queue stories before or during the session. All participants see the agenda read-only; only the host may mutate it.

```
Lobby (host)
  → Tap "Add story" → enter title / ticket ID / description (a story needs a title or a ticket ID)
    → Story appears at the end of the pending stories
  → The first pending story carries a "Next" badge
    → Start round / Next round opens the round-start modal pre-filled with it
    → round.agendaItemId set to item id; when the round is revealed or skipped the
      story is done (`consumed` in the doc), and a cancelled round leaves it pending
  → ⋯ on a pending story → [Move up] [Move down] [Edit] [Skip] [Remove]
      - Move up / Move down — sortKey fractional-index rewrite, no renumbering
      - Skip — no round created; item moves to "Skipped" terminal state
      - Remove — soft-delete; hidden unless "Show removed" is on

Done / skipped stories
  → Stay on the list, marked, with no ⋯ (nothing left to do to them)
  → Past-round history resolves item names even after participants leave
```

The list looks the same on every surface and is always fully on the page — there is no collapsed state. Everyone but the host sees it without the host's controls: no "Add story", no ⋯. "Show removed" is a way of looking at the list, and is there for everyone.

### 1.4 Round cycle (Estimating → Lobby → next)

```
Estimating
  → Participants tap cards to vote / change votes (ADR-0013)
  → Voter may abstain from the round (ADR-0041):
      - Tap "Abstain this round" below card grid
      - sentinel hnch_abstain written to round.votes[participantId]
      - Card grid dims to ~40% opacity; abstain button shows active state
      - Tapping any card clears abstention and casts that vote instead
      - Abstaining satisfies the unanimous-reveal "has voted" predicate
  → Avatar row updates in real time (presence, voted-state; abstainers shown as filled)
      - Observers are not in the row and not in the count ("2 of 3 voted")
      - Once half have voted: "Waiting for {names}"
  → Anyone may switch Voter ⇄ Observer with the role button beside the row (ADR-0020)
  → Reveal fires when:
      - Host taps Reveal votes (manual), OR
      - All online voters have voted or abstained (unanimous auto-reveal, ADR-0018).
        A client that has just (re)connected waits for the relay's first sync
        before it trusts its picture of who is online (ADR-0050) — a voter who
        reloads the page mid-round must not reveal the round by doing so.
        "Online" is taken at its word: when a voter who has not voted goes
        offline, the round no longer waits for them, and reveals if everyone
        else has voted.
  → All participants navigate to Lobby (results shown inline)
  → Host may skip the round instead of revealing (ADR-0040):
      - Host taps ⋯ → Skip round → confirmation "Skip this round?" (the votes cast so far
        are dropped and the round cannot be reopened) → round marked skippedAt, no vote results shown
      - All participants navigate to Lobby; skipped round listed in history with "Skipped" chip
      - Host can start a new round immediately; no re-vote lineage from a skip
  → Host may cancel the round with the back chevron (ADR-0046):
      - Round becomes a tombstone: no history entry, no number, linked story stays pending
      - Host: toast "Round cancelled". Everyone else: toast "The host cancelled the round"
      - All participants navigate to Lobby

Lobby (post-reveal)
  → Latest round results shown in full: "Round N results", "Re-vote" beside it for a re-vote
      - Votes grouped by value with voter chips, a bar for each value's share, stats, elapsed time
      - A tie has no leader: no bar is singled out, and no value is named "Most common"
      - Nothing to list at all (a round revealed with only Observers around): "No votes were cast."
      - Abstained participants shown in a distinct "Abstained" group (separate from "Didn't vote")
      - "Didn't vote" lists voters only — an Observer was never expected to vote
  → Below results, past rounds shown as compact history list (skipped rounds included with chip)
  → Host taps:
      - Re-vote: creates new Round with parentRoundId = current, reuses descriptor → Estimating
      - Next round N: opens round-start modal → Estimating
  → Everyone else waits: "Waiting for {host} to start the next round." (screen updates when host moves on)
```

**Round numbers.** A round's number is its place among the rounds that were not cancelled, and it is the same on every screen of the app and in the export: the Estimating title, the results heading, the history. A cancelled round takes no number — cancel round 3 and the next round is round 3. The CLI counts the same way. In its results and its history it shows a re-vote by its place in its chain as well ("Round 2/2 [re-vote]"); while the round runs, its title is the round's number, as in the app.

**While a round runs, everyone is on Estimating.** The Lobby sends anyone who lands on it mid-round back to the cards — also when the page is re-entered with the browser's Back button. Session settings are therefore only reachable between rounds.

### 1.5 Back, rejoin, and leave

**Back (graceful disconnect):**

```
User taps back (or swipes back) from Lobby
  → Navigate to Home
  → Home lists the session under "Jump back in" — up to 5 sessions, newest first (ADR-0044)
    → Tap a row: reconnect to the session, navigate back to whichever screen it's on.
      A password this device already entered rides along — no second prompt.
    → Relay no longer knows the session: toast, row removed
    → × on a row: forget the session on this device
    → Ignore it: the row goes when the relay snapshot expires (24h)
```

One list for one session or five — there is no separate single-session banner.

**Leave session (explicit, destructive):**

```
Lobby / Estimating
  → Host: ⋯ → Leave session
  → Everyone else: Leave button in the toolbar (their only session action, so not behind a menu)
  → Confirmation alert: "Leave session? You'll need the code to rejoin."
    → Confirm: write `leftAt` + `removedBy = self` to own participant record (ADR-0036),
      disconnect, clear jump-back-in cache, navigate to Home (session not listed)
    → Cancel: dismiss alert, stay on current screen
```

Effect on peers: the leaver disappears from active rosters (lobby list, voter denominator, "didn't vote" set) immediately. Their votes in already-revealed rounds remain in round history because `round.votes` references `participantId`, and the raw `participants` map still resolves the displayName.

If the leaver later re-enters via room code, `joinSession` clears `leftAt`/`removedBy` for self — they rejoin as an active participant with their existing record (preserves `joinedAt` and any historical vote attribution).

**Host removes a participant (kick, host only, destructive):**

```
Lobby → ⋯ on a participant row (host only, target is not self)
  → Menu titled with the name: [Make host] [Remove] [Cancel]
    ("Make host" only for a participant who is online: the role is not handed to someone who is not there)
  → Tap "Remove"
    → Confirmation alert:
        "Remove {name} from session?"
        Body: "They'll be disconnected and dropped from the participant list.
               Their votes in past rounds stay in the history."
        Buttons: [Cancel] [Remove (red)]
    → Confirm: write `leftAt` + `removedBy = host` to target's record (ADR-0036)
      → Target client observes own `leftAt` set with `removedBy !== self`
        → Toast: "Removed by host"
        → Clear jump-back-in cache, navigate to Home
        (CLI: prints "Removed by host", forgets the room, exits)
    → Cancel: dismiss alert
  → Tap "Make host"
    → Confirmation alert: "Make {name} the host?" — [Cancel] [Make host]
    → Confirm: everyone is told — "Bob is now the host" (Bob: "You are now the host")
```

The toast about a new host says who the host is now, and why — where the client can vouch for the reason: "… left." for a host who left the session, "… disconnected." for one whose connection is gone. For a host who is still here it gives none. They may have handed the role over; or a participant who lost sight of the session for a moment has elected themselves, and the host that was did nothing.

The ⋯ button is the same affordance on every surface; only the menu's presentation differs (§3).

No relay-side ban: a kicked user can re-enter the room code (their `leftAt` is cleared on re-join). For persistent removal the host changes the room password (ADR-0036, ADR-0017).

**End session for everyone (host only, destructive):**

```
⋯ menu (host, Lobby or Estimating) → End session for everyone
  → Confirmation alert: "End this session? All participants will be disconnected."
    → Confirm: write session-ended event to doc, all clients navigate to Home (with toast); the CLI prints the same line and exits
    → Cancel: dismiss
```

### 1.6 Edge-case flows

**Host drops during active session** (election rule: [schema.md § Host election](schema.md#host-election)):

```
Host's connection is lost
  → Other clients observe host's awareness going offline
  → After the election debounce, the remaining participants elect a new host
  → Everyone in the app sees a toast: "Bob disconnected. Alice is now the host."
    (the new host: "Bob disconnected. You are now the host."). The CLI prints
    the same line.
  → If former host rejoins within snapshot window: they rejoin as a regular participant
```

**Host reveals with nobody voted:**

```
Host taps Reveal with zero votes
  → Reveal event written to doc
  → All clients navigate to Lobby
  → Lobby results section shows only a "Didn't vote" group with every voter in it
  → Host can tap Re-vote to try again
```

**Invite URL or code for a session that is gone:**

```
User taps a URL (or types a code) the relay no longer knows (snapshot TTL expired)
  → Relay answers unknown-room
  → Toast: "That code isn't active. Double-check it with your host."
  → User stays on Join session, code still in the tiles, to correct it or go back
```

**The relay turns away a connection the user is already in a session on:**

```
On Lobby or Estimating, the socket reconnects and the relay refuses it
  (the host set or changed the password meanwhile, the session filled up, the session is gone)
  → The client stops retrying — trying again is the user's to decide, not a loop's
  → No "Reconnected": the wait is over, but not because the connection is back
  → Toast with what to do, or the reason: "Enter this session's password to get back in.",
    "This session is full (20 participants max).", "That session isn't active anymore."
  → Wrong password: the password this device remembered is forgotten, and the user lands on
    Join session with the code filled in, to enter the new one
  → Session gone: it is dropped from "Jump back in" (ADR-0044) — it can never be got into
    again — and the user lands on Home
  → Session full: Home, with the session still under "Jump back in" for when there is room
```

The page the user was on is not kept to go back to: Back from where they land does not lead into a session that is closed to them.

The relay refuses some of these before there is a socket to close with a reason — a session it no longer has, a protected one asked for without a password — and the browser reports that like any dropped connection. The client asks the relay over HTTP what the socket could not say (ADR-0050), so nobody is left behind a "Reconnecting…" that will never end. One exception is a session under a flood of refused joins: while it holds its bound of refused sockets ([deployment](deployment.md#free-plan-budget-and-alerts)), a join it would refuse gets a plain "try again later" answer with no verdict, so a wrong password or a full session reads as "Reconnecting…" until the flood passes.

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

**Unanimous consensus overlay:** when all votes are identical (≥ 2 voters) and the round terminal state is `revealed` (not `skipped`), a full-scrim overlay appears over the results. The overlay is round-state-driven — all participants (host, voter, viewer) see it simultaneously.

- Central badge reads **"hnch'd!"** in the success color, with a scale-in entrance animation (380 ms, spring curve) followed by 3 gentle pulses.
- Party emoji confetti (`🎉 🎊 🥳 🪩 ✨ 🎈 🌟`) burst radially from the badge center and fall ballistically with per-piece rotation, spawning continuously at ~10 pieces/s for the 3-second window (~30 simultaneous at peak).
- Confetti layers behind the badge so text stays legible at all times.
- Auto-dismiss after 3 seconds. Tap anywhere on the overlay dismisses early.
- `Haptics.impact({ style: 'Medium' })` fires 120 ms after the overlay appears.

**Reduced-motion fallback** (`prefers-reduced-motion: reduce`): static "hnch'd!" badge with a single inline 🎉 next to the text. No confetti, no scale-in animation, no pulse.

### The session code

Six tiles, one character each. Typing moves on to the next tile, Backspace back to the one before; a pasted code fills them all. A tile that holds a character takes the next one typed in its place: a typo is corrected by typing over it.

### Forms open ready to type

A sheet that exists to be typed into opens with the cursor in its first field — the session password, a story, the relay URL, the name of a new custom scale — and so does the password field on Join session when it appears. Enter submits. The cursor arrives once the sheet has finished opening, and not at all if the sheet is closed again before that, or if the user has put it somewhere else in the meantime.

The forms about a round — the one that starts it, the one that edits it — do the same on the desktop surface only (a wide window and a mouse). Everywhere else they open without a keyboard: every field in them is optional, most rounds start with the form as it is, and a keyboard would cover it. A custom scale that is opened to be changed opens as it is, too.

Enter that confirms a choice in an input method (IME) is part of typing: it never submits.

### Share sheet

**Share invite** calls `Share.share({ title, text, url })` from `@capacitor/share`:

- `title`: `"Join my hnch session"`
- `text`: `"Session code: K7P-9MR"`
- `url`: invite URL (carries `pw=1` for a protected session, so Join asks for the password up front)

Native → iOS share sheet (AirDrop, Messages, Mail, Slack, etc.). Web → browser native share or clipboard copy + toast fallback.

### QR scanning

**Scan QR code** on Join session opens `@capacitor-mlkit/barcode-scanning` full-screen camera. Successful scan (QR containing hnch invite URL) → code extracted, scanner dismisses, code input auto-populates. Non-hnch content → toast ("That doesn't look like an hnch invite"), stay in scanner.

### QR display

**QR code** on Lobby (beside Share invite, under the session code) → modal with invite URL as large QR and the code in text. "Done" dismisses.

### Half-sheet modal dismissal

Three standard dismissal gestures:
- Drag grabber down past lowest breakpoint.
- Tap scrim (region above sheet).
- Tap explicit Cancel / Done where present.

Dismissing unsaved picker discards change (pickers commit on radio selection — "unsaved" state only applies to editors with Save button).

**The custom scale editor saves as it is edited**, so it has no Save. A scale exists from the moment it has a name and two cards, and the one button in the header says which side of that moment the sheet is on: Cancel before, Done after. Both close the sheet, and closing it — by the button, a drag or a tap outside — saves a name that was still being typed. What is on screen is only saved while it *is* a scale; when it is not, the note under the cards says what is missing ("Add one more card and the scale is saved."), and for a scale that exists already, that the edit is not saved ("Not saved: a scale needs a name and at least 2 cards.") and the scale stays as it was. A save the device refuses is said so, in a toast and in the same note, and the next change tries again. Removing a card from the keyboard keeps the focus in the list; removing one by a tap leaves it where it was, with the keyboard that is up for the next card.

### Swipe-to-go-back

Enabled globally via Ionic default `swipeGesture`. Leaving session reversible (snapshots live 24h per [ADR-0012](../adr/0012-snapshot-policy.md); rejoin via the "Jump back in" list on Home), accidental swipes safe.

### Destructive confirmation

Destructive actions confirmed via `ion-alert` before committing:

```
Title:   "Leave session?"
Message: "You'll need the code to rejoin."
Buttons: [Cancel]   [Leave]   (Leave role: destructive)
```

**End session for everyone**: destructive button = **End session**, message: "all participants will be disconnected." No "don't ask again" — destructive actions intentional every time.

### Toast patterns

`ion-toast` for transient system messages:

- Position: `top` (no clash with sheet header actions).
- Duration: 2000ms informational, 4000ms errors.
- No close button on short toasts; close icon for 4000ms error variant.
- Non-blocking — never prevents user action.
- One look in every mode and theme: inverse surface (text color as background).

Common toasts: host handoff ("Alice is now the host", "Bob disconnected. Alice is now the host."), code copied ("Code copied"), link copied ("Invite link copied"), password changes ("Password set", "Password removed"), round cancelled ("Round cancelled" / "The host cancelled the round"), session gone ("That session isn't active anymore."), relay unreachable ("Couldn't reach the relay. Check your connection and try again."), scan failure ("That doesn't look like an hnch invite").

### Connection banner

One indicator, in the page rather than the toolbar: a bar at the top of Lobby and Estimating that stays in view when the page scrolls.

- "Reconnecting…" — as soon as a connection that was up drops.
- "Connecting…" — a first connection that has taken longer than a second.
- Connected: nothing. On the way back from "Reconnecting…": toast "Reconnected".

### Haptic feedback map

| Event | Haptic |
|-------|--------|
| Vote cast / changed | `impact`, `Light` |
| Host taps Reveal votes | `impact`, `Medium` |
| Reveal animation completes | `notification`, `Success` |
| Destructive confirm (Leave / End) | `impact`, `Heavy` on confirm tap |
| Unanimous auto-reveal fires | `notification`, `Success` |
| Host handoff toast | `notification`, `Warning` |

Haptics fire via `@capacitor/haptics` on native; web = no-ops (safe stub).

---

## 3. Desktop surface adaptation

The web PWA is a production surface, so desktop has to meet the same quality bar as mobile. One codebase, no fork: the same components render in a different *surface mode* driven by breakpoint. Surface mode is a configuration delta, never a behavior change — component tests are viewport-agnostic.

**Breakpoint.** `md` (768px) pivot, ANDed with `(pointer: fine)`. Touch laptops keep the mobile UX; desktop means 768px+ *and* a fine pointer. Central refs: `packages/client/src/theme/_breakpoints.scss` (SCSS map) and `packages/client/src/app/core/breakpoints.ts` (TS mirror) — keep the two in sync.

**Modals.** Mobile = half-sheet, `breakpoints: [0, 0.6, 0.95]`; a sheet whose content is a list longer than half a screen (scale picker, scale editors) opens at full height instead, so nothing sits below the fold waiting to be found. Desktop = centered dialog via the `.modal-centered` global class in `theme/_ionic-overrides.scss` (no drag handle, 480px wide, 560px high or 80vh where that is less; `.modal-compact` for one- or two-field forms). The class does nothing outside the desktop surface: a tablet is wide, but it is touched, and gets the sheet. A sheet is an inline `ion-modal` in the page that owns it, with its breakpoints from `SurfaceService` — see [ionic.md](ionic.md). It closes when that page is left, whoever left it: a participant who has the QR code up when the host starts the round votes on a clear screen. (One sheet is made in code, like the menus and alerts are: the camera overlay of the QR scanner, which belongs to a service, not to a page.)

**Menus.** Mobile = `ActionSheetController` overlay. Desktop = `PopoverController` anchored to its trigger, which fixes the Fitts's-law problem of a top-right gear opening a bottom-anchored sheet. Shared `<app-menu-popover>` replaces per-call-site button arrays; route through `SurfaceService.openSheetOrPopover()`.

**CTA bars.** `ion-footer.cta-bar` holding `<div class="cta-inner">` with the buttons. The inner row is capped to the page's column width and centered, so the primary button lines up with the content above it instead of spanning a 1440px window. Desktop drops the bar's background and hairline. No JS, no portal.

**Page width caps.** `<div class="page-container">` inside `ion-content`, plus a per-page SCSS mixin (`page-container($max)`) — no wrapper component, and no implicit inheritance, so each page opts in explicitly. Full width with a 16px gutter until the viewport outgrows the cap.

| Page | Max width |
|---|---|
| Onboarding | 480px |
| Join | 480px |
| Home | 560px |
| Settings | 720px |
| Estimating | 800px |
| Lobby | 800px |

**Small screens.** Pages hold at 320px wide: the session code scales with the viewport, the card grid is three columns on a narrow phone and four from about 400px, rows wrap rather than truncate.

**Accessibility.** Hover styles go inside `@media (hover: hover)`. Every interactive element carries a `:focus-visible` ring. Modal focus trap must be verified on desktop. Text in the accent color uses `--hnch-accent-text`, which is adjusted per theme to hold 4.5:1 on the page, on a card, and on a chip tinted with the accent itself; the raw accent is for fills. Touch targets are at least 44px: a control drawn smaller than that (toolbar buttons, the back chevron, icon buttons, toggles, the role switch, the ticket link) keeps its size and gets an invisible 44px hit area around its centre on any device with a touch screen (`touch-target` mixin, see [ionic.md](ionic.md#global-styles)). One exception: the show / hide eye in a password field is Ionic's own control, drawn inside a shadow tree the app's styles do not reach — 36px on iOS, 40px on Android. (The × that dismisses a toast is Ionic's own as well, but exposed as a part, and is sized to 44px.) A control never reaches past a container that clips it — no negative margins to tuck a button into a row. Pinch-zoom is not disabled.

**Out of scope.** Native iOS/Android layout is untouched — native clients stay pure mobile. `ion-split-pane` is deferred: current Lobby density (session code with share + QR, 1–8 participants, one round) would look sparse next to a capped centered column. Revisit when round history shows 3+ entries inline; a Lobby side rail is a structural change and needs its own ADR.
