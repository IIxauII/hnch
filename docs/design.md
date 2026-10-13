# design.md — hnch design system and UI rulebook

> **Status: Draft. Proposed, not adopted.** This file is extracted from [docs/plans/ux-overhaul.md](plans/ux-overhaul.md) (§2.1, §4, §5, §6.1, §6.5, §6.7) for owner review. Nothing here is binding until the owner decisions in that plan (§9.2) are made and ADR-0050 to ADR-0053 are accepted. Until then, `docs/ux.md` and the accepted ADRs stay authoritative. References such as §n, D-n, O-n, T-n, CP-n, CD-n, PW and PT point into the plan; `UX-nnn` ids resolve in [docs/plans/ux-overhaul-issues.md](plans/ux-overhaul-issues.md). File names such as `tokens.py`, `contrast-tokens.txt`, `p-light-*.png` or `80x24/*.txt` are analysis-session artefacts (scripts, prototype screenshots and terminal frames) that were not committed.

Once adopted, this file is authoritative for *how hnch looks and behaves on screen* (web phone, web desktop, terminal). `docs/ux.md` holds flows and state rows, `docs/schema.md` the data, `docs/ionic.md` the Ionic mode and bridge, and ADR-0050 to ADR-0053 the structural decisions behind this file.

## 1. Principles

1. **The vote is the meeting.** Anything that is not voting, revealing or deciding gets out of the way or moves one level down.
2. **One room, one button.** The phase drives the stage. Nobody is ever navigated by someone else's action. The one exception is session end (ADR-0023), which takes everyone to the summary on Home (D21). The host's one primary action never moves.
3. **Trust first.** Never reveal early, never strand a peer, never lose a vote, never destroy on Back, never hand the room to someone who just lost their network.
4. **The number, in place.** Results replace the cards. Lead with one card value, and name the low and high voters.
5. **Type what you see; say the same thing everywhere.** Card faces are keys. Web and terminal share one registry of words and keys.
6. **Undo beats confirm; confirm beats regret.** Reversible actions get a 5 s undo. Actions that affect someone else get a confirm. A decision that was recorded can be corrected later (D25).
7. **Subtract before you add.** A new control must pay for itself by removing one.
8. **Calm by default, one moment of joy.** Ink and dot: paper, one green, and a dot per hunch. "hnch'd" is the only flourish, and it never blocks.

## 2. Rules R-01 to R-63

Each rule names its check.
- **CI** means the check blocks merge once Phase 0's baselines exist. Until then it runs report-only.
- **v2** marks a rule that is new or changed. Appendix C records why.
- There are **63 rules**.

### Flow and speed budgets

| ID | Rule | Verified by |
|---|---|---|
| R-01 | A session is one route. Remote state never navigates anyone; it changes the stage in place. Session end (ADR-0023) is the one exception. | e2e: 3 clients × 3 stories. `location.pathname` is constant after join and the router `NavigationEnd` count is 0 during the loop |
| R-02 | The loop (start → vote → pass → reveal → accept/next → re-vote) presents **zero** modals, sheets, alerts or popovers. Non-modal undo toasts are allowed. | e2e DOM observer on `ion-modal`, `ion-alert`, `ion-popover` during the loop spec (PW: 0 in 15 samples per run) |
| R-03 | **v2. Per-round budgets** (action taxonomy, §2.5). With a queue: host ≤2 per round (Accept·Next + own card); voter 1 (2 for a two-character face, host included); viewer 0. A Split costs the host +2 to re-vote or +1 to accept a value, and each voter +1. Without a queue: host ≤3. **Weighted fixture** (S1: Close, Agreed, Split → Re-vote → Close, Close, Agreed): host mean ≤2.4 per story, voter ≤1.2. | `packages/e2e/tests/journeys/budget.spec.ts` action counter. CLI: pty, counting keys between `round-open` events in the app event log (PT method). Fails CI when exceeded |
| R-04 | **v2. Entry budgets** as in §2.5, counted with the taxonomy. New host: phone 4 taps + name, desktop 0 clicks. Invitee ≤2 taps + name (+1 focus tap on touch; ≤1 when the name is known). Code ≤2 taps + 6 keys. Resume 1. Add N stories with an empty queue: 3 touch / 1 desktop. Scale 2. Run it back 2. CLI join ≤2 prompts + 1 key. | `budget.spec.ts` personas on the WebKit iPhone and desktop profiles; pty |
| R-05 | **v2. Latency (report-only, trend-gated).** Visual feedback ≤100 ms for any input. Host action → peers' stage updated ≤250 ms on a local relay. Last vote → Strip visible ≤ settle + 400 ms. No spinner for local actions; any spinner appears only after 150 ms. | Playwright `performance.now()` marks and pty timestamps, median of 5 runs. A >20 % regression of the median against the last baseline fails the nightly job, not merge (CP-17) |
| R-06 | **v2.** One primary action per phase per role, host only, in a **fixed slot**. Within one profile, the bounding box differs by ≤2 px across waiting, voting and revealed, and across 3 consecutive stories with 1- and 2-line titles. The box keeps one hue family across phases: disabled is tonal (PW #3). | e2e geometry on the WebKit iPhone 13 (390×664), 1024×768 and 1440×900 profiles (PW: identical box at 390×844, 1024×768 and 1440×900) |
| R-07 | Nothing modal sits between opening a link and seeing cards, except a name field (when unknown) and a password field (when required). No tours, and no auto-opened Share or QR. | e2e invite-link spec |
| R-08 | Recording the agreed value costs zero extra actions: the advance action writes it (`acceptAndNext`). | Loop spec: `agreedCard` is set with the same action count as R-03 |
| R-09 | **v2. Subtraction rule.** A PR that adds a visible Room control removes one, or moves one a disclosure level down. Host Room controls before round 1, once someone has joined, stay ≤7: 4 in the header (‹, name·code, people, ⋯) + `+ Add` *or* the story field (never both) + Scale + Start. Up next rows in the waiting stage are not interactive. | PR template checkbox; e2e counts interactive a11y nodes in the Room (PW: 7 on phone and desktop) |

### Safety and state

| ID | Rule | Verified by |
|---|---|---|
| R-10 | **v2.** Back, Esc and OS back never change room state. "Step out" keeps presence and the host role, sets an awareness `away` flag, and Return never tears down the session. A host away for ≥60 s loses host liveness (ADR-0052). Starting or joining another room while stepped out goes through Leave. | e2e: OS back during voting leaves the round `voting`, `hostParticipantId` unchanged and `leftAt` unset; Return does not reconnect the provider |
| R-11 | **v2. Destructive actions.** Skip story → 5 s Undo (pending commit, D4). Remove story and Undo paste → immediate write + compensating Undo. End for everyone, Remove person and host Leave with others online → confirm. Never a bare single key. | Unit test on the registry `destructive` field; pty: `s` and `d` do nothing while voting |
| R-12 | **v2.** Terminal round fields (`revealedAt`, `skippedAt`, `discardedAt`, `closedAt`) are **write-once**. No writer deletes them, and an undo never un-tombstones. `agreedCard`/`agreedBy` are last-writer-wins and correctable (D25). The pending-commit queue flushes before any other host writer and on step-out, Leave, `visibilitychange:hidden`, `pagehide`, teardown and CLI exit. | Shared unit tests plus property tests over random command interleavings and two-doc merges. Cases: skip then Start within 5 s; remove then Accept·Next within 5 s; host change mid-window; tab hidden mid-window; reveal mid-window |
| R-13 | **v2. One active round on every peer.** The active round is the last round in array order when it is non-terminal. Earlier non-terminal rounds are superseded: hidden from phase and history, and tombstoned by the host when it sees them. `startRound` refuses with `reason:'round-active'`. Host round writes (Start, Reveal, Accept·Next, Re-vote, Skip) refuse with `reason:'not-ready'` while the client is not connected and synced. | Two-doc concurrent-merge fixtures: every peer's projection exposes ≤1 active round, and all peers converge on the same one. Property test; e2e "browser back → Start" |
| R-14 | **v2. Readiness, grace and settle.** Auto-reveal **and host election** never evaluate before the peer is connected, synced and has seen the first remote awareness update (or 1.5 s alone), and never while the socket is down. A dropped peer stays in the denominator for 5 s. Settle window: 300–700 ms (default from O11), restarted by any vote change the writer sees. `autoReveal` is written first by the client whose vote completed unanimity; other peers write it as a fallback after settle + 1.5 s. Late joiners count only once they vote. 0 eligible voters never auto-reveals. | e2e: voted-voter reload ×4, unvoted reload, 3 s socket drop → 0 premature reveals. **Voter socket dropped 8 s → `hostParticipantId` unchanged after reconnect** (web and CLI pty). Injected latency skew between peers. A non-host peer still auto-reveals while the host is stepped out. Table-driven unit tests on gate × grace × settle × pass × viewer × solo × late joiner |
| R-15 | UI reads rounds and participants **only** through shared selectors (`phaseFor`, `historyRounds`, `latestResultRound`, `eligibleVoters`, `storyNumber`, `suggestAgreed`, `classifyResult`, `displayNames`, `terminalState`). | **v2:** an in-package unit test in client and CLI (`no-raw-round-reads.spec.ts`): no `isTerminalStatus`, `.rounds.at(-1)`, `revealedAt` or `skippedAt` reads, and no raw `participants` maps, in `packages/client/src/app/**` or `packages/cli/src/ui/**` |
| R-16 | **v2.** Host-only controls render only for the host, **and** the shared host writers refuse non-hosts (cooperative, per ADR-0001). The exception is `autoReveal`, which any eligible peer may write (D24). A pending commit checks authority when the user acts. The relay cannot enforce host-only access changes (ADR-0017:20), so UX-006 is mitigated in the UI only. | e2e as a joiner; unit tests: writers return `{applied:false, reason:'not-host'}` |
| R-17 | **v2.** A vote is written only on commit. A unique prefix commits at once, and the rest of that face's spelling is then absorbed for 450 ms. An exact prefix that is also the start of another face commits on ⏎, a non-extending key, or 450 ms. A partial key sequence never writes. | The 18 cases of `resolver-check.mjs` (Risk `l/c/low/high`, T-shirt `xx/xxl`, Powers of 2 `32/64/16/1`, Fibonacci `1/13/15`) as shared unit tests; property test over random custom scales; e2e: typing `1`,`3` as the last voter never reveals "1" (PW, PT: 0 wrong reveals) |

### Layout and responsive

| ID | Rule | Verified by |
|---|---|---|
| R-18 | Breakpoints are phone <600, tablet 600–1023 and desktop ≥1024. Keycaps, hover actions and tooltips render only on `(pointer: fine)`. | Visual baselines at 320, 390, 768, 1024 and 1440 |
| R-19 | **Phone.** 16 px gutters. The primary is sticky inside the safe area, full width minus the gutters, ≥52 px tall. No horizontal scroll at 320. | e2e geometry (PW: `scrollWidth = 320` on every screen) |
| R-20 | **v2. Desktop.** Frame max 1136 (720 stage + 32 gap + 320 rail + 2 × 32 gutters). Stage 720 at 1024–1599, 960 at ≥1600. The primary sits in the stage's footer row, never wider than the stage. The stage body reserves 2 H1 lines and `--hn-stage-body-min`, so the footer never moves. | e2e geometry plus R-06 |
| R-21 | **v2.** On the WebKit **iPhone 13 (390×664)** and **iPhone SE (320×568)** profiles, for host and voter: while voting, every card of every built-in deck and of custom decks with ≤11 faces, plus Pass, sits above the action bar. After reveal, the hero, Strip and primary are all visible. Tiles are 3:4 up to 9 faces and 1:1 above. | e2e `boundingBox().bottom ≤ innerHeight − actionBar` (PW measured 390×844 and 320×568 voting only; 390×664 is unmeasured and must pass in T2.3/T2.4a) |
| R-22 | One sheet level at most; never open a sheet from a sheet. No accordions in the Room. ≤2 disclosure levels. | Lint: `ion-accordion` banned under `app/room/**`. `hn-sheet` asserts at runtime that ≤1 modal is presented |
| R-23 | **v2.** Text never breaks mid-word. Titles get 1 line with ellipsis (Room header, rows) or 2 lines with word wrap (story H1). Below 360 px the header hides the share glyph and shows 2 dots + count, so the room name keeps ≥5 characters. | Stylelint bans `word-break: break-all`; screenshot at 320 (PW #10) |

### Visual system

| ID | Rule | Verified by |
|---|---|---|
| R-24 | **v2.** Tokens only. No raw colour, `font-size`, `border-radius`, shadow, duration **or spacing (`margin`, `padding`, `gap`, `inset`)** literals outside `packages/client/src/theme/**`. | Stylelint `declaration-strict-value` + `color-no-hex` |
| R-25 | **v2.** Text ≥4.5:1 and state or focus UI ≥3:1, in **both** themes, **including Ionic-internal text** and these non-text pairs: accent fill vs surface and bg; the selected-tile ring vs `surface-2`; avatar dots vs `accent-soft` (via the surface ring); `on-danger`; `on-accent-2`; the tonal disabled primary. | `theme/tokens.contrast.spec.ts` over the token table plus the bridge pairs (PW: 114 pairs pass); axe `color-contrast` on every Room phase × light/dark × phone/desktop |
| R-26 | Accent used as text or icon colour reads `--hn-accent-text`. `color="primary"` is used only for solid fills through `hn-button`. | Template lint rule |
| R-27 | **v2.** One Ionic mode (`ios`) with `rippleEffect:false`. Across engines, compare **structure, not pixels**: computed mode = `ios`, resolved token values, and component geometry ±1 px. Pixel baselines are kept per engine and profile. | `capture.spec.ts` matrix + a computed-style probe (CP-17, CD-16) |
| R-28 | One family (Inter Variable). The 8 type tokens only. Sentence case. ≤3 weights. `tabular-nums` on every changing number. One card-face size per deck, from the longest face. | Stylelint bans `text-transform: uppercase`; grep for font-size literals = 0 |
| R-29 | **v2.** Status is always **word + glyph + colour**: `✓ Agreed` (success), `≈ Close` (neutral), `↔ Split` (warning; `⇄` in a terminal whose renderer measures `↔` as 2 cells), `– No votes` (neutral). Never red. The classification follows the §6.1 table. | Unit test on `round-presentation` with the R-52 fixture; component snapshot |
| R-30 | Icons come only from the registry concept table (§5.7). No emoji in UI chrome. | A unit test parses templates and fails on unregistered names |
| R-31 | **v2.** Motion is ≤400 ms (the hnch'd moment ≤900 ms), uses `transform` and `opacity` only, never blocks input (`pointer-events:none`, no scrim), and honours reduced motion, including Ionic `animated:false`. *Local* selection and navigation started from the keyboard are not animated. Shared phase transitions animate for everyone. The static "✓ hnch'd" stamp shows in every mode. | e2e: the primary passes `elementFromPoint` throughout a consensus reveal (PW: 67/67 frames); reduced-motion snapshot (PW: 0 sparks, no animation >200 ms) |
| R-32 | **Delight budget.** A delight moment adds 0 actions, lasts ≤900 ms, is non-blocking, and has a reduced-motion variant. | Review checklist |

### Accessibility (WCAG 2.2 AA)

| ID | Rule | Verified by |
|---|---|---|
| R-33 | **v2.** Every screen has exactly one H1 and labelled regions (header, stage, people, stories). In the Room the H1 is the story title, or "Story 3" for an untitled story. | axe; a11y-tree snapshot |
| R-34 | **v2. Announcement policy.** One persistent status line per phase, `role="status" aria-live="polite"`, never created inside `@if`. It announces only: phase changes, your own vote, "Everyone's in", and a spoken result ("Close, suggested 8, range 5 to 13; low Ana, high Dev"). Vote counts are throttled to ≤1 announcement per 5 s. The waiting-on list and any buttons stay out of the live region. | Unit test on the announcement reducer; axe; manual screen-reader pass in the Phase 2 exit |
| R-35 | **v2.** The deck is native buttons with `aria-pressed`, a single tab stop (roving tabindex), arrows to move, and Space or Enter to cast the focused card. The global ⏎ primary fires only when focus is not on a button or a field. | e2e keyboard spec |
| R-36 | **v2.** Targets are ≥44×44 on coarse pointers and ≥24×24 on fine (2.5.8). Strip columns are full-height hit areas. When a column is narrower than 44 px (Fibonacci at 320, Linear), tapping the hero opens an in-stage row of 44 px value chips for overrides. This is not a sheet. Focus is never obscured (2.4.11): `scroll-padding-bottom` equals the action-bar height. | axe `target-size`; Playwright focus sweep |
| R-37 | **v2.** Single-key shortcuts can be turned off, and never fire while a text field has focus (2.1.4). Esc in a field hands keys back to the room. `?` opens help while the field is empty. | e2e with the toggle off; e2e with focus in the story field (PW #4: "?mi" typed into the field before the fix) |
| R-38 | Pinch-zoom is allowed (no `user-scalable=no`). Content reflows at 320 CSS px (1.4.10). | `index.html` lint; e2e at 320 |
| R-39 | Accessible names contain the visible text (2.5.3). | axe `label-content-name-mismatch` |
| R-40 | Every route sets a `<title>`. The Room title is `{name or CODE} · {phase} · hnch`, for example `Sprint 42 · voting 3/5 · hnch`. R-63 adds the vote prefix. | e2e `document.title` |

### Copy and microcopy

| ID | Rule | Verified by |
|---|---|---|
| R-41 | **v2.** Sentence case. Device-neutral verbs ("Add stories", never "Tap +"). "You" for yourself. One playful word: "hnch'd", spoken as "Agreed" (`aria-label`). Never claim encryption. The relay is described as "never looks inside your room". | String lint for `Tap ` / `Click ` in shared strings; review |
| R-42 | **v2.** Phase labels, status lines, button labels and story numbering come from the `@hnch/shared` message catalog (`round-presentation` + registry), never from per-surface literals. Progress reads **"Story 3 of 12"** everywhere. A surface may only change case or compose shared fragments: the terminal adds `· suggested 8` because it has no hero. | Snapshot tests in both packages import the shared strings |
| R-43 | Never present cached state as live. Recent says "last seen …" unless the session is connected. | Unit test on the Recent row copy |
| R-44 | Errors say what happened and what to do next, with no internals ("Room K7P-9MR wasn't found. Check the code or ask for a new link."). | Copy review; pty error specs; the §6.7 rows |

### CLI / TUI

| ID | Rule | Verified by |
|---|---|---|
| R-45 | **v2.** The frame fits 80×24. The minimum is 60×20. The side panel appears at ≥100 columns, except while the host waits alone. **On Ink 5 the frame is exactly `rows − 1` tall.** At or above `rows`, `ink.js:121-122` clears the terminal on every render. The only allowed clear is one per resize. | Pure `screen(state, W, H)` snapshots at 60, 80, 100 and 120 columns; pty (PT L6: 0 `ESC[2J`/`ESC[3J` mid-session) |
| R-46 | **v2.** The footer is one row: ≤5 hints (≤3 under 72 columns) + `? help` + `q leave` (outside voting), truncated by priority, never wrapped, and generated from the registry. While a card prefix is pending, the ⏎ primary hint becomes `⏎ vote <face>`. | Snapshot at 3 widths (PT: one row at 60/80/100) |
| R-47 | **v2.** Idle output in waiting and revealed is 0 bytes. While voting it is ≤150 B/s, from the stopwatch cell only. That needs Ink ≥6.5 incremental rendering (PT: Ink 8 137 B/s; Ink 5 2,414 B/s). On the Ink 5 fallback the stopwatch shows minutes only (≤1 repaint per minute). No `ESC[2J`/`ESC[3J` mid-session. Alternate screen, with an exit summary to scrollback. `--inline` for screen readers, `TERM=dumb` and Zellij. | pty byte counter over 4 s idle windows per phase |
| R-48 | **v2.** One input router with a mode stack. Esc closes the top layer and never quits. A base-level Esc within 400 ms of a layer closing is ignored. `q` acts only at the base layer outside voting. While voting, letters and digits are card faces: a command letter that is not a face flashes "letters are cards while voting; esc opens the menu". | pty (CLI-08 and cli M3 repros; PT `esc-rules`: all true) |
| R-49 | **v2.** Colour precedence is `--no-color` > config > `NO_COLOR` > `FORCE_COLOR` > `TERM=dumb` > TTY. `NO_COLOR` is a **theme switch**, never `FORCE_COLOR=0`, which also strips inverse and bold. Every inverse-only state also has a glyph (▲ cursor, ▸ selection). At start-up, glyph widths are checked against the renderer's own `string-width` (`↔` → `⇄` on Ink 5). Meaning is never carried by colour alone. ASCII glyph fallback with `HNCH_ASCII=1` or `TERM=linux`. | pty: `NO_COLOR=1` → 0 SGR colour codes (PT); `FORCE_COLOR=0` cursor still visible by glyph; CI width check |
| R-50 | **v2.** Secrets are never echoed and never in argv (`--password-stdin`). Errors are three-part. Exit codes are 0/1/2/130. No `console.*` while Ink is mounted. The exit promise is taken at render time, and quit renders an empty tree, waits one tick, then unmounts. | pty: the summary follows `ESC[?1049l` for `q`, the confirm, Ctrl+C (130) and host-ended (PT L9); console spy in session tests |

### Cross-surface consistency

| ID | Rule | Verified by |
|---|---|---|
| R-51 | **v2.** One **interaction registry** (`packages/shared/src/interaction/`) declares every command: `{id, label, keys, phase, role, destructive, priority, disabledReason}`. Web keycaps, tooltips and `?`, the CLI footer, `?` and menu, and the key tables in `docs/ux.md` and `docs/cli.md` are all generated from it. **Reserved keys win** (`?`, `-`, ⏎, Esc, ⌫, Space). Faces that cannot be typed stay reachable with the arrows and are flagged by the scale editor. | Property test: no key maps to two intents in any reachable state, over the 5 built-ins plus generated custom scales (with `?`, `-`, `☕`, `½`, multi-word and non-ASCII faces); docs-table snapshot |
| R-52 | **v2.** The same doc fixture yields the same classification, suggested value, status words, average and story number on web and CLI. The fixture covers Agreed, Close (both branches), Split, 1 vote, 0 votes, all pass, categorical scales, a mixed-scale session, discard-after-unclosed-reveal, a superseded round and a late joiner. | A shared fixture test imported by both packages |

### Process

| ID | Rule | Verified by |
|---|---|---|
| R-53 | Docs move with code: `docs/ux.md`, `docs/schema.md`, `docs/cli.md`, `docs/design.md` and `CONTEXT.md` change in the same PR as behaviour. An ADR comes before any change that contradicts an Accepted ADR. | PR checklist; CI path warning when `packages/client/src/app/**` changes without `docs/` |
| R-54 | Visual baselines include iPhone (WebKit, touch), Android and desktop profiles, in light and dark. Re-baselining happens in a dedicated PR per phase. | `capture.spec.ts` matrix |
| R-55 | Interim fixes to code scheduled for deletion are ≤2 days each and add no new components. **v2:** the ticket list now complies (T0.6g/j/k, T1.3c and T1.3d are all S). | Review checklist |
| R-56 | **v2 new. Approved key frames.** Every Room phase × role × phone/desktop × light/dark, plus 4 terminal frames, matches the frames the owner approved in T1.0. | Perceptual diff (report-only) + owner sign-off per phase |
| R-57 | **v2 new. State matrix.** Every row of §6.7 has a fixture snapshot on web and in the CLI, with copy from `@hnch/shared`. | Fixture snapshots in both packages |
| R-58 | **v2 new. Untrusted text.** Display names, story titles, session names and ticket ids pass `toDisplayText()` at every CLI render and print point (exit summary and OSC 8 labels included) and at web display. It strips C0/C1 controls, ESC sequences and bidi overrides. CSV cells that start with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'`. | Unit fixtures with `ESC]52`, `ESC[2J` and U+202E; pty: a peer named with an OSC 52 sequence writes nothing to the clipboard and does not retitle the terminal |
| R-59 | **v2 new. Mixed versions.** Every client publishes `proto` (an integer) in awareness. A peer with a lower or missing `proto` triggers a one-time host notice ("Dev uses an older hnch, so results may reveal early. Ask them to update."). A newer `proto` seen on any peer triggers "A newer hnch is available": web shows it on Home or after End only; the CLI shows it on exit. | Two-version fixtures; e2e with a stubbed old peer |
| R-60 | **v2 new. Strings.** Every user-facing string comes from the shared message catalog with plural and select forms. Numbers and times go through `Intl`. No concatenated sentences. `<html lang>` is set. Layouts tolerate +40 % text: the primary truncates the story title first, never the verb or the value. English only in v1. | Catalog lint; a pseudo-locale (+40 %) screenshot run |
| R-61 | **v2 new. Byte and device budgets** (report-only until Phase 5; targets confirmed against the T0.8b baseline). Invitee path (`/join` → Room): initial JS ≤250 kB gzip, fonts ≤60 kB, LCP ≤1.5 s on throttled 4G on a mid-range Android profile, INP ≤100 ms, CLS ≤0.05. No preloading of the scanner chunk. CLI cold `npx -y` ≤5 s. | Lighthouse CI on the invitee path; `angular.json` budgets tightened from 1.6 MB / 2 MB; CLI cold-start timer |
| R-62 | **v2 new. Focus anchor.** When a phase change removes the focused element (the deck on reveal, the Strip on Accept), focus moves to the new phase's H1 or hero (`tabindex=-1`), without a second announcement. | e2e keyboard spec: `document.activeElement` is never `<body>` after a phase change |
| R-63 | **v2 new. Attention.** While your vote is due, the tab title is prefixed `● Vote ·` and the favicon gets a dot; both revert on your vote. No sound by default (everyone is in a call). Haptics only where supported: the switch is hidden when `navigator.vibrate` is missing and the app is not native. The CLI rings `BEL` on round open only with `--bell`. | e2e `document.title`; unit test that `HapticService` never throws on iOS web |

## 3. Phases and the Room

### Phase truth table

| Phase | Derived from (shared selectors only, R-15) | Stage | Host primary (fixed slot) | Voter | Viewer ("just watching") |
|---|---|---|---|---|---|
| **waiting** | No rounds, or the last round is closed (`closedAt`), discarded, or skipped (legacy `skippedAt`) | **Alone:** the invite panel (QR inline on desktop and in the CLI). **Otherwise:** the H1 is the *next* story's title, with meta "Up next · Story 1 of 5 · PROJ-101" (PW #14). Below it: "After this · 4", the last result line, and the story field. The field appears only when the queue is empty, and then it replaces `+ Add`. | `Start · PROJ-101`, or `Start a story` with no queue | "Waiting for Hana to start…" (UX-020) | same as voter |
| **voting** | The last round is non-terminal: it is the active round | Story bar, status line, the presence "table" (phone, PW #13), deck incl. **Pass** | `Reveal · 3/5`. Tonal-disabled `Waiting for votes · 0/5` (PW #3). `Reconnecting…` (disabled) while the client is not connected and synced (D19) | 1 tap or 1 key; changeable until reveal | "You're watching", with `Vote instead` in the stage body, never in the live region (PW #8) |
| **revealed** | The last round is revealed and `closedAt` is unset. In legacy docs, every revealed last round counts | Hero, **Strip**, Low/High (only the side that differs from the suggestion, PW #5), `avg 8.4` on numeric scales, Re-vote (quiet) | Per the outcome table in §6.1: `Accept 8 · Next: PROJ-102`, `Accept 8` (no queue) or `Re-vote` (Split, no votes) | Status line = outcome + wait: "≈ Close · range 5–13 · waiting for Hana" (PW #6) | same as voter |

**Not phases:**
- **Session end.** ADR-0023's observer still sends everyone Home, where the summary card renders. This is the one stated exception to principle 2 (D21).
- **Being removed.** It shows as a terminal Room state on web: "Hana removed you from Sprint 42", with `Done` going Home. The CLI exits (§6.7).

### Revealed outcomes

**Revealed: outcome table (v2, complete)** (CP-6, CD-01, CD-09; D20; O13). *n* = non-pass votes. *d* = step distance in card order. *m* = mode share.

| Outcome | Rule | Hero | Status line (shared) | Suggestion | Host primary |
|---|---|---|---|---|---|
| **Agreed** | n ≥ 2, all equal | `5` + "✓ hnch'd" stamp + burst | `✓ Agreed · everyone said 5` | the value | `Accept 5 · Next: PROJ-102` |
| **Close** | d ≤ 1; or d = 2 ∧ m ≥ 60 % ∧ n ≥ 4. Categorical: 2 adjacent values | the suggestion | `≈ Close · range 5–13 · avg 8.4` (avg on numeric scales only) | mode. A tie goes to the value nearest the average, then the higher one. Categorical: mode, tie → higher | `Accept 8 · Next: PROJ-102` |
| **Split** | everything else (off-scale values count as Split) | `Split · 3–21` (title size) | `↔ Split · Ana (3) and Dev (21) — hear them out` | none; no caret, no Low/High callout (PW #5) | `[ Re-vote ]`. Picking a value (column, hero chips, keys) turns it into `Accept 8 · Next` |
| **1 vote** | n = 1 | the value | `1 vote` (no status word, UX-036) | that value | `Accept 5 · Next: PROJ-102` (keeps the fixed slot, R-06) |
| **No votes** | n = 0 (everyone passed, or nobody voted before a manual reveal) | `—` | `– No votes` | none | `[ Re-vote ]`; quiet `Skip story` in the stage |

### State matrix

Each row is a fixture on web and in the CLI. The copy comes from the shared catalog (CD-13).

| # | Trigger | Host sees | Voter sees | Viewer sees | Primary / recovery |
|---|---|---|---|---|---|
| S1 | **Room full** at join (close 4006, ADR-0024 §5) | — | Join preview: "Sprint 42 is full (20 people). Ask the host to make room." CLI: three-part error, exit 1 | same | `Try again`. The preview socket closes before joining, so it never holds a slot (K11) |
| S2 | **Unknown or expired room** (4001) | — | "This room has ended or expired." The Recent entry is removed | same | `Start a room` |
| S3 | **Wrong password** (4002) | — | Stays on the Join preview; field cleared; "That password didn't work." | same | Retype |
| S4 | **You were removed** (`removedBy` ≠ you) | — | Web: a terminal Room state "Hana removed you from Sprint 42" + `Done` → Home. CLI: prints it and exits 0 | same | Rejoining needs the host (password rotation is the persistent lever) |
| S5 | **Session ended while stepped out** | — | The Home row becomes "Sprint 42 ended · See summary" | same | Opens the summary card |
| S6 | **Offline after voting** | "✗ Offline · your vote will sync"; the primary shows `Reconnecting…` (host round writes paused, D19) | "✗ Offline · your vote will sync"; your selection stays | same | Automatic on reconnect |
| S7 | **Everyone passed / 0 votes** | `– No votes`; `Re-vote`; quiet `Skip story` | `– No votes · waiting for Hana` | same | Re-vote or Skip |
| S8 | **Nobody eligible** (only viewers present, or every voter stepped out and left) | "Nobody is voting · Vote instead"; `Reveal` disabled until ≥1 vote; auto-reveal never fires | — | "Nobody is voting · Vote instead" | `Vote instead` |
| S9 | **Late joiner during voting** | presence shows them; the count is unchanged | they see the story: "Voting on PROJ-101 · you can join in". They count only once they vote (D28) | — | A vote restarts the settle window |
| S10 | **Host offline beyond the 5 s grace** | — | "Hana is offline · picking a new host…", then "Ana is host now" | same | Election (ADR-0010/0048, gated by ADR-0050) |
| S11 | **Host stepped out** | Home row "You're still hosting Sprint 42 · Return" | After 10 s: "Waiting for Hana (stepped out)". After 60 s host liveness lapses and the election runs (ADR-0052) | same | Host taps Return |
| S12 | **Duplicate names** | "Sam" and "Sam ·2" (by join order, via `displayNames()`) everywhere: table, Strip, rail, exports | same | same | — |
| S13 | **Empty Stories / empty Recent** | Stories: "No stories yet · paste a list to queue them". Recent: hidden | Stories: "The host hasn't queued stories" | same | `+ Add` (host) |
| S14 | **Old-client peer present** (`proto` lower or missing) | One-time notice: "Dev uses an older hnch, so results may reveal early. Ask them to update." (CLI: toast row) | — | — | Dismiss |
| S15 | **Newer client seen** (a peer's `proto` is higher) | Web: "A newer hnch is available · Reload", only on Home or after End. CLI: printed on exit with the update command | same | same | Reload / update |
| S16 | **Scale changed mid-session** | Toast: "Scale is T-shirt from the next story" | same toast | same | — |

## 4. Tokens

**The idea (opinion).** hnch is a *hunch*, and a hunch is a dot: one person's gut feel placed on a scale. One dot is used everywhere:
- the brand mark;
- presence and the phone "table";
- the Strip;
- the header status;
- the CLI `●`;
- the hnch'd burst.

The look is paper, ink and one racing green, with nothing loud. This is C's motif (C §4.1). It uses A's tokens and Ionic bridge (A §6.3, E0.5), and one typeface (D12). The web prototype renders the whole system in both themes (`overview-phone-light.png`, `overview-phone-dark.png`, `overview-desktop.png`).

**Where it is recorded.** The values below go to `docs/design.md`, generated from `theme/tokens.ts`. The Ionic mode and bridge go to `docs/ionic.md`. None of this needs an ADR, because adr/README:79-82 says library defaults and config do not (D6).

### Colour tokens

- **Sources.** The light values are the validated set from `visual-contrast-proposed.txt` (36 of 36 pairs pass, against 29 of 41 failing today). The OKLCH values come from `final/tools/tokens.py` (`tokens.out.json`). The v2 additions were checked by the web prototype's static checker (`prototype/web/contrast-tokens.txt`, 114 pairs) and by `final/tools/v2contrast.py`.
- **Shipping.** Ship OKLCH in CSS, with the hex as the `@supports not (color: oklch(0 0 0))` fallback.
- **Naming.** Tokens use the prefix `--hn-`. The old `--hnch-*` names alias the new ones for one release, then are deleted.

| Token | Role | Light hex · OKLCH | Dark hex · OKLCH |
|---|---|---|---|
| `bg` | page (paper) | `#F6F6F3` · oklch(97.2% 0.004 106) | `#101211` · oklch(18.0% 0.004 165) |
| `surface` | stage, sheets, rail | `#FFFFFF` · oklch(100% 0 0) | `#1A1C1B` · oklch(22.4% 0.004 165) |
| `surface-2` | card tile at rest, inputs, Strip track | `#EEEEE9` · oklch(94.8% 0.007 107) | `#232624` · oklch(26.5% 0.006 157) |
| `line` | hairlines (decorative) | `#DCDCD6` · oklch(89.3% 0.008 107) | `#2C302D` · oklch(30.4% 0.008 153) |
| `line-strong` | borders that convey state | `#8C8C85` · oklch(63.8% 0.010 107) | `#6A6F6B` · oklch(53.6% 0.009 152) |
| `text` | primary ink | `#161716` · oklch(20.3% 0.002 145) | `#F1F2EF` · oklch(96.0% 0.004 122) |
| `text-2` | secondary; **Close** and **No votes** status | `#3F413E` · oklch(37.2% 0.006 135) | `#C9CCC7` · oklch(84.1% 0.008 132) |
| `text-3` | meta, stopwatch, `avg` (replaces `#8E8E93`) | `#62645F` · oklch(50.0% 0.008 125) | `#9EA29C` · oklch(70.7% 0.010 135) |
| `accent` | solid fill: primary button, selected card | `#0B3D2E` · oklch(32.3% 0.058 168) | **v2:** `#267A5A` · oklch(52% 0.095 164) (was `#1F6B4F`, PW #1) |
| `on-accent` | ink on the fill | `#FFFFFF` | `#FFFFFF` |
| `on-accent-2` | **v2 new:** keycap ink on a filled button or selected card | `#E7ECEA` | `#E9F2EF` (white at 0.90 alpha) |
| `accent-text` | links, chips, tonal buttons, Re-vote, icons, **selected-tile ring** | `#0B4A37` · oklch(36.6% 0.069 167) | `#7ED6AA` · oklch(80.8% 0.107 161) |
| `accent-soft` | tonal background; mode column on the Strip; **disabled primary fill** | `#E2EEE8` · oklch(93.8% 0.015 165) | `#1E3A2F` · oklch(32.2% 0.040 167) |
| `focus` | 2 px focus ring | `#1F7A57` · oklch(51.8% 0.101 163) | `#7ED6AA` · oklch(80.8% 0.107 161) |
| `success` | **Agreed**, hnch'd | `#16794A` · oklch(51.0% 0.115 157) | `#5BD38C` · oklch(78.0% 0.149 155) |
| `warning` | **Split**, reconnecting | `#8F5A00` · oklch(51.4% 0.111 70) | `#F2B44C` · oklch(80.9% 0.138 77) |
| `danger` | destructive labels and confirms only | `#B42318` · oklch(50.0% 0.182 30) | `#FF8070` · oklch(74.1% 0.158 29) |
| `on-danger` | **v2 new:** ink on a solid danger button (End for everyone, Remove person) | `#FFFFFF` | `#161716` |

**Measured contrast.** Every pair meets ≥4.5:1 for text and ≥3:1 for UI. The sources are `tokens.out.json` (v1 pairs) and PW `contrast-tokens.txt` (v2 rows).

| Pair | Light | Dark |
|---|---|---|
| text / bg | 16.60 | 16.74 |
| text / surface | 17.98 | 15.24 |
| text-2 / surface | 10.31 | 10.56 |
| text-3 / surface | 5.99 | 6.61 |
| text-3 / bg | 5.53 | 7.26 |
| text-3 / surface-2 | 5.14 | 5.90 |
| text-3 / accent-soft (Strip face on the mode column) | 5.02 | 4.77 |
| on-accent / accent | 12.20 | **5.24** (v2) |
| on-accent-2 / accent (keycap on a fill) | 10.19 | 4.59 |
| **accent fill / surface** (primary vs stage, UI) | 12.21 | **3.27** (v1: 2.67, failed) |
| **accent fill / bg** (UI) | 11.26 | 3.58 |
| **accent-text ring / surface-2** (selected vs unselected tile, UI) | 8.80 | 8.78 |
| accent-text / surface | 10.25 | 9.86 |
| accent-text / bg | 9.47 | 10.82 |
| accent-text / accent-soft (also the tonal disabled primary label) | 8.60 | 7.10 |
| success / surface | 5.43 | 9.09 |
| success / accent-soft (Agreed on the mode column) | 4.56 | 6.55 |
| warning / surface | 5.78 | 9.31 |
| warning / surface-2 | 4.97 | 8.30 |
| danger / surface | 6.57 | 6.99 |
| **on-danger / danger** | 6.58 | 7.33 (white would be 2.45) |
| line-strong / surface | 3.38 | 3.34 |
| focus / surface | 5.28 | 9.86 |
| focus / bg | 4.87 | 10.82 |

**Why the dark fill and the ring changed.**
- **The old fill sank into the page.** `#1F6B4F` measured 2.67:1 against the dark stage, and 2.38:1 against an unselected tile (`critic/contrast.py`; CD-03).
- **The new fill.** PW chose `#267A5A`: white text is 5.24:1 and the fill is 3.27:1 against the stage. It is still only 2.92:1 against an unselected tile (`v2contrast.py`).
- **So selection never relies on the fill alone.** A selected tile always carries a 2 px `accent-text` ring, which measures 8.78:1 in dark and 8.80:1 in light.
- **Mint was considered.** A mint fill (`#7ED6AA` with ink `#0B2A20`, 8.80:1 against `surface-2`) would cut the dark greens from three to two (CD-07). It stays an O8 option for the hallway test (H8).

**The Ionic bridge** (D8; VIS §5.1; A E0.5):
- **Light:** `--ion-color-primary: #0B3D2E`, `--ion-color-primary-contrast: #FFFFFF`. As text on white this is 12.2:1, so primary-as-text is safe.
- **Dark:** `--ion-color-primary: #7ED6AA` and `--ion-color-primary-contrast: #0B2A20`.
  - Ionic-internal primary text (alert buttons, the iOS back chevron, clear/outline buttons, chips) measures 10.82:1 on `#101211`, 9.86:1 on the surface and 8.80:1 on `#232624` alert backgrounds.
  - Dark ink on mint is 8.85:1.
- **Brand fills stay racing green.** `hn-button[kind=primary]` sets `--background: var(--hn-accent)` and `--color: var(--hn-on-accent)` explicitly. Never use `color="primary"` on its own (R-26).
- **Disabled primary is tonal:** `accent-soft` fill with an `accent-text` label. This removes PW #3's green → grey → green flicker at round start.
- `--ion-color-medium` is retired as a text colour. It is mapped to `text-3`.

**Status semantics** (D9; R-29):

| Status | Glyph + word | Colour |
|---|---|---|
| Agreed | `✓ Agreed` | `success` |
| Close | `≈ Close` | `text-2` (neutral) |
| Split | `↔ Split` (terminal on Ink 5: `⇄`) | `warning` |
| No votes | `– No votes` | `text-2` (neutral) |

- **Never red.** Disagreement is normal (UXP §7.3, A16).
- **One gap, with mitigation.** Dark `success` and `accent-text` are perceptually close (ΔE_OK = 0.053, `tokens.out.json`). The glyph and word are therefore mandatory. PW found them distinguishable in context; the H8 hallway check is still open (§9 O8).

**Avatar dots** (ADR-0043 keys unchanged; render-time variants; C §4.3):
- **Method:** each variant keeps the OKLCH hue, with lightness adjusted until the dot reaches ≥3:1 against `bg`, `surface` and (dark) `surface-2`. Initials ink is whichever of `#FFFFFF` / `#161716` gives ≥4.5:1.
- **v2: the mode column.** Against the light `accent-soft` mode column, 8 of 12 light variants fall to 2.73–2.96:1, and 3 of 12 dark variants fall to about 2.45:1 (`critic/contrast.py`; CD-03). So dots on the Strip, the table and stacks carry a **1.5 px `surface` ring**. The ring separates every dot from whatever tint it sits on, and `accent-soft` joins the clamp targets for the dot fill itself.
- **Hue collisions:** when two people in a room share a hue, the later joiner's dot gets a 2 px `line-strong` ring.
- **Custom hex:** goes through the same clamp at render time. Stored values are untouched.

| Key | Base | Light variant (≥3:1) · ink | Dark variant (≥3:1) · ink |
|---|---|---|---|
| racing-green | `#0B3D2E` | `#0B3D2E` (11.3) · white 12.2 | `#497866` oklch(53.3% 0.059 168) (3.03) · white 5.05 |
| dijon | `#C9A227` | `#AE8A0C` (3.01) · ink 5.51 | `#C9A227` (6.32) · ink 7.43 |
| blue | `#0A84FF` | `#0A84FF` (3.37) · **ink** 4.93 (white today: 3.41–3.65, fails) | `#0A84FF` (4.19) · ink 4.93 |
| indigo | `#5E5CE6` | `#5E5CE6` (4.67) · white 5.06 | `#5E5CE6` (3.02) · white 5.06 |
| violet | `#BF5AF2` | `#BF5AF2` (3.25) · ink 5.10 | `#BF5AF2` (4.34) · ink 5.10 |
| pink | `#FF375F` | `#FF375F` (3.25) · ink 5.10 | `#FF375F` (4.34) · ink 5.10 |
| red | `#FF453A` | `#FF453A` (3.15) · ink 5.28 | `#FF453A` (4.49) · ink 5.28 |
| orange | `#FF9F0A` | `#CA7D0B` (3.01) · ink 5.52 | `#FF9F0A` (7.43) · ink 8.74 |
| amber | `#FFD60A` | `#A78C0F` (3.03) · ink 5.48 | `#FFD60A` (10.82) · ink 12.73 |
| green | `#30D158` | `#07A43C` (3.04) · ink 5.46 | `#30D158` (7.56) · ink 8.89 |
| teal | `#40C8E0` | `#139CB1` (3.02) · ink 5.49 | `#40C8E0` (7.68) · ink 9.04 |
| graphite | `#1C1C1E` | `#1C1C1E` (15.7) · white 17.0 | `#6F6F71` (3.05) · white 5.01 |

"ink" = `#161716`. Today graphite is 1.00:1 and racing green 1.39:1 on dark (UX-057).

### Type

One family: **Inter Variable**.
- **Hosting:** self-hosted, `font-display: swap`. The weight axis is limited to 400–750. Verify the SIL OFL licence in T1.4a.
- **Subsets (v2, CD-18):** Latin + Latin-Ext + Vietnamese load by default (≤60 kB, R-61). Cyrillic and Greek load through `unicode-range` only when a glyph needs them, so a teammate named Łukasz, Nguyễn or Юлия renders in Inter.
- **No precache claim.** v1 said "precached for offline use", but there is no service worker (O15).
- **Fallback stack:** `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Features:** `font-feature-settings: 'tnum', 'cv11'` on numerals.
- **Mono** is only used for the npx line in Invite: `ui-monospace, SFMono-Regular, Menlo, monospace`.
- **Display face option (O8, opinion):** a digits-only display face (subset ≈10 kB) for the hero and card faces would add character at almost no byte cost (CD-07).

| Token | Size / line · weight | Use |
|---|---|---|
| `--hn-type-caption` | 12/16 · 500 | meta row ("Story 3 of 12 · PROJ-101"), keycaps, badges |
| `--hn-type-small` | 14/20 · 400 | status line, secondary, chips |
| `--hn-type-body` | 16/24 · 400 | body; inputs (16 px avoids the iOS zoom) |
| `--hn-type-label` | 15/20 · 600 | buttons, list titles (sentence case, no tracking); card faces of ≥4 characters ("Medium") |
| `--hn-type-title` | 20/28 · 600 | story H1 on phone; sheet titles |
| `--hn-type-headline` | 28/34 · 700, −0.01em | story H1 on desktop; card faces of 3 characters ("XXL") |
| `--hn-type-numeral` | 40/40 · 700, tnum | card faces of ≤2 characters |
| `--hn-type-display` | 64/64 · 750, tnum (96 at ≥1600 px) | revealed hero value; summary totals |

- **One face size per deck** (v2, PW #9). The scale's longest face picks numeral, headline or label for the whole deck. Mixed sizes within one deck looked broken: "Low" at 28 px next to "Medium" at 15 px.
- **Weights:** 400, 600 and 700 (750 for display only). No `text-transform: uppercase` anywhere. Today there are 28 sizes and 5 weights (UX-059).

### Space, radius, elevation, layout

- **Space:** `--hn-space-1…8` = 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Phone gutter 16; today it is 42 (UX-045). Spacing literals are banned (R-24).
- **Radius:** `sm 8` (chips, inputs, keycaps), `md 12` (buttons, card tiles), `lg 20` (stage, sheet top), `pill 999` (dots, code pill).
- **Elevation:** one elevated plane, the stage.

| Level | Used for | Light | Dark |
|---|---|---|---|
| `e0` | `bg`, rail, lists | flat | flat |
| `e1` | stage, card tiles | `0 1px 2px rgb(0 0 0 / .06), 0 1px 1px rgb(0 0 0 / .04)` | no shadow; 1 px `line` border + surface step |
| `e2` | sheets, popovers, toasts | `0 8px 24px rgb(0 0 0 / .12)` | `0 8px 24px rgb(0 0 0 / .5)` + 1 px `line` |

No card-in-card. No accordion cards.

**Layout tokens:**

| Token | Value |
|---|---|
| `--hn-header-h` | 52 |
| `--hn-action-h` | 52 phone / 44 desktop |
| `--hn-frame-max` | **1136** (v2, PW #11) |
| `--hn-stage-max` | 720; **960 at ≥1600 px** (v2, CD-08) |
| `--hn-rail-w` | 320 |
| `--hn-stage-body-min` | 320 desktop / 0 phone, plus a reserved second H1 line on desktop (v2, D17) |
| `--hn-tile-w` | 64 desktop; 88 at ≥1600 px; phone tiles fill 4 columns (5 above 9 faces) |
| `--hn-dialog-w` | 480, height auto |

- **Strip height** is bounded: stacks cap at 5 dots, then a `+N` chip. Below a viewport height of 700 px they cap at 3 (CD-04). That keeps the stage body within `--hn-stage-body-min` (D17).
- **Desktop "queue done" state:** the presence row is dropped there, because the rail already shows people (PW #12).

### Motion

| Token | Value | Use |
|---|---|---|
| `--hn-dur-press` | 100 ms | press scale .97, card lift 4 px |
| `--hn-dur-state` | 160 ms | presence dot fills, chips, toasts |
| `--hn-dur-enter` | 240 ms | phase cross-fade, sheet, stamp |
| `--hn-dur-cap` | 400 ms | max for anything in the loop; reveal morph total |
| `--hn-dur-delight` | 900 ms | hnch'd burst only (non-blocking) |
| `--hn-settle` | 500 ms (tunable 300–700; set by O11 after the W2 hallway) | the auto-reveal settle window (ADR-0050) |
| `--hn-ease-out` | `cubic-bezier(.05,.7,.1,1)` | entering |
| `--hn-ease-std` | `cubic-bezier(.2,0,0,1)` | moving |
| `--hn-ease-spring` | `cubic-bezier(.34,1.4,.64,1)` | card select and hero entrance only |

**Signature moments.** Each costs 0 taps and never blocks (C §4.5, trimmed):
1. **Lift:** the selected card rises 4 px, fills with accent and gains its ring.
2. **Settle ring:** during the settle window the presence dots close into a ring, and the status reads "Everyone's in…" (`p-light-07-settling-everyones-in.png`).
3. **Reveal morph:** on phone, the dots fly from their seats on the table into their Strip columns. Uses View Transitions, feature-detected (UXP §10.2), with a ≤40 ms stagger and ≤400 ms total.
4. **hnch'd:** on Agreed (≥2 votes), the dots converge, a "✓ hnch'd" stamp lands on the hero, a ≤900 ms vector dot burst plays, and a success haptic fires where supported (`p-light-24-host-agreed-burst.png`). *Measured*: the primary stayed clickable on 67/67 frames during the burst (PW).
5. **Stamp:** on Accept, the number flies into Stories → Done (240 ms). The next round's meta row then reads "Previous: PROJ-101 → 8".

**Reduced motion** turns all five into cross-fades and sets `provideIonicAngular({ animated: false })`. The settle ring still fills, because it carries information (PW). The static "✓ hnch'd" stamp still shows. Local selection and navigation started from the keyboard are not animated, but shared phase transitions animate for everyone (R-31, CD-12). No `transition: all`.

## 5. Components

### Ionic mode decision

- **Configuration:** `provideIonicAngular({ mode: 'ios', rippleEffect: false, backButtonText: '', backButtonIcon: 'chevron-back-outline', animated: !prefersReducedMotion })` in `packages/client/src/main.ts`.
- **Recorded in:** `docs/ionic.md` (lines 5–7 are rewritten) and `docs/design.md`, after the owner decides O2 on day 1. **v2: there is no ADR.** This is a library default under ADR-0002 (adr/README:79-82; CP-10).
- **Where Ionic is used:** toolbar, sheets, popovers, alerts, toasts and gestures only.
- **Plain semantic HTML on tokens:** the stage (story bar, table, deck, Strip, hero, action bar).
- **Android check:** hardware back and sheet drag in `ios` mode (A R6, C R5).
- **WebKit parity:** PW ran the loop on WebKit in both themes with 0 errors and no overflow (`webkit-phone-dark-revealed.png`).

### Brand components to build (`packages/client/src/app/ui/`)

| Component | Responsibility | Replaces / fixes |
|---|---|---|
| `hn-button` | Kinds: primary (accent fill), secondary (accent-text outline), quiet (text), danger (`on-danger` on `danger`). **Disabled = tonal.** Sentence case. Keycap slot on fine pointers (`on-accent-2`) | md uppercase; primary-as-text (UX-048, UX-055) |
| `hn-action-bar` | The one primary per phase. Phone: sticky in the safe area. Desktop: the stage footer row. Sets `scroll-padding-bottom` | full-bleed `ion-footer` (UX-041) |
| `hn-room-header` | ‹ step-out · "name · CODE" (opens Invite) · people stack · status dot · ⋯. Below 360 px: share glyph hidden, 2 dots + count | big code card, connection chip and banner (UX-061) |
| `hn-story-bar` | Meta row "Story 3 of 12 · PROJ-101 · 0:42" (or "Previous: PROJ-101 → 8" for the first round after an Accept); H1 title (host: inline edit, paste-split) | "Round N" H1 (UX-077) |
| `hn-status-line` | Persistent polite live region using the R-34 announcement reducer; copy from the shared catalog; buttons never inside | no announcements (UX-068) |
| `hn-table` | **v2 new (phone/tablet):** presence dots + names centred as the table, filling as people vote. On reveal it hands its space to the hero | the dead void (PW #13) |
| `hn-deck` + `hn-card-tile` | Native `<button aria-pressed>`; roving tabindex. States: idle / hover / selected (fill + ring) / pending-commit (2 px dashed `line-strong` border + "typing…" hint, CD-03) / pass / disabled. One face size per deck; keycaps only on letter scales (numeric decks show one keycap hint row) | `ion-card` grid (UX-067) |
| `hn-strip` | Dot plot over the full scale + Pass column; mode tint; suggested caret ▲; Low/High (only the side that differs); hollow dots for the previous round; `role="img"` + a visually hidden table. Columns are full-height hit areas | vote groups (UX-034) |
| `hn-hero` | Display value or "Split · 3–21", status word + glyph, "took 1:12", `avg 8.4`. **Tappable for the host on coarse pointers:** opens the in-stage value chip row (44 px chips, R-36) | Avg/Med decimals (UX-035) |
| `hn-dot` / `hn-avatar-stack` | Avatar dot with variants (§5.1), a 1.5 px surface ring, voted / waiting / away rings, collision ring; stack of ≤4 + count | 10 px initials, colour-only state (UX-057) |
| `hn-chip`, `hn-kbd` | Tonal chip; keycap | `ion-chip` with role-less `aria-pressed` |
| `hn-sheet` | Single level (runtime assert), `handleBehavior:'cycle'`, header actions per `docs/ionic.md` | nested sheets (UX-044) |
| `hn-toast` | One row, semantic icon, optional Undo button, one at a time. **v2:** it only *renders* undo. The commit logic lives in the `DocService` pending-commit queue (D4) | stacked toasts (LW-36) |
| `hn-code-input` | One native input styled as 6 segments; accepts a link; auto-submit | 6 inputs, "HTTPSH" (UX-026) |
| `hn-paste-box` | Multi-line story paste with a live parsed preview ("3 stories · PROJ-101 Login form …"); one "Undo paste" toast per batch | one sheet per story (UX-021) |
| `hn-summary-card` | Session summary: totals (a sum per numeric scale, a distribution per categorical scale), `Story \| Points` table, Copy, CSV, Run it back (host, only here) | no closure (UX-040) |

## 6. Icons

### Iconography

- **Set:** Ionicons **outline** at 20 px in content and 24 px in toolbars.
- **Registry:** one registry, `packages/client/src/app/core/icons.ts`. A test fails on any template name that is not registered, and on Ionicons console warnings (UX-054).
- **No emoji in chrome.** The concept table (B §4.6, extended):

| Concept | Icon | Concept | Icon |
|---|---|---|---|
| Step out (back) | `chevron-back-outline` | Overflow | `ellipsis-horizontal` |
| Invite | `person-add-outline` | Copy link | `copy-outline` |
| Share | `share-outline` | QR | `qr-code-outline` |
| Stopwatch | none (tabular text) | Re-vote | `refresh-outline` |
| Skip story | `play-skip-forward-outline` | Remove story | `close-outline` |
| End for everyone | `power-outline` | Leave | `exit-outline` |
| Offline / reconnecting | `cloud-offline-outline` / `sync-outline` | Watch only | `eye-outline` |
| Add / paste stories | `add-outline` / `clipboard-outline` | Undo | `arrow-undo-outline` |
| People | `people-outline` | Profile | `person-circle-outline` |
| Help / keys | `help-circle-outline` | Host | text badge "host" (not a star or a crown) |

Skip and End no longer share an icon (A11Y M6).

## 7. Copy

Voice and wording rules are R-41 to R-44 and R-60 (§2). Every user-facing string comes from the shared message catalog in `@hnch/shared`.

### Vocabulary

| Old term | New term |
|---|---|
| Lobby / Estimating | Room (waiting / voting / revealed) |
| Abstain this round | Pass |
| Next Round N | Accept 8 · Next |
| Skip round / Discard | Skip story |
| Agenda | Stories |
| Round N | Story 3 of 12 (one format on every surface, D10) |
| Unanimous / Spread | Agreed / Split |

## 8. Keys

Once the registry exists (T1.3a), this section is generated from `packages/shared/src/interaction/`; do not edit it by hand. Until then it mirrors the plan (§6.5).

**Shared keymap** (v2; generated from `packages/shared/src/interaction/`; web desktop and CLI):

| Intent | Key | Phase | Role | Safety |
|---|---|---|---|---|
| Vote | type the face (`8`; `1` `3` = 13; `m` = M; `xl`; Risk `l m h c`) | voting | voter | Resolver per D5/R-17. Candidates highlight at once; the write happens on commit |
| Move / cast | ←/→, then Space (web: Enter on a focused card casts) | voting | voter | **No `h`/`l`**: they are T-shirt `L` and Risk `High`/`Low` (PT L11; CD-02) |
| Pass | `-` | voting | voter | reserved key |
| Clear vote | ⌫ | voting | voter | Undo toast "Vote cleared" |
| **Primary** | ⏎: Start / Reveal / Accept · Next / Re-vote | all | host | **Ignored while a prefix is pending and for 600 ms after any vote key** (the footer shows `⏎ vote 2` instead). On web it fires only when focus is not on a button or field (CD-02) |
| Re-vote | `v` | revealed | host | — |
| Change the agreed value | ←/→ (web), ↑/↓ or ←/→ (CLI, the histogram is vertical), or type the value | revealed | host | — |
| Edit story | `e` | waiting, revealed | host | inline field; Esc hands keys back |
| Add stories (paste) | `+` | waiting, revealed | host | — |
| Invite / copy link | `i` / `c` | waiting, revealed | all | — |
| Watch ↔ vote | `o` | waiting, revealed | all | — |
| Menu | `m` (waiting, revealed); `esc` at the base layer while voting (CLI) | all | all | Skip story (undo), Room settings, Hand off, End (confirm), Leave |
| Undo | `u` on both surfaces while an undo toast shows, if `u` does not start a face in the current deck; also `⌘Z`/`Ctrl+Z` on web | any | the actor | — |
| Help | `?` | any; in a text field only while it is empty | all | reserved key |
| Close top layer | Esc | any | all | never quits; a base-level Esc within 400 ms of closing a layer is ignored |
| Leave | `q` (CLI base layer, not voting) / ⋯ → Leave | any | all | confirm only for a host with others online |

**Rules:**
- **While voting, letters and digits belong to the deck.** No command letter is bound in that phase. This removes today's `s` = start/skip and `a` = agenda/abstain collisions (UX-097). A command letter that is not a face flashes "letters are cards while voting; esc opens the menu (leave is there)" (`80x24/17-voting-q-is-not-a-command.txt`).
- **Reserved keys win over faces:** `?`, `-`, ⏎, Esc, ⌫ and Space. Custom faces that start with a reserved character, or that are not ASCII, are cast with the arrows. The scale editor says so (R-51; CP-16).

## 9. Terminal

### Terminal palette (ANSI-16 semantic tokens)

| Token | ANSI | Use | Web twin |
|---|---|---|---|
| `fg` | default | body | `text` |
| `muted` | bright black | hint labels, rules, `·` separators (never the only copy of essential information) | `text-3` |
| `accent` | green | brand `●`, your own vote (heavy box), links | `accent-text` |
| `success` | green **bold** + `✓` + word | `✓ Agreed`, `✓ voted`, `● live` | `success` |
| `neutral` | default **bold** | `≈ Close`, `– No votes` | `text-2` |
| `warning` | yellow | `↔`/`⇄ Split`, `◌ reconnecting` | `warning` |
| `danger` | red | destructive confirms, errors, `✗ offline` | `danger` |
| `cursor` | inverse **+ glyph `▲` under the focused card** | focused card | `focus` |
| `selection` | inverse **+ glyph `▸`** | selected histogram row, menu item | — |

- **v2: inverse never stands alone.** At chalk level 0 (`FORCE_COLOR=0`, `TERM=dumb`), inverse and bold vanish too. Without a glyph, the arrow-key cursor became invisible (PT L8, `80x24-FORCE_COLOR0/01-cursor-on-card-1.ansi`; matches CLI-15).
- **`NO_COLOR` is a theme switch** that drops colour props and keeps inverse and bold. *Measured*: 0 colour codes, 18 inverse kept (PT).

**Accent choice (opinion).** The accent is green, not CC §4.5's cyan, so that "hnch is green" holds on every surface (J-des). Accent and success share a hue, so success always carries a glyph and a word. If the terminal hallway test (H7, H8) shows confusion, switch to cyan (§9 O8).

**Glyphs** (ASCII fallback with `HNCH_ASCII=1` or auto on `TERM=linux`; widths self-checked at start-up against the renderer's own `string-width`, R-49):

| Glyph | ASCII | Meaning |
|---|---|---|
| ● | `*` | live / voted / brand |
| ○ | `o` | waiting |
| ◌ | `~` | reconnecting |
| ✗ | `x` | offline |
| ✓ | `+` | agreed / voted |
| ≈ | `~=` | close |
| ↔ (`⇄` on Ink 5) | `<>` | split |
| – | `-` | no votes / watching |
| ▸ | `>` | next / selection |
| ▲ | `^` | cursor / suggested |
| █ | `#` | Strip bar |
| ─ | `-` | rule |

`string-width` 7.2.0 (Ink 5) measures `↔` and `⏱` as 2 cells, while terminals draw 1. Every row containing `↔` was one cell short (PT L7). Layout code must import `string-width` from Ink's own dependency tree.

### TUI layout grid (80×24)

| Row | Content |
|---|---|
| 1 | Header: `hnch● Sprint 42 · K7P-9MR` … right-aligned `● live · Hana (host)` |
| 2 | Rule (muted) |
| 3 | Story line: `Story 3 of 12 · PROJ-101 · Login form validation` … right-aligned `0:42` |
| 4 | Status line (phase copy from the shared catalog) |
| 5 | blank |
| 6–16 | **Stage**, 11 rows. Voting: a row of 3-row card boxes (heavy border = your vote, dashed = pending-prefix candidates; a flat `[8]` row when boxes don't fit) + pass hint + a hint row. Revealed: one histogram row per scale value (empty rows included) + pass row + hint row. Waiting: invite panel with the QR, or Up next |
| 17 | Presence: `● you ● Ana ○ Sam ○ Bob ● Dev – Eve watching   3 of 5 voted` (it sits right under the deck; the spare rows go below it, PT deviations) |
| 18–20 | spare; at 60×20 this collapses |
| 21 | **Toast row** (reserved, never shifts layout) |
| 22 | Rule |
| 23 | Footer (one row, generated) |
| 24 | **unused, and load-bearing on Ink 5:** a frame of `rows − 1` avoids `clearTerminal` on every render (R-45; PT L6) |

**Other widths and layers:**
- **≥100 columns:** a 30-column right panel holds People · Up next · Done. It is suppressed while the host waits alone, because it would duplicate Up next and squeeze the QR. With people present, the stage shows a "Next up" block instead of a second list (PT).
- **60×20:**
  - the session name is dropped from the header;
  - presence collapses to "3 of 5 · waiting Sam, Bob";
  - histogram names are truncated with `…`;
  - the footer keeps ≤3 hints + `?`;
  - the **invite overlay takes over** the header-through-toast rows, with the code and `c copy link` beside the QR (`60x20/02-invite-overlay.txt`).
- **QR:** version 3, **31×16 cells** with a 1-module margin (PT L10; v1 said 31×17). It is hidden in ASCII mode. Under `NO_COLOR`, polarity is right only on dark themes, and phone scanning is still unverified.
- **Overlays** blank the body band under them, rather than splicing a box over cards or bars (PT L13).

## 10. Approved frames

Pending. Ticket T1.0 commits the owner-approved key frames (every Room phase × role × phone/desktop × light/dark, plus 4 terminal frames) to `docs/design/frames/` and links them here. They become the R-56 references.

## 11. Definition of Done

- [ ] The behaviour matches §2 and §6 (including the §6.7 state rows it touches), or the PR updates them, plus `docs/ux.md` / `docs/cli.md` (R-53, R-57).
- [ ] Budgets: `budget.spec.ts` and the CLI pty counter pass with no regressions (R-03, R-04).
- [ ] No new modal in the loop (R-02), and no new Room control without a removal (R-09).
- [ ] Shared-only reads (R-15), shared words from the catalog (R-42, R-60), and untrusted text through `toDisplayText()` (R-58). The keys and labels for any new command are in the registry (R-51).
- [ ] Tokens only, spacing included (R-24). Contrast spec and axe are green in light and dark (R-25).
- [ ] Phone 390 + 320, tablet 768 and desktop 1440 screenshots, in light and dark, re-approved in this PR and checked against the approved frames (R-54, R-56).
- [ ] Keyboard path works: one tab stop for the deck, focus visible, not obscured and anchored on phase change, shortcuts off-able (R-35 to R-37, R-62).
- [ ] Live region policy, headings and title (R-33, R-34, R-40, R-63).
- [ ] Motion: ≤400 ms, non-blocking, reduced-motion variant (R-31, R-32).
- [ ] CLI: pure-view snapshots at 60/80/100/120. Idle bytes within R-47. `NO_COLOR` clean, with glyphs for inverse states. Esc/`q` semantics (R-45 to R-50).
- [ ] Destructive paths: undo or confirm as specified. Back is safe (R-10, R-11). Host round writes pause while offline (R-13).
- [ ] Copy reviewed: sentence case, device-neutral, "you" (R-41).
- [ ] Any schema change: reviewed by `yjs-schema-architect`, additive, with mixed-version behaviour documented in `docs/schema.md`.
- [ ] Anything touching passwords, links, relay requests, clipboard or terminal escape output: `security-reviewer` sign-off.
- [ ] `reviewer` agent pass. The PR description lists before/after action counts and the Room control count.
