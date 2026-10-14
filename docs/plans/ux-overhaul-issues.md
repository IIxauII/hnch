# hnch UX issue register (companion to ux-overhaul.md)

**Status:** Draft, 2026-10-13. Evidence index for [ux-overhaul.md](ux-overhaul.md); `UX-nnn` ids are cited throughout that plan.

Built 2026-10-13 from the eight skeptic-verified audits (`reports/*.verified.md`) and `wf1.json`. The verified verdicts and adjusted severities win over the auditors' originals. Refuted findings are in Appendix A.

**Conventions**

- **Source ids** use `<audit>:<id>`: `jrn` journeys, `hot` hotloop, `vis` visual, `feat` features, `a11y` desktop_a11y, `cli` cli, `lweb` live_web, `lcli` live_cli. Issues the verifiers found themselves use their numbering from `<audit>.verified.md` (`jrn:M-1`, `hot:M-1`, `vis:M1`, `feat:M1`, `a11y:M1`, `cli:M1`, `lweb:M1`, `lcli:M1`). `feat:F-xx` and `lcli:F-xx` are different findings that happen to share a numbering scheme.
- **Sources** are merged into the issue. **Related** findings cover one aspect only and are merged primarily elsewhere.
- **Severity** is the highest verified (post-adjustment) severity among the primary sources. Where verifiers disagreed, or a source's raise belonged to a different aspect, the note says so.
- **Status**: `confirmed` means the core claim reproduced as stated, or a verifier found the issue with evidence. `adjusted` means the verifier changed the severity, scope or recommendation.
- **Surfaces**: `web-desktop`, `web-mobile`, `cli`.
- **Paths**: `packages/…` and `docs/…` are repo-relative. Evidence links (live screenshots, terminal frames, scripts, reports) point into the orphan branch [`ux-overhaul-artifacts`](https://github.com/IIxauII/hnch/tree/ux-overhaul-artifacts). `docs/screenshots/latest/…` are CI captures as of 2026-10-13; `main` prunes old ones, and the frozen copies are in `ci-screenshots/sha-b23d9c7/` on that branch.
- **Cut candidate** means an auditor proposed cutting or merging the feature. Whether to cut is a product decision; many cuts need an ADR first (see the ADR line).

## Summary

| Theme | critical | high | medium | low | total |
|---|---:|---:|---:|---:|---:|
| correctness/trust | 2 | 10 | 2 | · | 14 |
| core-loop speed | 1 | 5 | 2 | 1 | 9 |
| entry/join | · | 2 | 7 | · | 9 |
| results & decision | · | 2 | 6 | · | 8 |
| layout & responsive | · | 4 | 3 | · | 7 |
| visual system | · | 7 | 9 | 2 | 18 |
| accessibility | · | 7 | 3 | 1 | 11 |
| copy | · | · | 2 | · | 2 |
| settings/IA bloat | · | · | 4 | 4 | 8 |
| CLI command surface | · | 3 | 4 | · | 7 |
| CLI TUI | 1 | 4 | 6 | 2 | 13 |
| docs drift | · | · | 2 | 1 | 3 |
| **total** | **4** | **44** | **50** | **11** | **109** |

Input: 302 verified findings and verifier-found issues, of which 2 were refuted and 1 was unverifiable. They merge into **109 canonical issues**.

### Critical and high at a glance

| ID | Sev | Theme | Title |
|---|---|---|---|
| UX-001 | critical | correctness/trust | Premature auto-reveal: a voted participant who reloads, reconnects, soft-exits or drops the socket reveals the round for everyone |
| UX-002 | critical | correctness/trust | Peers get stranded on a stale Lobby mid-round (Estimating ⋯ 'Session settings', browser/OS back) because Lobby auto-nav never re-fires |
| UX-015 | critical | core-loop speed | The CLI estimate loop costs ~3x the necessary keystrokes: an arrows-only card picker that clamps and resets to card 0, no digit or value typing, and two prompts per story |
| UX-094 | critical | CLI TUI | CLI Settings → Access → Password freezes the TUI: keys echo raw, and only Ctrl+C escapes, which also wipes resume |
| UX-003 | high | correctness/trust | startRound has no active-round guard: the Lobby offers 'Start Round N+1' while a round is voting, which creates concurrent, orphaned rounds |
| UX-004 | high | correctness/trust | Discarded rounds leak into History and the 'latest Results': hidden votes are exposed, numbering counts tombstones, and in the CLI [v]/[t] then act on a different round |
| UX-005 | high | correctness/trust | Discarding or skipping a round is a one-gesture destructive act with no confirm or undo (web host back chevron; CLI d/s keys), spread over five overlapping 'move on' verbs |
| UX-006 | high | correctness/trust | Any participant can change the room's scale and password (Session settings is not host-gated) |
| UX-007 | high | correctness/trust | A host who sets a password is locked out of their own room on reload (the hash is cached neither on create nor via Lobby settings) |
| UX-008 | high | correctness/trust | Roster and 'Didn't vote' eligibility is wrong: observers, late joiners and departed or kicked participants are counted on web and CLI, and past results change retroactively |
| UX-009 | high | correctness/trust | CLI quit (q→y or Ctrl+C) never leaves the room and wipes every cached room, so resume is impossible and ghost participants remain |
| UX-010 | high | correctness/trust | The CLI ignores being kicked and lacks leave/description parity (ADR-0036 §5) |
| UX-011 | high | correctness/trust | The CLI never observes the agenda: added stories stay invisible, and the next round is not pre-filled or linked |
| UX-012 | high | correctness/trust | The CLI status bar stays on 'connecting' in password rooms even though sync works |
| UX-016 | high | core-loop speed | The web round-start is a modal on every story: no autofocus, Enter does nothing on open, three fields, and the one-tap start from the agenda was never built |
| UX-017 | high | core-loop speed | Every round costs two route transitions and a full dashboard re-layout (Lobby → Estimating → Lobby) |
| UX-018 | high | core-loop speed | Desktop digit shortcuts vote by card position, not face value ('8' casts 21, '3' casts 2, the 0 card is unreachable), with no visible key hints |
| UX-019 | high | core-loop speed | The desktop host loop is mouse-only: no Start/Reveal/Next/Re-vote keys, 12 Tabs to reach Start, and shortcuts are undiscoverable and cannot be turned off |
| UX-020 | high | core-loop speed | Joiners get no waiting state between rounds and no cue when a round opens (empty Agenda card, no 'waiting for host') |
| UX-024 | high | entry/join | Create Room shows no loading state and fails silently when the relay is unreachable |
| UX-025 | high | entry/join | Dismissing the create-time password sheet strands the host on Home with an orphaned room |
| UX-033 | high | results & decision | The loop records no decision: there is no final or agreed estimate per story, so the session has no output |
| UX-034 | high | results & decision | After reveal, results are buried: the 5th card on phones, partly under the footer, with weak hierarchy (6-12% bar opacity, muted story title, name chips straddling the bars) |
| UX-041 | high | layout & responsive | The desktop CTA bar is full-bleed at the viewport bottom, far from the content (the 'inline CTA' CSS is a no-op), with ragged card grids and empty voids |
| UX-042 | high | layout & responsive | The Lobby is an accordion stack (up to 6 sections), and 'locked' sections still show chevrons and collapse on tap or Enter (the room code disappears) |
| UX-043 | high | layout & responsive | Agenda rows are crowded: 5 icon buttons per row, action columns jump between rows, phone titles wrap mid-word, and skip and cancel duplicate each other |
| UX-044 | high | layout & responsive | Desktop dialogs are a fixed 500px tall: the QR is clipped under the header, short dialogs are mostly empty, and nested pickers bypass the desktop dialog style |
| UX-048 | high | visual system | In dark mode, the accent used as text or icon colour is illegible (Voter chip and name chips 1.72:1, Re-vote outline 2.65:1, agenda +, pencils, kebabs) |
| UX-049 | high | visual system | The theme-accent picker offers accents that fail as text app-wide (9 of 12 are below 4.5:1 on white), and ADR-0043's 'pre-validated AA' premise is false |
| UX-050 | high | visual system | In light mode, the selected estimate card's numeral is 2.45:1 |
| UX-051 | high | visual system | Secondary and status text fails AA in both themes (#8E8E93 grey at 2.92-4.27:1; light 'Unanimous' 2.02:1, 'Close' 2.06:1, 'Spread' 3.41:1) |
| UX-052 | high | visual system | The Onboarding 'Continue' button renders dark-on-green (2.57:1) in Material dark |
| UX-053 | high | visual system | No brand in the browser chrome: the tab title is 'Ionic App' on every route, the favicon is Ionic's, and there is no manifest or theme-color |
| UX-054 | high | visual system | The agenda Skip button and the skipped-state glyph render blank (icon name mismatch) |
| UX-066 | high | accessibility | The Lobby exposes zero headings, and its regions are unlabelled (aria-label on a role-less div) |
| UX-067 | high | accessibility | Card grid: the selected card is not exposed as pressed, and every card is its own tab stop (roving tabindex is ineffective) |
| UX-068 | high | accessibility | No status announcements, and focus drops to <body> on reveal and on auto-navigation |
| UX-069 | high | accessibility | The Voter/Observer toggle is a non-focusable 1.72:1 chip in the voting toolbar: a third opt-out control that also changes the auto-reveal denominator |
| UX-070 | high | accessibility | Pinch-zoom is disabled by the viewport meta tag |
| UX-071 | high | accessibility | Keyboard focus rings fail 3:1 non-text contrast in dark mode |
| UX-072 | high | accessibility | Host actions on phones are swipe-only (hidden from keyboards and screen readers), the drawer options are icon-only, and the swipe hint shows even when the host is alone |
| UX-087 | high | CLI command surface | `hnch resume` with two or more cached rooms always fails ('No selection made.'), and its prompt is invisible |
| UX-088 | high | CLI command surface | `hnch agenda add/list/…` print their result but never exit (an undestroyed Awareness keeps Node alive) |
| UX-089 | high | CLI command surface | The CLI password prompt has no visible label and echoes the password in plain text, and a wrong password on `join` drops into a fake lobby |
| UX-095 | high | CLI TUI | The CLI clears the whole screen and scrollback every second once the frame is taller than the terminal, and narrow terminals split words and leave ghost lines |
| UX-096 | high | CLI TUI | CLI key-hint rows are overloaded (up to 10 hints) and wrap mid-label even at 100 columns |
| UX-097 | high | CLI TUI | CLI keys change meaning across screens (s = Start/Skip, a = Agenda/Abstain), destructive d/s act on a single keypress, e is host-only in the lobby, and the docs disagree |
| UX-098 | high | CLI TUI | CLI overlays have no modal stack: Esc does nothing in the hand-off picker, '[q] Cancel' also opens 'Leave session?', one 'y' can confirm two prompts, and the picker can't reach participant 10+ |

## correctness/trust (14)

### UX-001 · critical · Premature auto-reveal: a voted participant who reloads, reconnects, soft-exits or drops the socket reveals the round for everyone

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `jrn:J-01`, `jrn:M-1`, `hot:H-10`, `hot:M-3`, `lweb:LW-01`, `lweb:M2`
- **Status:** confirmed: Reproduced live by three auditors and their verifiers (rooms 73DFAM, HKCPFS). Verifiers widened the cause from soft-exit to any reload or socket drop of a voted peer. H-10 was adjusted but kept critical.
- **Evidence:**
  - packages/shared/src/auto-reveal.ts:56-70 (denominator = online awareness only; evaluates synchronously on construction with only self in awareness)
  - y-websocket.js:142-151 removes all remote awareness states on any socket close, so a network blip also triggers it (lweb:M2)
  - packages/client/src/app/lobby/lobby.page.ts:1571-1581 (softExit only navigates) and packages/client/src/app/core/room-join.service.ts:87 (doRejoin always tears down)
  - [live/web/repro-reload-reveal/desktop/log.json](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/repro-reload-reveal/desktop/log.json) (trials 1 and 3, voted voter reloads: hostRevealed=true; trials 2 and 4: no reveal)
  - [live/web/repro-reload-reveal/desktop/02-h1-trial1-voted-voter-reloads-host.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/repro-reload-reveal/desktop/02-h1-trial1-voted-voter-reloads-host.png) ('5 (1 vote) · Didn't vote (2) · Unanimous')
  - CLI uses the same driver: packages/cli/src/session.ts:292
- **Fix direction:** Evaluate auto-reveal only when the socket is connected, initial sync is done and a remote awareness update has arrived since connect. Add a 3-10 s presence grace before a dropped voter leaves the denominator. Add e2e tests for reload-after-vote and socket-drop on web and CLI.
- **ADR:** The presence grace amends ADR-0018 decision (3). Gating on sync alone is compatible with ADR-0018. A host-only reveal writer is not (lweb:LW-01 note).

### UX-002 · critical · Peers get stranded on a stale Lobby mid-round (Estimating ⋯ 'Session settings', browser/OS back) because Lobby auto-nav never re-fires

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `hot:H-02`, `jrn:J-09`, `feat:F-08`, `a11y:RA-21`, `feat:M3`, `hot:M-2`, `lweb:LW-05`
- **Status:** confirmed: H-02 confirmed critical. J-09, F-08, RA-21 and feat:M3 describe the same dead menu item (RA-21 was adjusted to 'worse than reported'). hot:M-2 and LW-05 show that browser back has the same root cause, so removing the menu item alone is not enough.
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:1193-1199 (the auto-nav effect reacts only to screen() changes and does not re-run on a cached page)
  - packages/client/src/app/estimating/estimating.page.ts:766-777 (the menu item only navigates; the settings sheet never opens)
  - [live/web/verify-hotloop-h02/desktop/01-vic-h02-voter-after-session-settings.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/verify-hotloop-h02/desktop/01-vic-h02-voter-after-session-settings.png) and 02-host-h02-host-after-session-settings.png (room CSK2MN: voter on /lobby with no cards 6 s later)
  - [live/web/probes2/desktop/log.json](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/probes2/desktop/log.json) and 04-host-host-after-back-from-estimating.png (browser back strands the host and the voter)
- **Fix direction:** Remove the Estimating 'Session settings' item, or open the sheet in place. Re-evaluate screenFor on ionViewWillEnter/NavigationEnd. Intercept back on Estimating. Structural fix: a single session screen (see the route-transition issue).

### UX-003 · high · startRound has no active-round guard: the Lobby offers 'Start Round N+1' while a round is voting, which creates concurrent, orphaned rounds

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `feat:M1`, `a11y:M1`, `lweb:M1`, `hot:M-5`, `feat:M6`  ·  **Related:** `lweb:LW-05`
- **Status:** confirmed: Four verifiers found this independently, and two reproduced it live. lweb:M1 is code-inferred.
- **Evidence:**
  - packages/shared/src/round-commands.ts:103-127 (refuses only when there is no host and appends unconditionally)
  - packages/client/src/app/lobby/lobby.page.ts:1001 (nextRoundNumber = rounds.length+1) and :512-554 (the footer ignores activeRound)
  - Live rooms WUXGU9 and JK6FZY: rounds=['voting','voting'] after Start from a stale Lobby
  - [live/web/verify-hotloop-h02/desktop/02-host-h02-host-after-session-settings.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/verify-hotloop-h02/desktop/02-host-h02-host-after-session-settings.png) ('START ROUND 2' while round 1 is voting) and 03-host-h02-host-after-round2.png
- **Fix direction:** startRound refuses with reason 'round-active' while a round is non-terminal (shared module). The Lobby derives its CTA from activeRound ('Round N in progress → Return to vote / Reveal'). Add an e2e test for back-then-Start.

### UX-004 · high · Discarded rounds leak into History and the 'latest Results': hidden votes are exposed, numbering counts tombstones, and in the CLI [v]/[t] then act on a different round

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `jrn:J-04`, `hot:M-1`, `hot:H-04`, `jrn:M-4`, `cli:M1`, `lcli:F-05`, `cli:CLI-13`
- **Status:** confirmed: The same bug appears on both surfaces. H-04's recommendation to 'mirror the web filter' was refuted because the web leaks too.
- **Evidence:**
  - packages/client/src/app/shared/round-history.component.ts:160 and packages/client/src/app/lobby/lobby.page.ts:1086-1091 filter with isTerminalStatus, which includes 'discarded' (packages/shared/src/round-transitions.ts:23-25). ADR-0046 l.30 says history excludes discarded rounds.
  - packages/cli/src/ui/App.tsx:382-384 and packages/cli/src/ui/Lobby.tsx:236-239 have the same leak; App.tsx:232,294 act on currentRound(), which skips discards
  - [live/web/verify-hotloop-hist.console.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/verify-hotloop-hist.console.txt) (room UEY772: History 'Round 1: Discard me — 5×1')
  - [live/cli/s2b-revote-discard/07-after-discard.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s2b-revote-discard/07-after-discard.txt) → 08-after-v-on-discarded.txt (v re-votes a different story); [frames-1.16.1/20-host-after-d-discard.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/20-host-after-d-discard.txt)
- **Fix direction:** Add one shared historyRounds()/latestResultRound() selector in packages/shared that excludes discarded rounds (ADR-0046). Bind it in web History, the Lobby results and the CLI anchor/history. Add a test that the displayed round is the action target.
- **ADR:** Implements ADR-0046 as written; no new ADR.

### UX-005 · high · Discarding or skipping a round is a one-gesture destructive act with no confirm or undo (web host back chevron; CLI d/s keys), spread over five overlapping 'move on' verbs

- **Surfaces:** web-desktop, web-mobile, cli  ·  **Cut candidate**
- **Sources:** `jrn:J-05`, `hot:H-21`, `a11y:M2`, `feat:F-10`  ·  **Related:** `hot:H-04`, `a11y:M8`, `lcli:F-21`, `cli:CLI-06`, `lweb:LW-23`
- **Status:** confirmed: ADR-0046 l.43 explicitly accepts the misclick-discard cost, and ADR-0040 makes skip terminal. a11y:M2 says a UI-only label/confirm needs no ADR. An undo, or moving discard into ⋯, needs a superseding ADR.
- **Evidence:**
  - packages/client/src/app/estimating/estimating.page.ts:757-764 (softExit discards; the only label is aria-label 'Discard round and return to lobby'), :788-798 and :856-860 (Skip has no confirm)
  - packages/cli/src/ui/Voting.tsx:71-80 (host d discards and s skips on a single keypress)
  - Live: no ion-alert; both clients went to /lobby, and the joiner got no toast (journeys verify)
  - Verbs: reveal/skip/discard (round) + skip/cancel (agenda) (features metric)
- **Fix direction:** Back becomes plain navigation. Round level: Reveal, Re-vote and 'Cancel round' (in ⋯) with a ~5 s undo toast and a notice to peers. Story level: one 'Remove from queue'. The CLI uses the same verbs with a confirm or undo on destructive keys.
- **ADR:** Supersede the ADR-0046 trade-off (and ADR-0040 for a Skip undo). Amend the trigger clause of ADR-0045/0046 (no schema change, per feat:F-10).

### UX-006 · high · Any participant can change the room's scale and password (Session settings is not host-gated)

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `jrn:J-06`, `feat:F-05`
- **Status:** confirmed: Yjs has no ACL, so a shared-writer gate is only cooperative. Hiding the controls is the real fix.
- **Evidence:**
  - packages/client/src/app/session-settings/session-settings.sheet.ts:84-118 (only the name row is disabled for non-hosts)
  - packages/client/src/app/lobby/lobby.page.ts:1388-1395 (the ⋯ 'Session settings' item is unconditional)
  - packages/relay/src/server.ts:413-450: the access PATCH is unauthenticated, which ADR-0017 accepts
  - Live (journeys verify, room 73DFAM): joiner Jo picked T-shirt; host subtitle became 'Round 1 • T-shirt'
- **Fix direction:** Hide Scale and Access for non-hosts and show them a read-only summary. Add a cooperative host check in the shared settings writer.

### UX-007 · high · A host who sets a password is locked out of their own room on reload (the hash is cached neither on create nor via Lobby settings)

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `jrn:J-02`, `jrn:M-2`, `feat:F-06`
- **Status:** adjusted: J-02 adjusted: the lockout hits both set-points, so cutting the create-time prompt does not fix it. F-06's 'retype on every reload' was refuted: after one rejoin via /join, the hash is cached.
- **Evidence:**
  - packages/client/src/app/home/home.page.ts:514-534 (the create path patches the relay but never caches the hash)
  - packages/client/src/app/session-settings/session-settings.sheet.ts:264-279 (the Lobby path calls updateCredentials but never setPendingPasswordHash; only join.page.ts:408 and session-resume.guard.ts:99 do)
  - Live PRA68J: relay accessMode=password, the lastSession entry has no passwordHash, reload → /join?code=PRA68J ([live/web/verify-journeys-pw/phone/](https://github.com/IIxauII/hnch/tree/ux-overhaul-artifacts/live/web/verify-journeys-pw/phone))
- **Fix direction:** Cache the host's hash whenever the password is set or rotated (setPendingPasswordHash, or recordJoin with the hash, which ADR-0044 allows), and clear it on 'Open'. Add an e2e test: set password → reload → still in Lobby.

### UX-008 · high · Roster and 'Didn't vote' eligibility is wrong: observers, late joiners and departed or kicked participants are counted on web and CLI, and past results change retroactively

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `lcli:M1`, `cli:M2`, `hot:H-18`, `hot:M-4`  ·  **Related:** `cli:CLI-13`, `lcli:F-30`
- **Status:** confirmed: lcli:M1 is high and verifier-found. H-18 was adjusted to medium: the late-joiner repro was not re-run, but the observer case was verified live.
- **Evidence:**
  - packages/client/src/app/shared/vote-results.component.ts:412-424 (current-roster eligibility, no role filter)
  - packages/cli/src/ui/components/ParticipantList.tsx:24-25, packages/cli/src/ui/Lobby.tsx:271 and :531-538 (isActiveParticipant is used nowhere in packages/cli/src)
  - packages/shared/src/doc-projection.ts:182-193 (projectParticipants does not filter leftAt)
  - Live UEY772: observer listed as 'Didn't vote (1) Wes3'
- **Fix direction:** Add a shared eligibleVoters(round) selector: active participants (ADR-0036 §2) with the voter role, snapshotted at terminalAt. Use it for roster counts, 'Didn't vote' and results on both surfaces.
- **ADR:** ADR-0036 §2 already requires this.

### UX-009 · high · CLI quit (q→y or Ctrl+C) never leaves the room and wipes every cached room, so resume is impossible and ghost participants remain

- **Surfaces:** cli
- **Sources:** `cli:CLI-11`, `lcli:F-09`, `feat:F-22`  ·  **Related:** `feat:F-17`, `lcli:M2`
- **Status:** confirmed: Contradicts the ADR-0044 per-room eviction rules. Caveat (lcli:F-09): removing the entry on a deliberate leave drops the ADR-0036 §6 rejoin-after-leave path.
- **Evidence:**
  - packages/cli/src/last-session.ts:198-200 (clearLastSession = clearAll, which wipes all 5 entries)
  - packages/cli/src/index.ts:144-147 and :248-250 (every exit path); resume uses removeEntry (index.ts:405), which is inconsistent
  - No leave() call anywhere in packages/cli/src (ADR-0036 lists CLI leave parity as pending)
- **Fix direction:** Ctrl+C or closing the terminal is a soft exit: keep the cache and print 'Rejoin: hnch resume'. q is Leave: call leave(), flush, and remove only this room's entry.

### UX-010 · high · The CLI ignores being kicked and lacks leave/description parity (ADR-0036 §5)

- **Surfaces:** cli
- **Sources:** `lcli:F-10`, `cli:CLI-20`
- **Status:** confirmed: ADR-0036 §5 mandates 'CLI: exit'.
- **Evidence:**
  - No removedBy observer in packages/cli/src
  - packages/shared/src/vote-commands.ts:72 refuses departed voters, and packages/cli/src/ui/App.tsx:257-262 drops the result silently
  - [live/cli/s10-kick-end/01-after-kick.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s10-kick-end/01-after-kick.txt) (the CLI is still in the lobby after the kick)
- **Fix direction:** Observe your own participant record. On removedBy, unmount, print 'Removed from ABC-DEF by <host>' and exit 0. Add leave and the description line.

### UX-011 · high · The CLI never observes the agenda: added stories stay invisible, and the next round is not pre-filled or linked

- **Surfaces:** cli
- **Sources:** `hot:H-05`, `cli:CLI-07`, `lcli:F-04`
- **Status:** confirmed: Intermittent: the projection refreshes only when another observed map changes. The one-shot agenda add masks it because its joinDoc touches participants.
- **Evidence:**
  - packages/cli/src/session.ts:250-256 observes meta, settings, participants and rounds, but not doc.getArray('agenda')
  - [frames-1.16.1/03a-host-agenda-prompt.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/03a-host-agenda-prompt.txt), 90-host-tui-after-cli-agenda-add.txt, 91-host-tui-after-local-change.txt
  - [live/cli/s2-cli-host-web-voter/26-agenda-added.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s2-cli-host-web-voter/26-agenda-added.txt)
- **Fix direction:** Observe the agenda array (or doc 'update'/afterTransaction) in wireSession. Add a test that an agenda-only change refreshes the projection.

### UX-012 · high · The CLI status bar stays on 'connecting' in password rooms even though sync works

- **Surfaces:** cli
- **Sources:** `lcli:F-08`, `cli:CLI-10`
- **Status:** adjusted: The verifiers disagree: live_cli confirmed it as high, while the cli verifier lowered it to medium (cosmetic, password rooms only). The highest verified severity, high, is used.
- **Evidence:**
  - packages/cli/src/ui/App.tsx:68 (useState('connecting')); SessionHandle has no status getter (packages/cli/src/session.ts:84-111)
  - [frames-1.16.1/a2-joiner-wrong-password.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/a2-joiner-wrong-password.txt) and a3-joiner-in.txt
- **Fix direction:** Add SessionHandle.status() and seed the state from it. Show '● live', and raise a banner only when degraded.

### UX-013 · medium · Room access state is local-only and can be wrong both ways: 'Access: Open' in password rooms, or 'Password' with an empty field while the relay stays open

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `jrn:M-3`  ·  **Related:** `jrn:J-02`, `feat:F-06`
- **Status:** confirmed: Verifier-found (journeys). F-06 confirmed the 'Access: Open' part live.
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:938 defaults to 'open' and is never read from GET /rooms/:code; invites then lose &pw=1
  - packages/client/src/app/session-settings/access-picker.sheet.ts:161-168 emits password ''; session-settings.sheet.ts:268 skips the PATCH while lobby.page.ts:1469-1474 still sets mode 'password'
  - Live WUXGU9 / PRA68J: 'Access: Open' shown while the relay reported accessMode=password
- **Fix direction:** Derive the access mode from the relay on Lobby enter and after each PATCH. Disable 'Password' until a non-empty password is committed.

### UX-014 · medium · Instant auto-reveal means the last voter can never change their vote, so ADR-0018's 'editable until reveal' never holds for them

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `feat:M2`  ·  **Related:** `hot:H-10`, `feat:F-01`, `a11y:RA-02`
- **Status:** confirmed: Verifier-found (features). 'Unanimous reveal' in docs and UI actually means 'everyone voted'.
- **Evidence:**
  - packages/shared/src/auto-reveal.ts:37-71 (numericCount >= denominator, no delay)
  - With positional digit voting, a wrong key press by the last voter is committed instantly (feat:F-01 note)
- **Fix direction:** Add a short cancellable 'Revealing…' beat (1-2 s) or an inline undo. Rename the docs term to 'all voted'.
- **ADR:** Amends ADR-0018 decision (3).

## core-loop speed (9)

### UX-015 · critical · The CLI estimate loop costs ~3x the necessary keystrokes: an arrows-only card picker that clamps and resets to card 0, no digit or value typing, and two prompts per story

- **Surfaces:** cli
- **Sources:** `cli:CLI-01`, `hot:H-11`, `lcli:F-13`, `lcli:F-14`  ·  **Related:** `feat:F-20`
- **Status:** confirmed: CLI-01's critical rating rests mainly on the host's two prompts per story. The verifier warns against porting web's positional digit mapping without visible key labels (see the positional-digit issue).
- **Evidence:**
  - packages/cli/src/ui/components/CardPicker.tsx:20-34 (useState(0), Math.max/min clamp, no digit or Space keys; docs/cli.md:101 wrongly says 'wraps')
  - packages/cli/src/ui/Lobby.tsx:330-347 and packages/cli/src/ui/App.tsx:176-222 (title prompt, then ticket prompt, on every story)
  - Metrics: 4.5 keys per vote on Fibonacci; the host needs ~8.5 keys plus 2 prompts per story (cli report); [live/cli/s2-cli-host-web-voter/host-keylog.json](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s2-cli-host-web-voter/host-keylog.json)
  - A stray Enter cast card [0] (hot:H-11, cli-out voting6b.txt)
- **Fix direction:** Value typing (type '13'; single-key faces vote immediately) with key labels under the cards. Arrows wrap, and the cursor starts on your current vote. In the lobby, Enter starts the next agenda story with no prompt; otherwise show one 'Story: PROJ-12 Title' prompt.

### UX-016 · high · The web round-start is a modal on every story: no autofocus, Enter does nothing on open, three fields, and the one-tap start from the agenda was never built

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `hot:H-07`, `feat:F-03`, `lweb:LW-07`, `a11y:RA-14`, `jrn:J-12`, `lweb:M5`
- **Status:** adjusted: Facts confirmed. Scope corrected: the fields are optional and pre-filled from the agenda, so the cost is 1 modal + 1 confirm per story. Start sits mid-screen in a 0.6 half-sheet, not at the top.
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:1228-1233 (the sheet opens on every Start/Next)
  - packages/client/src/app/round-start/round-start.sheet.ts (no setFocus/autofocus anywhere in the client; enterkeyhint='next' while Enter submits)
  - Live: activeElement = ION-MODAL after open; the dialog is 480x500 with no accessible name; ~0.91 s before the title is tappable on a phone (live_web metric)
  - docs/screenshots/latest/round-start/01-round-start-sheet-375px.png, docs/screenshots/latest/baseline/12-round-start-modal.png
- **Fix direction:** With a queued item, the primary CTA is 'Start: <item>' and starts with no modal. Without one, show an inline autofocused 'What are we estimating?' field where Enter starts. Put ticket and description behind 'More'.
- **ADR:** Compatible with ADR-0042/0045 (RA-14 note).

### UX-017 · high · Every round costs two route transitions and a full dashboard re-layout (Lobby → Estimating → Lobby)

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `hot:H-06`  ·  **Related:** `feat:F-04`
- **Status:** confirmed: The transition cost is estimated, not measured. H-02 and hot:M-2 (stranded peers) are symptoms of the two-route model.
- **Evidence:**
  - Push to /estimating and replace to /lobby on every round (hotloop metric: 2 route changes per round per peer)
  - Page transitions take ≈0.55 s on phone and ≈0.30 s on desktop (live_web metric)
  - packages/shared/src/screen-for.ts (the shared Screen union)
- **Fix direction:** One Session screen with phase states (Ready, Voting, Revealed). Deck and results share the stage; roster, queue and invite go in a rail on desktop or a sheet on phones.
- **ADR:** Needs an ADR: docs/ux.md:352 already requires one for a side rail, and the Screen union changes.

### UX-018 · high · Desktop digit shortcuts vote by card position, not face value ('8' casts 21, '3' casts 2, the 0 card is unreachable), with no visible key hints

- **Surfaces:** web-desktop
- **Sources:** `hot:H-03`, `feat:F-01`, `a11y:RA-02`, `lweb:LW-13`, `cli:M4`, `lweb:M6`
- **Status:** adjusted: This is a deliberate, documented design (#154, Settings legend), and the selected card highlights, so it is high, not critical. LW-13 was rated medium. Combined with instant auto-reveal it becomes a mis-vote trap.
- **Evidence:**
  - packages/client/src/app/estimating/estimating.keyboard.ts:61-67 (positional mapping; key 0 maps to the 10th card)
  - Fibonacci faces are 0,1,2,3,5,8,13,21 (packages/shared/src/doc.ts:343-346)
  - docs/screenshots/latest/keyboard/04-estimating-digit4-cast.png (pressing 4 selects card '3', and no key labels are shown)
  - Live WUXGU9: Digit8 → Card 21
- **Fix direction:** Set one cross-surface rule in docs/ux.md: value typing for numeric faces (with a short multi-digit buffer or Enter commit for 13/21), or mandatory keycap labels on every card. Use the same rule in the CLI.

### UX-019 · high · The desktop host loop is mouse-only: no Start/Reveal/Next/Re-vote keys, 12 Tabs to reach Start, and shortcuts are undiscoverable and cannot be turned off

- **Surfaces:** web-desktop
- **Sources:** `a11y:RA-13`, `jrn:M-6`, `lweb:LW-14`  ·  **Related:** `hot:H-22`
- **Status:** confirmed: RA-13 also covers WCAG 2.1.4 (single-key shortcuts cannot be turned off).
- **Evidence:**
  - The only document keydown handler is packages/client/src/app/estimating/estimating.page.ts:671; estimating.keyboard.ts:70-90 handles cards only; lobby.page.ts has no key handlers
  - [live/web/probes/desktop/log.json](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/probes/desktop/log.json) (12 Tabs to Start, focus lands on ion-modal, R does nothing, 6 Tabs to Reveal)
  - The CLI already has [r]/[n]/[v] ([live/cli/s2b-revote-discard/08-after-v-on-discarded.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s2b-revote-discard/08-after-v-on-discarded.txt))
- **Fix direction:** One shared keymap in packages/shared for web and CLI (value keys, A abstain, R reveal, Enter/N next, V re-vote, ? help, Esc). Show inline hints on fine pointers. Add a Settings toggle for single-key shortcuts.

### UX-020 · high · Joiners get no waiting state between rounds and no cue when a round opens (empty Agenda card, no 'waiting for host')

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `jrn:J-10`, `hot:H-20`, `lweb:LW-17`, `hot:M-6`
- **Status:** confirmed: H-20 adjusted: during voting, voters do get the selected-card highlight, 'x of N voted' and 'Waiting on'. The gaps are the Lobby and the round-open cue. The CLI already has waiting copy.
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:512 (the footer renders only @if isHost(), and there is no waiting copy)
  - packages/client/src/app/agenda/agenda-panel.component.ts:53-96 (empty accordion for a non-host with 0 items)
  - [live/web/s2-s3-joiners/phone/06-joiner1-joiner-lobby.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s2-s3-joiners/phone/06-joiner1-joiner-lobby.png), [live/web/verify-hotloop-h02/desktop/04-vic-h02-voter-after-round2.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/verify-hotloop-h02/desktop/04-vic-h02-voter-after-round2.png)
- **Fix direction:** Joiner Lobby: 'You're in. Waiting for <host> to start…' with avatars. Hide empty sections for joiners. Add a light haptic and a title flash when a round opens.

### UX-021 · medium · Agenda authoring is slow: one modal per item, no autofocus, Enter doesn't submit, an error shows (and is announced assertively) on open, no bulk paste; the CLI add prompt mislabels its fields as optional

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `hot:H-14`, `lweb:LW-12`, `feat:F-09`, `lweb:M7`, `lcli:M6`  ·  **Related:** `jrn:J-12`, `lweb:M5`
- **Status:** confirmed: F-09 adjusted to medium: this is session prep, off the per-story loop.
- **Evidence:**
  - packages/client/src/app/agenda/agenda-item-form.sheet.ts:206-208 (memoized computed() over non-signal form state: the error shows on open and never clears)
  - packages/client/src/app/agenda/agenda-item-form.sheet.ts:139-147 (role=alert aria-live=assertive on a pristine form) and :112 (enterkeyhint='next', no submit button)
  - [live/web/s5-agenda/phone/02-host-agenda-form-open.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s5-agenda/phone/02-host-agenda-form-open.png) (3 items ≈ 13-14 actions)
  - packages/cli/src/ui/Lobby.tsx:388,394,405 and packages/cli/src/ui/App.tsx:429-437 (CLI: 'optional' prompts, then a 3 s error)
- **Fix direction:** Inline 'Add story' input (Enter adds and keeps focus) with multi-line paste ('KEY-123 Title' per line). Validate only after a submit attempt. CLI: `hnch create --agenda file.txt`.

### UX-022 · medium · The agenda is not the session backbone: rows can't start a story, the in-flight item still reads 'Next up', done rows show no outcome, and it duplicates Round History

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `hot:H-16`, `jrn:J-26`, `feat:F-23`  ·  **Related:** `feat:F-03`
- **Status:** confirmed: The merge and cut parts are opinion. Cutting the agenda outright collides with ADR-0042/0045.
- **Evidence:**
  - packages/client/src/app/agenda/agenda-panel.component.ts:356-371 (outputs add/edit/skip/cancel/reorder only; no start-from-item) vs docs/ux.md:99,101,106
  - nextPendingAgendaItem returns the in-flight item because of ADR-0045 deferred consumption
  - Round History and the agenda's done band are two separate lists (feat:F-23)
- **Fix direction:** One Stories queue (Up next → Now → Done with points → Removed). Tapping a row starts it. 'Now' derives from activeRound.agendaItemId. Done rows show outcomes (depends on the final-estimate issue). Fold History into it.
- **ADR:** A 'Now' marker needs no ADR. Merging History or removing the agenda needs ADRs superseding 0042/0045/0046.

### UX-023 · low · Re-tapping the selected card (or a second ⏎ in the CLI) silently clears the vote

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `lweb:LW-32`  ·  **Related:** `lcli:F-21`
- **Status:** adjusted: A design trade-off, not a defect. Removing it needs a replacement 'clear' affordance.
- **Evidence:**
  - Documented intended UX: docs/ux.md:242 ('Re-tap same card = deselect') and docs/cli.md:102; shared toggleCurrentVote
- **Fix direction:** Opinion: keep the vote on re-tap and offer an explicit Clear (⌫ in the CLI). Decide this with the shared keymap.

## entry/join (9)

### UX-024 · high · Create Room shows no loading state and fails silently when the relay is unreachable

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `jrn:J-08`
- **Status:** confirmed: A silent failure on the primary CTA. Offline PWA use on a phone is realistic.
- **Evidence:**
  - packages/client/src/app/home/home.page.ts:257 (the creating flag is private and not bound to the view)
  - packages/client/src/app/home/home.page.ts:288-344 (try/finally with no catch, so a failure becomes an unhandled rejection)
- **Fix direction:** Show an inline spinner or disabled state on the CTA and an error toast with Retry. Rule: no async UI handler without a catch.

### UX-025 · high · Dismissing the create-time password sheet strands the host on Home with an orphaned room

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `jrn:J-03`
- **Status:** confirmed: Conclusive from code; not re-run live.
- **Evidence:**
  - packages/client/src/app/home/home.page.ts:153 ((didDismiss) only resets the signal)
  - packages/client/src/app/home/password-prompt.sheet.ts emits closeRequested only from Cancel; the next Create tears down the first room and mints a new one
- **Fix direction:** Cut the create-time password sheet and the 'Password by default' preference; password stays a host Lobby setting. If kept, treat any dismissal as 'no password' and continue to the Lobby.

### UX-026 · medium · Join code entry: no autofocus, Enter is ignored, no auto-submit at 6 characters, and pasting an invite URL yields a bogus code ('HTTPSH')

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `jrn:J-14`, `jrn:J-07`, `a11y:RA-25`  ·  **Related:** `lweb:LW-25`
- **Status:** adjusted: J-07 lowered from high to medium because invitees usually tap the link, which auto-joins.
- **Evidence:**
  - packages/client/src/app/shared/segmented-code-input.component.ts:165-184 (handles only Backspace/arrows) and :213-229 (paste handler)
  - parseInviteContent is used only in the QR path (packages/client/src/app/join/join.page.ts:441)
  - Live: activeElement on /join is BODY; pasting https://hnch.dev/join?code=… gives 'HTTPSH' with Join enabled ([live/web/verify-journeys-paste/phone/](https://github.com/IIxauII/hnch/tree/ux-overhaul-artifacts/live/web/verify-journeys-paste/phone))
- **Fix direction:** One 'Join with code or link' field (on Home). Autofocus it, accept URLs via parseInviteContent, auto-submit on the 6th valid character, and let Enter submit.

### UX-027 · medium · Onboarding is a separate gate with no autofocus and no room context for invite arrivals, and it stays in the back stack

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `jrn:J-18`, `feat:F-18`, `lweb:LW-25`, `jrn:J-32`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/onboarding/onboarding.page.ts:62-97 (static copy, no autofocus) and :179-187 (the pending join is known but not shown; no replaceUrl)
  - packages/client/src/app/core/display-name.guard.ts:31-51 (guard on every route)
  - Live outlet stack: ONBOARDING[hidden], JOIN[hidden], LOBBY. Invite-link joiner: 4 actions, 1.68 s on phone (live_web S2)
- **Fix direction:** Ask for 'Your name' inline on Join/Create, only when no name is stored ('Join 4DP-JGD as ___'). Autofocus it, use replaceUrl, and route mid-round joiners straight to voting.

### UX-028 · medium · Home's rejoin UI is thin and partly misleading: two rejoin components, code-only rows, an unformatted code in the banner, a stale 'Estimating now' status, and expired rooms need a second tap

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `jrn:J-19`, `jrn:M-5`, `jrn:J-27`, `lweb:LW-26`, `vis:VIS-32`  ·  **Related:** `feat:F-16`
- **Status:** confirmed: Showing the session name needs an ADR-0044 cache-shape amendment. A truly live state needs a probe, because the relay is content-blind. Capping the list at 3 rows conflicts with ADR-0044's 5.
- **Evidence:**
  - packages/client/src/app/home/jump-back-in-banner.component.ts:42 (raw code 'K7P9MR') and :113 (status from the local cache, filled at home.page.ts:495)
  - packages/client/src/app/home/recent-rooms-list.component.ts:77 (this list does format the code); packages/client/src/app/home/home.page.ts:422-436 (expired-row flow)
  - docs/screenshots/latest/history/room-history-home-one-mobile-light.png; live 73DFAM banner read 'In the lobby' while a round was being voted
- **Fix direction:** Merge the banner and the list into one Recent list. Always format codes as XXX-XXX. Use neutral 'Last seen 2 min ago' copy instead of a live-sounding status. Show 'Ended' inline with an ×.
- **ADR:** Amend ADR-0044 for the name and the row cap.

### UX-029 · medium · Inviting is scattered and buried: Share is collapsed on phones, there are three controls (copy code, share, QR), and desktop opens the OS share sheet (Firefox silently copies)

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `jrn:J-13`, `lweb:LW-36`, `feat:F-24`
- **Status:** confirmed: The host needs 2 taps on a phone to copy the link.
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:1137-1146 (mobile collapses Share by default), :1477-1495 (Share.share falls back to the clipboard only on throw), :1514-1519 (a code tap copies the code, not the link)
  - [live/web/s2-s3-joiners/phone/01-host-share-expanded.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s2-s3-joiners/phone/01-host-share-expanded.png), 02-host-share-invite-toast.png, 03-host-room-code-copied-toast.png
- **Fix direction:** One 'Invite' header button (copies the link on desktop, opens the share sheet on mobile) with a QR icon. Tapping the code copies the link.

### UX-030 · medium · A wrong password briefly shows the Lobby, then bounces back to Join with the wrong value still in the field

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `jrn:J-15`
- **Status:** confirmed: Timing from the auditor's run; not re-measured.
- **Evidence:**
  - packages/client/src/app/join/join.page.ts:397-417 (navigates right after connect() without awaiting the outcome); rejection effect at packages/client/src/app/lobby/lobby.page.ts:1205-1218
  - RoomJoinService.waitForJoinOutcome already exists
- **Fix direction:** Await waitForJoinOutcome before navigating. On 4002, select or clear the field and keep focus.

### UX-031 · medium · 'Jump back in' asks for the password again despite a cached hash

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `jrn:J-16`
- **Status:** confirmed: Violates ADR-0044 l.37: one-tap rejoin of password rooms is the point of the cache.
- **Evidence:**
  - packages/client/src/app/home/home.page.ts:420 calls rejoin(code) without the hash, while packages/client/src/app/core/session-resume.guard.ts:87-92 passes it
- **Fix direction:** Pass the cached hash in doRejoin, and share one resume function between Home and the guard.

### UX-032 · medium · Exit semantics are unclear: Back keeps you online in the room, Leave forgets it, and a host's Back leaves the room without a usable host

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `feat:F-17`, `lweb:LW-23`, `lweb:LW-24`  ·  **Related:** `jrn:J-01`
- **Status:** adjusted: Soft exit and 'Leave forgets the room' are documented choices. An auto hand-off needs an ADR superseding ADR-0010/0048. Changing intentional-leave semantics amends ADR-0036 §3.
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:1571-1581 (softExit only navigates; the host stays online, so no election runs, per ADR-0048); Leave alert copy at :1594
  - [live/web/probes2/desktop/08-host-host-after-back-chevron.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/probes2/desktop/08-host-host-after-back-chevron.png) and 09-rita-rita-7s-after-host-exit.png
- **Fix direction:** Give Back one meaning: minimise without side effects, or disconnect while keeping the cache. Offer one Leave that keeps the room in Recent, plus a host-only 'End for everyone'. Voters see 'Host stepped away'.
- **ADR:** ADR-0010/0048 for auto hand-off; ADR-0036 §3 for leave semantics.

## results & decision (8)

### UX-033 · high · The loop records no decision: there is no final or agreed estimate per story, so the session has no output

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `hot:H-01`, `feat:F-02`, `lweb:LW-34`  ·  **Related:** `lcli:F-16`, `feat:F-23`, `hot:H-16`
- **Status:** adjusted: H-01 lowered from critical to high because the loop still completes. LW-34 rates it medium and warns that a mandatory pick step works against 'quick' unless consensus is auto-accepted. This is a product decision for the user.
- **Evidence:**
  - StoredRound (packages/shared/src/doc.ts:231-290) has no outcome field; the footer offers only Re-vote/Next
  - packages/shared/src/round-export.ts exports per-person tallies only; grep finds no final or agreed estimate in shared, client, cli or docs
- **Fix direction:** After reveal, offer one inline 'Accept N → Next story' (default: the unanimous value, else the mode or nearest card; tap another card to override; Enter/one tap). Store it on the round or agenda item, and show it in the Stories list and a Story|Points export.
- **ADR:** Needs an ADR superseding ADR-0046 (ADR-0013's revisit trigger). Stay inside the roadmap §11 non-goals (no tracker integration).

### UX-034 · high · After reveal, results are buried: the 5th card on phones, partly under the footer, with weak hierarchy (6-12% bar opacity, muted story title, name chips straddling the bars)

- **Surfaces:** web-mobile, web-desktop
- **Sources:** `jrn:J-11`, `hot:H-08`, `vis:VIS-09`, `a11y:RA-05`, `lweb:LW-02`, `lweb:LW-19`, `vis:M7`  ·  **Related:** `feat:F-04`
- **Status:** adjusted: Mobile confirmed. The desktop part was refuted at 1440x900: Results is above the fold as the 2nd card in the right column (hot:H-08, a11y:RA-05). On mobile, Participants auto-collapses on the first reveal (lobby.page.ts:1148+), which helps a little.
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:400-494 (template order: Results is the 5th section)
  - packages/client/src/app/shared/vote-results.component.ts:179-194 (bar opacity 0.06/0.12)
  - docs/screenshots/latest/baseline/16-lobby-results-390.png; [live/web/s4-three-stories/phone/16-host-s3-host-results.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s4-three-stories/phone/16-host-s3-host-results.png) (results_section_top 610 of 844 px)
  - Proposed direction: [visual/prototype/visual-direction-render.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/visual/prototype/visual-direction-render.png)
- **Fix direction:** Make the Revealed state the hero: suggested or most-picked value large, distribution at full opacity with avatars, story title in primary text, CTA adjacent. It must fit above the fold at 390x844.

### UX-035 · medium · Results don't support a fast decision: no suggested card or outlier callout, decimal Avg/Med, and the CLI lists votes in arrival order with no distribution

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `hot:H-09`, `lcli:F-16`  ·  **Related:** `cli:CLI-13`, `hot:M-7`
- **Status:** adjusted: H-09 lowered to medium. CLI-13 was raised to high only for the discarded-round leak (tracked separately), so the readability part stays medium.
- **Evidence:**
  - packages/client/src/app/shared/vote-results.component.ts:376-379 (groups are sorted by count, so the mode already acts as an implicit suggestion)
  - packages/cli/src/ui/Lobby.tsx:494 (arrival order); packages/cli/src/ui/lobby-helpers.ts:81 (localeCompare gives '21×1, 3×1')
- **Fix direction:** Shared suggested-card rule (mode; on a tie, the card nearest the median), a 'Low: X 3 · High: Y 21' outlier line, a scale-ordered histogram, and Avg/Med as detail. Bind the same strings in the CLI.

### UX-036 · medium · Agreement labels mislead: 'Unanimous' or 'Agreement 100%' for a single vote, 'Spread: Spread', and the consensus rule disagrees with the chip

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `lcli:F-22`, `jrn:J-29`, `lweb:LW-20`, `hot:M-7`  ·  **Related:** `hot:H-13`, `hot:H-09`
- **Status:** confirmed: J-29, LW-20 and hot:M-7 are rated low; lcli:F-22 is confirmed medium.
- **Evidence:**
  - packages/shared/src/round-presentation.ts:102 and :175-178 (distinct===1 → 'unanimous', no minimum count) and :224-225 ('Spread' is also one of its own values)
  - isConsensus in packages/shared/src/doc-projection.ts:843-847 requires ≥2 votes and counts abstains, so the chip and the celebration disagree
  - Live web: 'XS (1 vote) … Didn't vote (1) … Unanimous'; [live/cli/s2-head-src/12-s2-results-partial.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s2-head-src/12-s2-results-partial.txt) ('Spread: Unanimous' with 1 of 2 votes)
- **Fix direction:** Require ≥2 numeric votes for any agreement label ('Not enough votes'). Rename the levels (e.g. Agreed/Close/Split). Use one rule for the chip, the celebration and the CLI.

### UX-037 · medium · The consensus celebration covers the results with a scrim for 3 s, 'hnch'd!' fails contrast, and the confetti is emoji

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `hot:H-13`, `vis:VIS-10`, `jrn:M-7`, `feat:F-14`, `lweb:LW-09`  ·  **Related:** `a11y:RA-19`
- **Status:** adjusted: The overlay is click-dismissible, the footer stays usable, and it fires only on consensus, so it is not '3 s of dead time'. It is specified in docs/ux.md:248-256, so removing it is a product choice plus a doc update.
- **Evidence:**
  - packages/client/src/app/core/celebration.service.ts:129-157 (3000 ms)
  - packages/client/src/app/lobby/lobby.page.ts:497-509 and :842-852 (absolute overlay, inset 0, z-index 1000, rgba(0,0,0,.55))
  - 'hnch'd!' is 2.36:1 in light and 2.99:1 in dark ([reports/visual-contrast-current.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/reports/visual-contrast-current.txt))
  - docs/screenshots/latest/reveal/consensus-reduced-375-light.png
- **Fix direction:** Replace it with a non-blocking badge or glow (≤1 s) on the result hero plus the success haptic. No scrim; vector confetti or none.

### UX-038 · medium · Re-votes give voters no context: no 're-vote' marker and no previous distribution

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `hot:H-19`, `jrn:J-33`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/estimating/estimating.page.ts:151 (shows only 'Round N'); the Estimating template renders no lineage or previous tally
- **Fix direction:** Show a 'Re-vote · last time: 3×1 · 21×1' strip on the voting stage, on web and CLI.

### UX-039 · medium · Round History leaks the raw abstain sentinel ('hnch_abstain×1')

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `hot:H-17`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/shared/round-history.component.ts:218-231
  - Live UEY772: 'Round 2: Abstain round — 13×2, hnch_abstain×1'
- **Fix direction:** Filter isAbstainVote, or bind a shared tally formatter from round-presentation on both surfaces.

### UX-040 · medium · Finishing the agenda has no closure: the footer still says 'Next Round N', with no summary or export prompt

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `lweb:LW-33`
- **Status:** confirmed
- **Evidence:**
  - [live/web/s5-agenda/phone/10-host-after-story-2.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s5-agenda/phone/10-host-after-story-2.png) and log.json (final footer 'Re-vote / Next Round 4' with every agenda item consumed)
- **Fix direction:** When the queue empties, show an 'All stories estimated' summary with the agreed numbers, Copy summary and an End session CTA.

## layout & responsive (7)

### UX-041 · high · The desktop CTA bar is full-bleed at the viewport bottom, far from the content (the 'inline CTA' CSS is a no-op), with ragged card grids and empty voids

- **Surfaces:** web-desktop
- **Sources:** `a11y:RA-04`, `jrn:J-23`, `hot:H-22`, `vis:VIS-16`, `lweb:M4`, `vis:VIS-34`  ·  **Related:** `lweb:LW-15`
- **Status:** confirmed: Contradicts docs/ux.md §3 and :337.
- **Evidence:**
  - packages/client/src/global.scss:82-93 (position:static has no effect: ion-footer is a sibling of ion-content)
  - Live: footer x0 y844 w1440 h56; the START ROUND button is 1436x36
  - docs/screenshots/latest/baseline/13-estimating-1440.png, docs/screenshots/latest/baseline/15-lobby-results-1440.png, docs/screenshots/latest/skip/skip-01-menu-open-skip-option.png (left-aligned grid vs centred Abstain)
  - packages/client/src/app/lobby/lobby.page.ts:651-655 (Lobby goes to 1600px at xl, while docs/ux.md §3 says 800px)
- **Fix direction:** A shared ActionBar: sticky at the bottom on phones; on desktop, docked under the content column, auto-width, ≥44px, with key hints and a status slot. Centre the deck in at most 2 balanced rows.

### UX-042 · high · The Lobby is an accordion stack (up to 6 sections), and 'locked' sections still show chevrons and collapse on tap or Enter (the room code disappears)

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `feat:F-04`, `a11y:RA-07`, `vis:VIS-18`, `lweb:LW-16`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:812 (::part(expand-icon) does not exist in Ionic 8.8.4) and :815-818 (pointer-events:none)
  - [live/web/probes3/phone/01-host-after-tap-session-chevron.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/probes3/phone/01-host-after-tap-session-chevron.png) (Session collapsed, code hidden)
  - 13 interactive host controls before round 1 (features metric)
- **Fix direction:** No accordions in the room. Use a fixed hierarchy (hero: next-story CTA or revealed results → avatar strip → Stories queue) with plain headed sections. Use 'Show all (n)' only for long history.

### UX-043 · high · Agenda rows are crowded: 5 icon buttons per row, action columns jump between rows, phone titles wrap mid-word, and skip and cancel duplicate each other

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `feat:F-07`, `lweb:LW-10`, `vis:VIS-20`
- **Status:** adjusted: LW-10 corrected from 'one character per line' to ~4-character lines; still high because it is on the main host screen.
- **Evidence:**
  - docs/screenshots/latest/agenda/04-agenda-3-items-host-desktop.png (row 3's up arrow sits in the down column of rows 1-2)
  - [live/web/s5-agenda/phone/05-host-agenda-3-items.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s5-agenda/phone/05-host-agenda-3-items.png) ('Paym/ent/retry')
- **Fix direction:** Full-width title, plus one row ⋯ (Edit, Move to next, Remove) and drag. Merge skip and cancel into one 'Remove from queue'.

### UX-044 · high · Desktop dialogs are a fixed 500px tall: the QR is clipped under the header, short dialogs are mostly empty, and nested pickers bypass the desktop dialog style

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-11`, `a11y:RA-24`, `lweb:LW-28`, `vis:VIS-17`
- **Status:** confirmed: Desktop QR is the main way phones join.
- **Evidence:**
  - packages/client/src/global.scss:67-73 (fixed height); packages/client/src/app/lobby/qr-display.sheet.ts:48-58
  - docs/screenshots/latest/baseline/10-qr-modal.png (finder patterns touch the header), docs/screenshots/latest/baseline/09-access-sheet.png (2-option picker in a large square dialog)
  - 4 of 12 modals lack modal-centered (session-settings:122,138; scale-picker:211,229); nesting reaches 3 levels
  - [live/web/s2-s3-joiners/phone/04-host-qr-sheet.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s2-s3-joiners/phone/04-host-qr-sheet.png) (a toast covers the phone QR sheet header and Done)
- **Fix direction:** Auto-height dialogs (max min(80vh, 720px)). Cap the QR at min(60vh, 320px) with safe centring. Replace second-level modals with inline segments or popovers. Show toasts at the bottom.

### UX-045 · medium · The phone Lobby wastes 22% of the width (42px nested gutters), and participant names wrap mid-word

- **Surfaces:** web-mobile
- **Sources:** `vis:VIS-27`, `a11y:RA-16`, `vis:VIS-26`, `jrn:J-34`
- **Status:** confirmed: The 320px wraps were not re-checked.
- **Evidence:**
  - docs/screenshots/latest/baseline/16-lobby-results-390.png (content is 306 of 390 CSS px; x=42 = 16+5+5+16)
  - docs/screenshots/latest/lobby-hierarchy/lobby-empty-mobile-light.png ('You (HierarchyH / ost)')
- **Fix direction:** One 16px phone gutter token and no inset containers. Single-line names with an ellipsis, and the role as a small badge.

### UX-046 · medium · Tablets, touch laptops and landscape phones get a mix of width-driven and pointer-driven rules (desktop dialog sizing combined with sheet breakpoints)

- **Surfaces:** web-mobile, web-desktop
- **Sources:** `a11y:RA-15`, `a11y:M5`  ·  **Related:** `vis:VIS-17`
- **Status:** confirmed: The landscape-phone case is inferred from code, not verified live.
- **Evidence:**
  - packages/client/src/global.scss:67-73 (modal-centered sizing at min-width 768px regardless of pointer); 8 hard-coded modal-centered classes
  - packages/client/src/app/core/surface.service.ts:37,59
- **Fix direction:** Separate the two axes: layout tiers by width (600/1024), and input modality via any-pointer, any-hover and last input. Choose dialog vs sheet in one place, SurfaceService.

### UX-047 · medium · The 'Waiting on' line shifts the card grid 20px mid-vote and names the viewer in the third person ('Waiting on: Hana' shown to Hana)

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `a11y:RA-17`, `lweb:LW-21`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/estimating/avatar-vote-row.component.ts:28-30 and :107-123 (appears at ≥50% voted; no self-substitution)
  - Live: Hana's own view reads 'Waiting on: Hana' (live_web s2 phone 16); 20px layout shift (desktop_a11y metric)
- **Fix direction:** Reserve the line's height from round start, or put it in the action bar's status slot. Say 'Waiting on you'.

## visual system (18)

### UX-048 · high · In dark mode, the accent used as text or icon colour is illegible (Voter chip and name chips 1.72:1, Re-vote outline 2.65:1, agenda +, pencils, kebabs)

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-01`, `a11y:RA-01`, `jrn:J-22`, `hot:H-23`, `lweb:LW-03`, `feat:M4`  ·  **Related:** `hot:M-8`
- **Status:** adjusted: The default theme is 'system' (theme.service.ts:22), not dark, and light racing-green is 12.2:1. High, not critical: values, counts and Next stay readable.
- **Evidence:**
  - packages/client/src/app/core/accent.service.ts:161-166 writes the fill colour into --ion-color-primary; the dark value #1F6B4F is 2.65:1 on #1C1C1E and 2.17:1 on #2C2C2E ([reports/visual-contrast-current.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/reports/visual-contrast-current.txt))
  - docs/screenshots/latest/baseline/15-lobby-results-1440.png; [live/web/s7-theming/phone/15-host-lobby-post-host-dark.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s7-theming/phone/15-host-lobby-post-host-dark.png)
- **Fix direction:** Split the accent into fill and text-safe foreground tokens per theme (e.g. dark fg #7ED6AA, ≈8:1 on #2C2C2E). Map chips, clear/outline buttons, icons and alerts to the fg token. Add a contrast unit test over ACCENTS × themes × surfaces.
- **ADR:** An additive fg token does not collide with ADR-0043.

### UX-049 · high · The theme-accent picker offers accents that fail as text app-wide (9 of 12 are below 4.5:1 on white), and ADR-0043's 'pre-validated AA' premise is false

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `vis:VIS-03`, `vis:M8`  ·  **Related:** `a11y:RA-01`
- **Status:** adjusted: VIS-03 undercounted: 9 accents fail, not 7.
- **Evidence:**
  - On white: amber 1.41, teal 1.99, green 2.02, orange 2.06, dijon 2.42, red 3.41, violet 3.52 ([reports/visual-contrast-current.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/reports/visual-contrast-current.txt))
  - adr/0043-per-participant-avatar-color.md, Context bullet 4
- **Fix direction:** Opinion (the auditors'): cut the theme-accent picker and keep racing green as the brand accent; avatar colour stays as identity. If the picker is kept, curate 4-5 accents with hand-tuned fill and fg per mode, plus a contrast test. Record the corrected palette contract in a new ADR.
- **ADR:** Cutting the picker does not conflict with ADR-0043 (theme and avatar are orthogonal). Removing custom hex amends ADR-0043 §6, which added it per user request, so ask first.

### UX-050 · high · In light mode, the selected estimate card's numeral is 2.45:1

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-02`, `lweb:LW-04`
- **Status:** adjusted: Light mode only. Selection is still shown by fill, border and scale, so high, not critical.
- **Evidence:**
  - packages/client/src/app/estimating/estimating.page.ts:335-340 (tint #285447, no text colour set, black numeral)
  - docs/screenshots/latest/layout/estimating-390-light.png (dark mode passes at 4.89)
- **Fix direction:** Selected card = accent fill + white numeral (12.2:1), plus a 2px text-safe ring and a lift, or a check mark.

### UX-051 · high · Secondary and status text fails AA in both themes (#8E8E93 grey at 2.92-4.27:1; light 'Unanimous' 2.02:1, 'Close' 2.06:1, 'Spread' 3.41:1)

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-04`, `a11y:RA-12`, `lweb:M3`, `vis:VIS-28`  ·  **Related:** `jrn:J-22`
- **Status:** confirmed
- **Evidence:**
  - 32 var(--ion-color-medium) uses + 7 color="medium" attributes vs 12 --hnch-muted
  - packages/client/src/theme/variables.scss:44-71 (the light semantic colours are Apple's dark-mode values); packages/client/src/app/shared/vote-results.component.ts:460-461 (spreadColor)
  - 'N of M voted' is 2.92:1 on #f2f2f7 (live_web s7 metrics)
  - 29 of 41 current token pairs fail ([reports/visual-contrast-current.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/reports/visual-contrast-current.txt)) vs 0 of 36 proposed ([reports/visual-contrast-proposed.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/reports/visual-contrast-proposed.txt))
- **Fix direction:** Per-mode text tokens (e.g. secondary #636366 light / #AEAEB2 dark; semantic text #16794A / #8F5A00 / #B42318 in light). Always pair status with an icon. Lint against direct --ion-color-medium use, and add a contrast check to screenshot CI.

### UX-052 · high · The Onboarding 'Continue' button renders dark-on-green (2.57:1) in Material dark

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-05`
- **Status:** adjusted: Only md mode with the dark palette (desktop/Android dark); iOS and light mode are unaffected.
- **Evidence:**
  - packages/client/src/app/onboarding/onboarding.page.ts:89-97 (no color="primary", unlike Lobby and Estimating)
  - Ionic's .ion-palette-dark.md toolbar background is used as the text colour (button.md.css:324); --background-disabled/--color-disabled are no-ops in Ionic 8
- **Fix direction:** Add color='primary'. Delete the no-op disabled tokens, and define disabled styles through supported vars or a kit button.

### UX-053 · high · No brand in the browser chrome: the tab title is 'Ionic App' on every route, the favicon is Ionic's, and there is no manifest or theme-color

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-12`, `jrn:J-28`  ·  **Related:** `a11y:RA-06`
- **Status:** confirmed: J-28 is rated low; VIS-12 is confirmed high.
- **Evidence:**
  - packages/client/src/index.html:6 ('<title>Ionic App</title>'); favicon.png is the 64x64 Ionic logo
  - No manifest, no theme-color, no TitleStrategy; the brand mark is used only at packages/client/src/app/onboarding/onboarding.page.ts:63
- **Fix direction:** Title 'hnch' (plus 'Lobby · 4DP-JGD · hnch' via TitleStrategy), a brand favicon set, theme-color per mode, a web manifest, and the wordmark in the room top bar.

### UX-054 · high · The agenda Skip button and the skipped-state glyph render blank (icon name mismatch)

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-06`, `hot:H-15`, `lweb:LW-11`, `lweb:M8`  ·  **Related:** `feat:F-07`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/agenda/agenda-panel.component.ts:151,205 use 'play-skip-forward-outline', but :447 registers 'skip-forward-outline'
  - Ionicons warnings in the s5 logs; docs/screenshots/latest/agenda/04-agenda-3-items-host-desktop.png
- **Fix direction:** Register the name actually used, or fold Skip into the row ⋯. Add a unit test that fails on unregistered template icons or Ionicons warnings.

### UX-055 · medium · Two visual languages by platform: Material on desktop/Android (uppercase full-width buttons) vs iOS on Apple devices

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-13`, `jrn:J-24`, `lweb:LW-15`
- **Status:** adjusted: Medium: a single user sees only one platform; the cost is brand coherence and QA.
- **Evidence:**
  - packages/client/src/main.ts:21-22 (auto mode)
  - docs/screenshots/latest/session-end/end-01-end-session-confirm-alert.png (END SESSION in the same green as Cancel)
- **Fix direction:** ADR to unify on one mode or a hnch component kit driven by hnch tokens.
- **ADR:** Conflicts with docs/ionic.md:5-7 ('do not hardcode mode'); ADR-0002 is silent, so a new ADR is needed.

### UX-056 · medium · Destructive styling is wrong: menu rows are solid red blocks, md destructive buttons aren't red, and Skip looks like End session (same icon)

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-07`, `a11y:RA-20`, `a11y:M6`  ·  **Related:** `jrn:J-24`
- **Status:** adjusted: VIS-07's docs/ux.md citation is wrong. An undo toast for Skip collides with ADR-0040.
- **Evidence:**
  - packages/client/src/app/shared/menu-popover/menu-popover.component.ts:48 ([color]=danger fills the rows)
  - packages/client/src/app/estimating/estimating.page.ts:793,802 (both items use close-circle-outline)
  - docs/screenshots/latest/baseline/11-lobby-overflow.png, docs/screenshots/latest/skip/skip-01-menu-open-skip-option.png
- **Fix direction:** Destructive = red text and icon on a neutral row, after a divider. Give each action its own icon. Reserve red for irreversible actions.
- **ADR:** A Skip undo needs an ADR superseding ADR-0040.

### UX-057 · medium · Avatar colours vanish in dark mode (graphite 1.0:1, racing-green 1.39:1), initials are tiny, and colours can collide within a room

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `vis:VIS-22`, `a11y:RA-23`, `lweb:LW-30`
- **Status:** adjusted: Voted vs unvoted is still distinguishable. The palette distribution is uniform (jrn:J-36 refuted). Per-room reassignment collides with ADR-0043, so use render-time disambiguation.
- **Evidence:**
  - packages/client/src/app/estimating/avatar-vote-row.component.ts:64-74 (no dark variant; 0.625rem initials)
  - [reports/visual-contrast-current.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/reports/visual-contrast-current.txt); collisions seen in [live/web/s5-agenda/phone/05-host-agenda-3-items.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s5-agenda/phone/05-host-agenda-3-items.png)
- **Fix direction:** Theme-aware avatar fills or a neutral ring, ≥12px/700 initials with ink chosen by contrast, and a check mark for 'voted'.

### UX-058 · medium · No bundled typeface: layout depends on fallback font metrics, so the Session card's code, copy icon and subtitle collide on macOS

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-14`, `lweb:LW-18`, `hot:H-24`
- **Status:** adjusted: H-24's desktop collision did not reproduce on Linux CI fonts; it does reproduce with macOS fonts (VIS-14, LW-18).
- **Evidence:**
  - No font is loaded
  - [live/web/s1-new-host/desktop/04-host-lobby-new-room.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s1-new-host/desktop/04-host-lobby-new-room.png) (the copy icon touches 'Round 1 • Fibonacci') vs docs/screenshots/latest/baseline/15-lobby-results-1440.png (DejaVu wraps)
  - Mobile: ~40px dead gap in docs/screenshots/latest/baseline/16-lobby-results-390.png
- **Fix direction:** Bundle Inter (variable, Latin subset, tnum). Lay out the room code and subtitle as block rows, or move the room code to a header pill.

### UX-059 · medium · No type or shape scale (28 font sizes, 12 radii), plus 9 dead and 2 no-op theme tokens

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-15`, `vis:VIS-31`
- **Status:** confirmed
- **Evidence:**
  - 28 distinct font-size values and 12 distinct border-radius values (visual metrics)
  - packages/client/src/theme/variables.scss and _glass.scss: elev-3, shadow-2/3, fill-strong and success/warning/danger have 0 uses; the btn-disabled tokens feed no-op vars
- **Fix direction:** An 8-step type scale and radii 8/12/20/pill as --hn-* tokens. Delete the dead tokens. Add a stylelint ban on literals outside theme/.

### UX-060 · medium · Emoji used as UI glyphs (⏱ stopwatch, emoji confetti) render as tofu on systems without an emoji font

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-08`, `jrn:J-30`  ·  **Related:** `a11y:RA-29`
- **Status:** adjusted: User platforms render the glyphs, so this is mainly consistency plus CI noise. Removing emoji confetti requires a docs/ux.md:251,256 update.
- **Evidence:**
  - packages/client/src/app/shared/vote-results.component.ts:149-151 (&#x23F1;), packages/client/src/app/core/celebration.service.ts:9, packages/client/src/app/lobby/lobby.page.ts:506
  - Tofu in docs/screenshots/latest/baseline/15-lobby-results-1440.png (Linux CI)
- **Fix direction:** No emoji in UI chrome: use the ionicon timer-outline, and vector confetti in brand colours (or none).

### UX-061 · medium · Connection and status messaging is loud and redundant: a chip, a banner and a 'Reconnected' toast, plus plain toasts that cover headers

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `vis:VIS-23`, `jrn:J-21`, `feat:F-25`
- **Status:** adjusted: J-21 was lowered to low, and its 'disable host actions while offline' recommendation was rejected: writes are local-first Yjs (ADR-0001/0003). ADR-0023 requires the session-end toast.
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:186,201 and packages/client/src/app/estimating/estimating.page.ts:136,149 mount both the chip and the banner
  - docs/screenshots/latest/connection/conn-01-disconnected-reconnecting-chip.png
- **Fix direction:** One connection indicator (warning after a ~2 s debounce), inline field errors, and styled toasts with an icon that never cover the title.

### UX-062 · medium · Inconsistent iconography and avatar language: mixed icon families and sizes, arrow vs chevron, no explicit host badge

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-21`
- **Status:** confirmed
- **Evidence:**
  - Every line cited in reports/visual.md VIS-21 matches (verifier); arrow vs chevron applies to md mode only
- **Fix direction:** One outline icon family at fixed sizes, initials avatars everywhere, and an explicit host badge.

### UX-063 · medium · The global ion-list background paints dark bands inside the Agenda card

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-19`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/theme/variables.scss:207-209 (ion-list background = --hnch-bg)
  - docs/screenshots/latest/agenda/04-agenda-3-items-host-desktop.png
- **Fix direction:** Transparent list background by default; set the page background only on page-level lists.

### UX-064 · low · The agenda 'add' affordance differs by surface: a tiny 2.17:1 '+' on desktop with 'Tap + to add' copy, and a mobile chip that the keyboard cannot activate

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `hot:M-8`, `vis:M5`, `a11y:RA-27`  ·  **Related:** `a11y:RA-18`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/agenda/agenda-panel.component.ts:85-95 (chip, click only) and :111-129 (icon-only '+')
  - docs/screenshots/latest/baseline/15-lobby-results-1440.png vs docs/screenshots/latest/baseline/16-lobby-results-390.png
- **Fix direction:** One labelled 'Add story' button or inline input everywhere, with device-neutral copy.

### UX-065 · low · Form polish: the Session name field uses a cramped legacy floating label, and left edges drift on Onboarding and Join

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:VIS-24`, `vis:VIS-25`
- **Status:** adjusted: Cramped, not overlapping; a small alignment nit.
- **Evidence:**
  - packages/client/src/app/session-settings/session-settings.sheet.ts:85; docs/screenshots/latest/baseline/07-session-settings-sheet.png, docs/screenshots/latest/baseline/19-join-390.png, docs/screenshots/latest/baseline/23-onboarding-390.png
- **Fix direction:** Use the modern label/labelPlacement API, and one content column with a shared left edge.

## accessibility (11)

### UX-066 · high · The Lobby exposes zero headings, and its regions are unlabelled (aria-label on a role-less div)

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `a11y:RA-06`, `a11y:M7`
- **Status:** confirmed: Estimating does have an h1/h2. The route-title half of RA-06 is in the brand issue.
- **Evidence:**
  - Live a11y tree: 0 headings on the Lobby (the h2s are flattened into accordion buttons)
  - packages/client/src/app/lobby/lobby.page.ts:442 ([attr.aria-label] on a plain div)
- **Fix direction:** One h1 per screen, section headings outside interactive elements, and labelled regions.

### UX-067 · high · Card grid: the selected card is not exposed as pressed, and every card is its own tab stop (roving tabindex is ineffective)

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `a11y:RA-08`
- **Status:** confirmed
- **Evidence:**
  - ion-card inherits only aria-label; live: all 8 inner buttons have tabIndex 0 and aria-pressed null
  - A labelled role=group already exists (packages/client/src/app/estimating/estimating.page.ts:205-210)
- **Fix direction:** Native <button aria-pressed> elements styled as cards, one roving tab stop, and an announcement 'Voted 3'.

### UX-068 · high · No status announcements, and focus drops to <body> on reveal and on auto-navigation

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `a11y:RA-09`, `a11y:M4`
- **Status:** confirmed
- **Evidence:**
  - Live regions are created inside @if blocks together with their content; 0 live regions on the Lobby after reveal
  - packages/client/src/app/estimating/estimating.page.ts:190 (role=status aria-live=off); aria-pressed on role-less ion-chips (estimating.page.ts:131, lobby.page.ts:381)
- **Fix direction:** One persistent app-level announcer (CDK LiveAnnouncer) for vote cast, progress, reveal summary, round start, host change and connection. Move focus to the screen's h1 on every stage change. Add an axe gate in CI.

### UX-069 · high · The Voter/Observer toggle is a non-focusable 1.72:1 chip in the voting toolbar: a third opt-out control that also changes the auto-reveal denominator

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `a11y:RA-10`, `feat:F-13`  ·  **Related:** `hot:H-25`
- **Status:** confirmed: F-13's 'Pass tile' amends the ADR-0041 §5 UI clause.
- **Evidence:**
  - Live: tabIndex -1, role null, StaticText 'Voter'; ion-chip sets no role
  - docs/screenshots/latest/baseline/22-estimating-390.png
  - packages/shared/src/auto-reveal.ts:58-61 (flipping the role mid-round can trigger a reveal; hot:H-25 note)
- **Fix direction:** Move 'Observe' to the self row or the room ⋯ (or make it a real toggle button with aria-pressed). Offer 'Join as observer'. Render abstain as a 'Pass' tile inside the grid.
- **ADR:** The Pass tile amends ADR-0041 §5.

### UX-070 · high · Pinch-zoom is disabled by the viewport meta tag

- **Surfaces:** web-mobile
- **Sources:** `a11y:RA-11`, `vis:VIS-29`
- **Status:** confirmed: iOS Safari ignores it; Android Chrome and app webviews honour it.
- **Evidence:**
  - packages/client/src/index.html:11 (maximum-scale=1.0, user-scalable=no)
- **Fix direction:** Use width=device-width, initial-scale=1, viewport-fit=cover. If iOS input zoom was the concern, use ≥16px input text.

### UX-071 · high · Keyboard focus rings fail 3:1 non-text contrast in dark mode

- **Surfaces:** web-desktop
- **Sources:** `vis:M1`
- **Status:** confirmed: Verifier-found (visual).
- **Evidence:**
  - packages/client/src/app/estimating/estimating.page.ts:348-355 (outline 2px var(--ion-color-primary) = #1F6B4F: 2.65:1 on #1C1C1E, 2.17:1 on #2C2C2E)
  - Only 5 focus-visible/focus-ring uses in app/
- **Fix direction:** Use the text-safe accent (or a two-tone ring) for focus rings, applied everywhere via the _a11y mixin.

### UX-072 · high · Host actions on phones are swipe-only (hidden from keyboards and screen readers), the drawer options are icon-only, and the swipe hint shows even when the host is alone

- **Surfaces:** web-mobile
- **Sources:** `a11y:RA-03`, `vis:M4`, `jrn:J-31`
- **Status:** confirmed: The iPad pointer:coarse case was not re-verified.
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:293-299 (hint shown to any mobile host), :326-335 (kebab is desktop-only), :337-352 (icon-only drawer)
  - docs/screenshots/latest/lobby-hierarchy/lobby-empty-mobile-dark.png
- **Fix direction:** A visible ≥44px row ⋯ on every surface that opens the same action sheet, with text labels. Keep swipe as an accelerator and drop the hint.

### UX-073 · medium · Small tap targets on phones (subtitle 18px, ⋯ 38x32, chips 32px), and no tooltips or device-appropriate wording on desktop

- **Surfaces:** web-mobile, web-desktop
- **Sources:** `lweb:LW-29`, `a11y:RA-18`
- **Status:** adjusted: RA-18: the WCAG 2.5.8 spacing exception may let the 18px target pass, so it is 'small' rather than a definite failure.
- **Evidence:**
  - [live/web/probes3/phone/log.json](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/probes3/phone/log.json) (tap_targets 166x18, 38x32, 59x32, 125x32)
  - 'Tap + to add' on desktop; the subtitle button has padding 0
- **Fix direction:** Minimum hit areas of 44px for touch and 32px for pointers. Tooltips equal to the aria-label on fine pointers. Desktop wording ('Click', 'Press N').

### UX-074 · medium · Accessible names hide visible text (room code, round title, history tallies)

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `a11y:RA-22`
- **Status:** adjusted: The recommendation was corrected: '2×1' means 1 vote for 2.
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:1514-1519 (the button copies the code, not a link); packages/client/src/app/shared/round-history.component.ts:217-231 (card×count format)
- **Fix direction:** Accessible names contain the visible label ('Room code MV8-GWT, copy'). Spell history out as '1 vote for 2'.

### UX-075 · medium · The reduced-motion preference is ignored by page and sheet transitions

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `a11y:RA-19`
- **Status:** adjusted: RA-19 corrected: reduced motion is honoured for the overlay and confetti, but not for route and sheet transitions.
- **Evidence:**
  - No Ionic 'animated' option is set; the overlay and confetti already honour it (packages/client/src/app/lobby/lobby.page.ts:875-879, packages/client/src/app/core/celebration.service.ts:222)
- **Fix direction:** animated: !prefersReducedMotion, or an opacity-only 120 ms transition on desktop.

### UX-076 · low · The recent-rooms list nests a button inside a button

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `a11y:RA-26`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/home/recent-rooms-list.component.ts:66-89
- **Fix direction:** Separate the row action and the remove target.

## copy (2)

### UX-077 · medium · Round numbering is incoherent: the Lobby subtitle shows the next round beside the previous results, re-votes and discards inflate the count, and the voting H1 is 'Round N' instead of the story

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `hot:H-12`, `lweb:LW-08`, `lcli:F-11`, `vis:M3`, `a11y:M3`, `jrn:M-8`, `feat:M5`  ·  **Related:** `feat:M6`, `jrn:J-04`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:1001-1009 (`Round ${rounds.length+1} • scale`)
  - docs/screenshots/latest/baseline/16-lobby-results-390.png ('Round 2 • Fibonacci' above 'Round 1 Results')
  - [live/web/s4-three-stories/phone/16-host-s3-host-results.png](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/web/s4-three-stories/phone/16-host-s3-host-results.png) ('Round 5 • Fibonacci' / 'Round 4 Results' after 3 stories)
  - packages/cli/src/ui/Voting.tsx:101 (indexOf+1) vs packages/shared/src/round-presentation.ts:77-81 (formatRoundPosition); packages/client/src/app/estimating/estimating.page.ts:151 (h1 'Round N')
- **Fix direction:** Label by story ('Story 3 of 12 · PROJ-99'; re-votes as '2nd vote'). Make the story title the H1. Drop the round number from the Session card. Use one shared formatter on both surfaces.

### UX-078 · medium · Host-change notices are wrong: a deliberate hand-off is announced as '<prev> disconnected' (with a warning haptic), and the CLI announces 'X is now the host' on every join

- **Surfaces:** web-desktop, web-mobile, cli
- **Sources:** `jrn:J-17`  ·  **Related:** `cli:CLI-14`, `lcli:F-30`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/core/host-change-message.ts:10-15; packages/client/src/app/app.component.ts:61-79 (cannot tell a hand-off from an election)
  - packages/cli/src/session.ts:309-317 (pre-sync lastHostId); [frames-1.16.1/02-joiner-lobby.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/02-joiner-lobby.txt)
- **Fix direction:** Pass a reason: 'Hana made Jo the host' vs 'Hana dropped. Jo is now hosting'. No haptic on a hand-off. Fire host notices only after the initial sync.

## settings/IA bloat (8)

### UX-079 · medium · App Settings is bloated for a quick tool (accent picker, custom hex, default session name, password by default, Relay URL, keyboard rows on phones), yet it can't be reached from inside a session

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `jrn:J-25`, `feat:F-15`, `vis:M6`, `vis:VIS-33`  ·  **Related:** `vis:VIS-03`
- **Status:** confirmed: F-15 adjusted to low because Settings is never shown mid-meeting. The cut list is opinion. Custom hex was added at a user's request (ADR-0043 §6), so ask before cutting it.
- **Evidence:**
  - packages/client/src/app/settings/settings.page.ts:105-290 (sections) and :252-275 (keyboard rows, no surface gate)
  - docs/screenshots/latest/baseline/04-settings-1440.png, docs/screenshots/latest/baseline/18-settings-390.png
- **Fix direction:** Keep Name, avatar, Theme, Default scale and About; put Relay URL under Advanced. Cut password by default, default session name and the keyboard rows (use a desktop '?' overlay instead). Make Settings a gear icon that is reachable in-session.
- **ADR:** ADR-0043 §6 (custom hex).

### UX-080 · medium · The session name can be edited (with a default-name preference) but is never displayed on web

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `jrn:J-20`, `feat:F-16`
- **Status:** confirmed
- **Evidence:**
  - The only consumer is packages/client/src/app/session-settings/session-settings.sheet.ts:90; it is not in packages/shared/src/round-export.ts; the CLI renders it (packages/cli/src/ui/App.tsx:454)
- **Fix direction:** Either show the name in the room header and in Recent (Recent needs an ADR-0044 cache amendment), or cut the field and the 'Default session name' preference.

### UX-081 · medium · Scale management is three sheets deep with two editors, and peers see custom scale names as UUID fragments

- **Surfaces:** web-desktop, web-mobile, cli  ·  **Cut candidate**
- **Sources:** `feat:F-12`  ·  **Related:** `vis:VIS-17`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/lobby/lobby.page.ts:1007 (the subtitle uses the local custom-scale list)
  - Peers fall back to formatScaleId (packages/shared/src/doc.ts:412-420) on custom-<uuid> (packages/client/src/app/core/scale-preference.service.ts:129)
  - Nesting: Session settings → Scale → Preset/Custom editor
- **Fix direction:** Show Fibonacci and T-shirt plus 'More scales…'. Cut the preset-override editor in favour of 'Duplicate as custom'. Carry the label with the scale in settings.
- **ADR:** Amends ADR-0019 (PresetOverrides, roaming labels).

### UX-082 · medium · ADR-0021's lockstep parity contract pulls management and personalisation UIs into the CLI, so every CLI cut needs a superseding ADR first

- **Surfaces:** cli
- **Sources:** `feat:F-21`, `lcli:M7`
- **Status:** confirmed: Verifiers flagged that the auditors' CLI cut lists ignore this precondition.
- **Evidence:**
  - adr/0021-cli-package.md:14,19,34 (behaviour parity; its revisit clause anticipates narrowing it); adr/0046-round-discard-tombstone.md:11,43; adr/0041-per-round-abstain-sentinel.md:26
- **Fix direction:** Phase-0 ADR: CLI parity = wire protocol + core estimate loop (create/join/resume, vote/reveal/re-vote/accept, invite, host scale). Personalisation and editors are web-only. Hiding features behind '?' needs no ADR.
- **ADR:** Supersedes ADR-0021 Decision 2.

### UX-083 · low · CLI-only configuration editors (preset editor, custom-scale editor, avatar picker) sit off the speed path

- **Surfaces:** cli  ·  **Cut candidate**
- **Sources:** `cli:CLI-24`  ·  **Related:** `lcli:F-29`
- **Status:** adjusted: 'The CLI never shows avatars' is misleading. Removing the avatar picker collides with ADR-0043 §7.
- **Evidence:**
  - The editors exist in `hnch config`; avatarColor is written to the doc (packages/cli/src/index.ts:96,169), so web peers do see it
- **Fix direction:** Keep flags and config keys (e.g. `hnch config set scale.custom "XS S M L XL"`, --color), and drop the TUI editors.
- **ADR:** Removing the avatar picker supersedes ADR-0043 §7.

### UX-084 · low · Single-item menus: the web Home ⋯ holds only Settings, and the CLI 'm' Host Actions menu holds only End session (3 steps)

- **Surfaces:** web-desktop, web-mobile, cli  ·  **Cut candidate**
- **Sources:** `cli:CLI-23`  ·  **Related:** `feat:F-24`, `vis:VIS-32`
- **Status:** confirmed
- **Evidence:**
  - packages/client/src/app/home/home.page.ts:469-487; packages/cli/src/ui/components/HostActionsMenu.tsx:4-10 (m, Enter, y; [frames-1.16.1/13-host-menu.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/13-host-menu.txt))
- **Fix direction:** A gear icon on Home. In the CLI, put End session in the q prompt ('(l)eave / (e)nd for all') or the '?' palette.

### UX-085 · low · In-app QR scanning duplicates the phone camera and is even offered on desktop

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `feat:F-11`
- **Status:** adjusted: One optional row that does not slow the loop, so low.
- **Evidence:**
  - The desktop scan row was seen live at 1440px; no native projects exist yet (Phase 6b)
- **Fix direction:** Cut scanning and keep QR display, or at least hide scanning on devices without a camera.
- **ADR:** Cutting it supersedes ADR-0034.

### UX-086 · low · Chrome noise in the hot loop: the role toggle in the voting toolbar, durations on results, and edit pencils in the primary path

- **Surfaces:** web-desktop, web-mobile  ·  **Cut candidate**
- **Sources:** `hot:H-25`
- **Status:** confirmed: Opinion.
- **Evidence:**
  - The references are correct, but the finding is opinion (hotloop verifier); packages/shared/src/auto-reveal.ts:58-61
- **Fix direction:** Move the role toggle to ⋯ or the self row, durations to history/export, and the pencils to a detail view.

## CLI command surface (7)

### UX-087 · high · `hnch resume` with two or more cached rooms always fails ('No selection made.'), and its prompt is invisible

- **Surfaces:** cli
- **Sources:** `lcli:F-01`
- **Status:** adjusted: Lowered from critical: it needs 2+ cached entries, and every clean exit wipes the cache.
- **Evidence:**
  - packages/cli/src/index.ts:268-269 (rl.close() before resolve), :278 (the close listener rejects first), :433-437
  - [live/cli/s3-web-host-cli-voter/24-resume-multi-picked.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s3-web-host-cli-voter/24-resume-multi-picked.txt)
- **Fix direction:** Resolve before closing. Better: an Ink picker (↑↓ ⏎, digits) or `hnch resume <code>`.

### UX-088 · high · `hnch agenda add/list/…` print their result but never exit (an undestroyed Awareness keeps Node alive)

- **Surfaces:** cli
- **Sources:** `cli:CLI-03`, `lcli:F-02`  ·  **Related:** `feat:F-19`, `feat:M7`
- **Status:** adjusted: Lowered from critical: the write succeeds and Ctrl+C escapes, but scripting is blocked.
- **Evidence:**
  - packages/cli/src/commands/agenda.ts:84 (the Awareness is never destroyed); packages/cli/src/session.ts:384-395 (disconnect does not destroy it)
  - [scripts/verify-awareness-hang.mjs](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/scripts/verify-awareness-hang.mjs) (proves the cause); [live/cli/s9-agenda-hang/](https://github.com/IIxauII/hnch/tree/ux-overhaul-artifacts/live/cli/s9-agenda-hang) (still alive at 15 s); s5-agenda-config results.json exit:null at 20.3 s
- **Fix direction:** Destroy the awareness and the doc on disconnect, and exit after the flush. Add an e2e test asserting that one-shots exit within 2 s.

### UX-089 · high · The CLI password prompt has no visible label and echoes the password in plain text, and a wrong password on `join` drops into a fake lobby

- **Surfaces:** cli
- **Sources:** `cli:CLI-09`, `lcli:F-07`, `lcli:F-03`
- **Status:** confirmed: lcli:F-03 lowered (the reason is printed, and q/y plus a retry recovers) but still high. --password is already a boolean flag.
- **Evidence:**
  - packages/cli/src/index.ts:53-62 (label written to stderr, then rl.question('') with echo on); :182-191 (handleJoin handles only unknown-room/room-full, while resume handles wrong-password at :340-343, :397-402)
  - [frames-1.16.1/a0-password-typing.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/a0-password-typing.txt), a1-joiner-password-prompt.txt; [live/cli/s4-errors/09-pw-join-wrong-after-6s.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s4-errors/09-pw-join-wrong-after-6s.txt)
- **Fix direction:** A masked, labelled input (the TextInput mask already exists), cleared after submit. Re-prompt on a wrong password up to 3 times, then exit non-zero. Add --password-stdin for scripts.
- **ADR:** ADR-0044 already specifies clearing the hash and re-prompting.

### UX-090 · medium · The CLI command contract is rough: `--version` prints 'unknown'/0.0.0, `-h` fails, `hnch <code>` and `join <url>` are rejected, and there are no examples, --json or completion

- **Surfaces:** cli
- **Sources:** `cli:CLI-16`, `lcli:F-24`  ·  **Related:** `lcli:F-25`
- **Status:** confirmed: Dashed or lowercase codes already work (room-code.ts:54-56).
- **Evidence:**
  - Published 1.16.1: --version prints 'unknown', -h exits 1, 'hnch K7P9MR' gives 'Unknown argument' ([live/cli/s1-first-run/05-version.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s1-first-run/05-version.txt), 02-help.txt)
  - packages/cli/src/index.ts never calls .version(); parseInviteContent exists but join does not use it
- **Fix direction:** Accept a positional code (ADR-0026 allows it) and URL join (needs an ADR superseding ADR-0026). Inject the version at build time. Add -h/-V, examples-first help, --json and completion.
- **ADR:** URL join supersedes ADR-0026.

### UX-091 · medium · CLI errors leak internals and exit codes are wrong: relay unreachable exits 0, a bad --scale exits 0, a non-TTY run crashes after the room is created, and validation comes late

- **Surfaces:** cli
- **Sources:** `cli:CLI-17`, `lcli:F-27`
- **Status:** confirmed
- **Evidence:**
  - [cli-out/errors.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/cli-out/errors.txt) (leaked 'unknown-room' reason; non-TTY stack trace); [live/cli/s4-errors/](https://github.com/IIxauII/hnch/tree/ux-overhaul-artifacts/live/cli/s4-errors) (13-15 unreachable cases)
  - packages/cli/src/room-code-input.ts rejects only an empty code; packages/cli/src/index.ts:75-87 (password prompted before --scale is validated), :295-298 (unreachable exits 0), :477-483
- **Fix direction:** Validate before prompting or any network work. One error formatter (what happened, why, the next command). A documented exit-code table. Fail early when not a TTY (or use --plain).

### UX-092 · medium · Agenda one-shots act as full participants: joinDoc un-leaves kicked users, resets the role to voter, leaves ghosts, and starts host election and auto-reveal

- **Surfaces:** cli
- **Sources:** `lcli:F-17`, `lcli:M3`, `cli:M6`, `feat:M7`
- **Status:** confirmed: feat:M7 (holding the auto-reveal denominator open) is plausible but static only.
- **Evidence:**
  - packages/cli/src/commands/agenda.ts:82-104 (joinDoc before sync; sets the awareness participant id; never leaves)
  - packages/shared/src/doc-projection.ts:373-375 (joinDoc deletes leftAt/removedBy); packages/cli/src/session.ts:268-300 (election and auto-reveal start)
  - [live/cli/s5-agenda-config/01-host-observer-before-agenda.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s5-agenda-config/01-host-observer-before-agenda.txt) → 02-host-after-agenda-add-1.txt (viewer becomes voter)
- **Fix direction:** One-shots use a sync-only connection with no joinDoc, awareness, election or auto-reveal (or cut them; see the next issue).

### UX-093 · medium · `hnch agenda skip/cancel/mv` are effectively unusable: list shows indexes but the commands need UUIDs or sortKeys, and the target room is implicit

- **Surfaces:** cli  ·  **Cut candidate**
- **Sources:** `feat:F-19`, `cli:CLI-12`, `lcli:F-28`, `lcli:M2`
- **Status:** adjusted: A niche scripting path, so medium. Cutting it removes agenda management from the CLI (the TUI has no skip/cancel/reorder).
- **Evidence:**
  - packages/cli/src/commands/agenda.ts:226-228 (no ids printed), :127-137 (entries[0] = implicit room), :193 (prints only a UUID)
  - packages/cli/src/index.ts:684-692 (mv takes sortKeys while the docs say ID); skip by index fails with 'item 2 not found'
- **Fix direction:** Cut skip/cancel/mv. Replace them with `hnch create --agenda file.txt` / `agenda import <file|->` and a `--room` flag, and echo the room code on success.
- **ADR:** Needs the ADR-0021 narrowing (and ADR-0042).

## CLI TUI (13)

### UX-094 · critical · CLI Settings → Access → Password freezes the TUI: keys echo raw, and only Ctrl+C escapes, which also wipes resume

- **Surfaces:** cli
- **Sources:** `cli:CLI-02`
- **Status:** confirmed: Worse than reported: the Ctrl+C escape runs clearLastSession (index.ts:144-147), so the host also loses resume.
- **Evidence:**
  - packages/cli/src/ui/components/LobbySettings.tsx:244-248 (forwards only 'open', so the password field never mounts); the AccessPicker handler is isActive:!editingPassword
  - [frames-1.16.1/33-access-enter-password.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/33-access-enter-password.txt), 34-after-typing-pw.txt, 35-after-esc-esc-q.txt
- **Fix direction:** Fix the state flow and mount a masked, labelled input. Add a test that every overlay keeps an active handler that responds to Esc.

### UX-095 · high · The CLI clears the whole screen and scrollback every second once the frame is taller than the terminal, and narrow terminals split words and leave ghost lines

- **Surfaces:** cli
- **Sources:** `cli:CLI-04`, `lcli:F-12`
- **Status:** confirmed: Upgrading to Ink 8 needs React ≥19.3 and a test migration.
- **Evidence:**
  - ink 5.2.1 build/ink.js:121-123 (clearTerminal whenever outputHeight >= rows); packages/cli/src/ui/App.tsx:114-123 (a new Set every second)
  - [cli-out/main-1.16.1.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/cli-out/main-1.16.1.txt):344-345 (4 clears in 4 s at 80x24); [live/cli/s6-results.json](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s6-results.json) (5 per 4 s at 60x20); the lobby/results frame is 28 lines
- **Fix direction:** First skip no-op state updates and budget every screen to 80x24. Then move to Ink ≥7 with alternateScreen and incremental rendering (the prototype measured 0 clears).

### UX-096 · high · CLI key-hint rows are overloaded (up to 10 hints) and wrap mid-label even at 100 columns

- **Surfaces:** cli  ·  **Cut candidate**
- **Sources:** `cli:CLI-05`, `lcli:F-19`  ·  **Related:** `feat:F-20`
- **Status:** confirmed
- **Evidence:**
  - packages/cli/src/ui/Lobby.tsx:424-463, packages/cli/src/ui/Voting.tsx:143-152
  - [frames-1.16.1/09-host-results-60x20.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/09-host-results-60x20.txt) ('R evote', 'Se ttings'); [live/cli/s2-cli-host-web-voter/](https://github.com/IIxauII/hnch/tree/ux-overhaul-artifacts/live/cli/s2-cli-host-web-voter) frames 26 and 30
- **Fix direction:** One truncating hint line: primary action first, at most 4-6 contextual hints, then '? more' and 'q leave'. Never wrap labels.

### UX-097 · high · CLI keys change meaning across screens (s = Start/Skip, a = Agenda/Abstain), destructive d/s act on a single keypress, e is host-only in the lobby, and the docs disagree

- **Surfaces:** cli  ·  **Cut candidate**
- **Sources:** `cli:CLI-06`, `feat:F-20`, `lcli:F-21`, `lcli:M4`, `lcli:F-31`, `a11y:M8`
- **Status:** adjusted: CLI-06's premise that web confirms discard is false: the web back chevron discards unconfirmed, and ADR-0046 accepts that. Renaming keys creates cross-version inconsistency.
- **Evidence:**
  - packages/cli/src/ui/Lobby.tsx:153-159 vs packages/cli/src/ui/Voting.tsx:59-80
  - docs/cli.md:107-116 says C copies the invite link, but it opens a 3-item picker (packages/cli/src/ui/components/SharePicker.tsx:11-16)
- **Fix direction:** One key = one intent everywhere, taken from the shared keymap (see the desktop keyboard issue), with the docs generated from it. Destructive keys get a confirm or undo (decide with the discard issue).

### UX-098 · high · CLI overlays have no modal stack: Esc does nothing in the hand-off picker, '[q] Cancel' also opens 'Leave session?', one 'y' can confirm two prompts, and the picker can't reach participant 10+

- **Surfaces:** cli
- **Sources:** `cli:CLI-08`, `lcli:F-06`, `cli:M3`, `cli:M5`
- **Status:** confirmed: cli:M3 (double confirm) was found by code reading, not run.
- **Evidence:**
  - packages/cli/src/ui/Lobby.tsx:210,226 (compares input==='Escape', which never matches; Ink reports key.escape), :206-208 (single-key parseInt), :124-127
  - packages/cli/src/ui/App.tsx:141-149 (the quit gate ignores Lobby overlays)
  - [frames-1.16.1/14b-host-handoff-after-esc.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/14b-host-handoff-after-esc.txt), 14c-host-handoff-after-q.txt; [live/cli/s12-handoff/02-after-esc.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s12-handoff/02-after-esc.txt)
- **Fix direction:** One App-owned modal stack: Esc pops the top layer, and q is active only at the top level. An arrow-navigable participants panel for hand-off and kick. Render tests for every overlay.

### UX-099 · medium · CLI progress and presence signals are weak: no 'N of M voted · waiting on X', a '(voter)' self label, '·' for everyone in the lobby, and 'Waiting for participants…' with 3 present

- **Surfaces:** cli
- **Sources:** `cli:CLI-14`, `lcli:F-15`, `lcli:F-30`
- **Status:** adjusted: lcli:F-15 is medium: each roster row already shows ✓ or ·.
- **Evidence:**
  - packages/cli/src/ui/components/ParticipantList.tsx:42,51-52; packages/cli/src/ui/Lobby.tsx:275 (votes={})
  - [frames-1.16.1/03-host-lobby-with-agenda.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/03-host-lobby-with-agenda.txt)
- **Fix direction:** One progress line ('Voted 3/5 · waiting on Cleo, Dana'), a 'you' marker and context-aware headings. Lobby = invite + roster + next story + one primary key.

### UX-100 · medium · The CLI ignores NO_COLOR, rejects --no-color, loses the card cursor in monochrome, and encodes host-only meaning by colour alone

- **Surfaces:** cli
- **Sources:** `cli:CLI-15`, `lcli:F-23`
- **Status:** confirmed: The point about yellow-hint contrast is unmeasured opinion.
- **Evidence:**
  - [cli-out/colorflags.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/cli-out/colorflags.txt) (NO_COLOR=1 → 44 SGR sequences; --no-color exits 1; FORCE_COLOR=0 → 0); [live/cli/s6-nocolor/](https://github.com/IIxauII/hnch/tree/ux-overhaul-artifacts/live/cli/s6-nocolor)
- **Fix direction:** Honour NO_COLOR, --no-color and TERM=dumb. Show focus with glyphs (▲, heavy borders). Use the default fg plus bold/dim for text, and colour for accents only.

### UX-101 · medium · CLI invite/share is weak: no web link on create, the invite is printed once to stderr, the code appears in two formats, the hnch.dev origin is hard-coded, and export has no clipboard fallback

- **Surfaces:** cli
- **Sources:** `cli:CLI-18`, `lcli:F-26`, `lcli:F-25`  ·  **Related:** `feat:F-24`
- **Status:** adjusted: The share picker does show the full URL persistently (lcli:F-26 adjusted). Deriving the share origin from the relay config collides with ADR-0031.
- **Evidence:**
  - packages/cli/src/share.ts:9-12 (hard-coded https://hnch.dev); StatusBar shows the raw code while SharePicker formats it
  - [frames-1.16.1/12-host-share-picker.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/12-host-share-picker.txt); [live/cli/s11-copy-fail/01-copy-failed-notice.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s11-copy-fail/01-copy-failed-notice.txt)
- **Fix direction:** A persistent invite line (formatted code · web URL · npx one-liner); 'c' copies the link directly; OSC 52 clipboard. Export falls back to writing ./hnch-<code>.md. Use an explicit share-origin setting.
- **ADR:** ADR-0031, if the origin is derived from the relay.

### UX-102 · medium · CLI settings and prompt traps: Enter means 'customize' in the scale picker, in-session changes write global config, there is no line editing, and the env override is hidden in config

- **Surfaces:** cli
- **Sources:** `cli:CLI-19`, `lcli:F-29`
- **Status:** confirmed
- **Evidence:**
  - packages/cli/src/ui/components/ScalePicker.tsx:66-83 ([frames-1.16.1/b1-enter-on-tshirt.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/b1-enter-on-tshirt.txt)); packages/cli/src/ui/components/LobbySettings.tsx:143-152; packages/cli/src/ui/components/TextInput.tsx:23-36
  - packages/cli/src/config.ts:136 vs packages/cli/src/ui/components/ConfigSettings.tsx:77
- **Fix direction:** Enter always selects. Keep customisation out of the session. Add readline-style keys. Show '(overridden by HNCH_RELAY_URL)'.

### UX-103 · medium · CLI exit leaves a stale, live-looking frame and no results summary ('Session ended.' is painted over)

- **Surfaces:** cli
- **Sources:** `cli:CLI-21`, `lcli:F-18`
- **Status:** confirmed
- **Evidence:**
  - [frames-1.16.1/18b-joiner-after-quit.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/frames-1.16.1/18b-joiner-after-quit.txt), a5-host-after-end.txt; [live/cli/s1-first-run/14-after-exit.txt](https://github.com/IIxauII/hnch/blob/ux-overhaul-artifacts/live/cli/s1-first-run/14-after-exit.txt)
- **Fix direction:** Use the alternate screen so the shell is restored. Print a 3-6 line summary (stories, estimates, resume command). Send Markdown results to stdout when piped or with --summary.

### UX-104 · medium · The CLI has no plain or screen-reader mode (also needed for CI, logs and non-TTY use)

- **Surfaces:** cli
- **Sources:** `cli:CLI-22`
- **Status:** confirmed: The screen-reader harm is reasoned, not tested. --plain also fixes the non-TTY crash (the stronger reason).
- **Evidence:**
  - Ink 5 (packages/cli/package.json:52) and no --plain flag; the 1 Hz full redraw is real
- **Fix direction:** A --plain append-only event mode; Ink ≥7 aria labels later.

### UX-105 · low · Opening Settings ('e') during voting replaces the round screen, so a voter can miss progress and the reveal

- **Surfaces:** cli
- **Sources:** `cli:M7`
- **Status:** confirmed: Verifier-found (cli).
- **Evidence:**
  - packages/cli/src/ui/Voting.tsx:59-62; packages/cli/src/ui/App.tsx:487-501
- **Fix direction:** An overlay that keeps the round visible, or drop 'e' from the voting screen for non-hosts.

### UX-106 · low · CLI [x] Export is offered when only skipped or discarded rounds exist, then 'succeeds' with an empty clipboard

- **Surfaces:** cli
- **Sources:** `lcli:M5`
- **Status:** confirmed: Verifier-found (live_cli).
- **Evidence:**
  - packages/cli/src/ui/App.tsx:386 (canExport counts any terminal round); packages/shared/src/round-export.ts:162-163 returns ''; packages/cli/src/ui/lobby-helpers.ts:37-40
- **Fix direction:** Gate export on at least one revealed round, or say 'Nothing to export yet'.

## docs drift (3)

### UX-107 · medium · Web docs drift from the code: docs/ux.md §3 (inline desktop CTA, 800px Lobby), agenda tap-to-start, the haptic map, project.md's crown icon, and ADR-0043's AA claim

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `jrn:J-35`, `a11y:RA-28`, `feat:F-26`, `hot:H-26`  ·  **Related:** `lweb:M4`, `vis:M8`
- **Status:** confirmed: F-26 adjusted: Nearby discovery is marked v2/deferred, so it is not drift.
- **Evidence:**
  - docs/ux.md:99, 101, 148, 159, 270, 294, 346 and docs/project.md:156 differ from the code (spot-checked)
  - ux.md §3 vs packages/client/src/global.scss:82-92 and packages/client/src/app/lobby/lobby.page.ts:651-655; adr/0043-per-participant-avatar-color.md, Context bullet 4
- **Fix direction:** Update ux.md and project.md in the same PR as each flow change. Decide the desktop layout spec first. Add axe, contrast and keyboard tests as CI gates so the 'AA' claims are tested.

### UX-108 · medium · Visual baselines don't show what users see: no iOS, touch or light variants, mid-transition frames (Home 'ghost text'), and tofu glyphs

- **Surfaces:** web-desktop, web-mobile
- **Sources:** `vis:M2`, `vis:VIS-30`, `lweb:LW-22`, `a11y:RA-29`
- **Status:** adjusted: LW-22's ghost-frame metric and frames do not exist (that probe run failed). For users the ghost is the normal md cross-fade.
- **Evidence:**
  - packages/e2e/tests/_screenshots/capture.spec.ts:45-47 (colorScheme 'dark' only) and :52-55 (fixed 200 ms wait vs a 280 ms md transition)
  - playwright.config.ts:51-53 (desktop projects only); docs/screenshots/latest/baseline/02-home-1440.png (ghost text), docs/screenshots/latest/baseline/15-lobby-results-1440.png (tofu)
- **Fix direction:** Add an iPhone device profile and light variants to the capture matrix. Capture after ionViewDidEnter with animations off. On desktop, use an opacity-only page transition or none.

### UX-109 · low · docs/cli.md drifts from the CLI (picker 'wraps', C copies the link, Q leaves), and the local CLI dist lags HEAD

- **Surfaces:** cli
- **Sources:** `cli:CLI-26`, `lcli:F-32`  ·  **Related:** `hot:H-26`, `feat:F-26`, `lcli:M4`
- **Status:** adjusted: hot:H-26's 'users get a stale binary' was refuted: the stale dist affects only local runs and reviews.
- **Evidence:**
  - docs/cli.md:91, 101, 107-116; packages/cli/dist is dated Aug 23 vs src Aug 26; dist is gitignored (.gitignore:11) and rebuilt by prepublishOnly
- **Fix direction:** Rewrite docs/cli.md around the unified keymap and command surface, generating the key table. Build the CLI in the dev stack for UX reviews.

## Appendix A: Refuted

### A.1 Whole findings refuted

| Source | Claim | Why it was refuted |
|---|---|---|
| `jrn:J-36` | Fresh identities all got the 'Violet' avatar (palette collision) | djb2 mod 12 over 120 000 random UUIDs gives 8.2-8.5% per key, i.e. uniform. Six fresh live contexts got six varied colours. The three Violets were chance (~0.7%) or reused contexts. What is real (dark-mode avatar contrast) is in the avatar-colour issue. |
| `lcli:F-20` | CLI shows abstain as ✓ (same as a vote) and silently ignores card keys | ADR-0041 §6 requires pre-reveal abstainers to look like voters (anonymity), so the ✓ is intended. Card keys show the hint '(abstaining this round — press [a] to vote)' (Voting.tsx:131). Only a one-row layout shift survives, as a low nit; it is not carried into the register. |

### A.2 Refuted sub-claims inside surviving findings

The findings themselves survive in the register; only these parts were dropped.

| Source | Dropped claim | Verifier evidence |
|---|---|---|
| `hot:H-08 / a11y:RA-05` | Results are buried on desktop too | At 1440x900 the Results card is above the fold as the 2nd card in the right column (baseline/15). |
| `hot:H-07` | Start is at the top of the screen on mobile | Start sits mid-screen (~44% height) in a 0.6 half-sheet. |
| `hot:H-13 / feat:F-14 / vis:VIS-10 / lweb:LW-09` | The celebration overlay blocks moving on / '3 s of dead time' | The overlay is scoped to ion-content, click-dismissible, the footer stays usable, and it fires only on consensus. |
| `hot:H-20` | Voters can't tell done from not-voted | The selected-card highlight, 'x of N voted' and 'Waiting on' exist (avatar-vote-row.component.ts:29,105). |
| `hot:H-04 (recommendation)` | Fix the CLI by mirroring the web filter | The web History has the same discarded-round leak (hot:M-1); a shared selector is needed. |
| `hot:H-24 (desktop part)` | Room-code/subtitle collision at 1440x900 | Not reproduced on CI fonts; it is reproduced on macOS fonts via VIS-14/LW-18. |
| `hot:H-26 (dist part)` | Users get a stale CLI build | dist is gitignored and rebuilt by prepublishOnly; only local runs are stale. |
| `feat:F-06` | Password-room users must retype on every reload | After one rejoin via /join, lastSession holds passwordHash and the next reload goes straight to the Lobby. |
| `feat:F-03` | 1 to 3 inputs per story | The fields are optional and pre-filled from the agenda; the cost is 1 modal + 1 confirm tap. |
| `feat:F-01 / a11y:RA-02` | Positional digits are a silent bug | Deliberate, documented design (#154, settings.page.ts:258-261); the cast card highlights. |
| `feat:F-26` | Nearby discovery is doc drift | It is explicitly marked '(v2) Deferred' (project.md:83). |
| `jrn:J-21 (recommendation)` | Disable host actions while disconnected | Writes are local-first Yjs and merge on reconnect (ADR-0001/0003); a live CTA is correct. |
| `jrn:J-30 / vis:VIS-08` | Emoji render as tofu for users | Tofu appears only on systems without an emoji font (CI/Linux); macOS renders ⏱. |
| `lweb:LW-22` | Ghost-frame opacity timeline | The ghost-*.png frames and the ghost_frames metric do not exist (the probe run timed out). |
| `lweb:LW-24` | '(no footer)' metric proves the host left voters stuck | Voters never get a lobby footer, so the metric proves nothing. |
| `lweb:LW-01 / LW-20 (citations)` | Screenshots 04-jonas…/08-host-failure | The real files are 05-jonas-after-reload-midround.png and 09-host-failure.png. |
| `vis:VIS-24` | Session name label and placeholder collide | They are stacked tightly but do not overlap. |
| `cli:CLI-06 (premise)` | Web discards via back plus a confirm | Web softExit discards with no confirmation (estimating.page.ts:757-763), as ADR-0046 accepts. |
| `cli:CLI-09` | The password is passed as a flag value | --password is already a boolean (index.ts:513-516, 540-544). |
| `lcli:F-25` | join should accept dashed or lowercase codes | normalizeRoomCode already strips dashes and uppercases (room-code.ts:54-56). |
| `lcli:F-26` | The invite link is visible for only 3 s | The share picker shows the full URL persistently (SharePicker.tsx:14). |
| `lcli:F-21 / lweb:LW-32` | A second ⏎ or re-tap un-voting is a bug | Documented intended UX (docs/cli.md:102, docs/ux.md:242) via the shared toggleCurrentVote. |
| `lcli:F-05` | [t] does nothing after a discard | [t] does nothing only when the previous non-discarded round was skipped; otherwise it edits the previous story's title. |
| `vis:VIS-01 / a11y:RA-01` | The default theme is dark | The default is 'system' (theme.service.ts:22); light racing-green is 12.2:1. |
| `vis:VIS-01 (proposal value)` | Mint #7ED6AA is 9.86:1 | It is 8.02:1 on #2C2C2E. |

### A.3 Unverifiable (neither confirmed nor refuted)

| Source | Claim | Note |
|---|---|---|
| `cli:CLI-25` | Terminal compatibility risks: Git Bash raw mode, Windows config path, glyph widths, Linux clipboard | Not tested on Windows; code-level risks only. Using %APPDATA%\hnch contradicts ADR-0021 §3-4 and ADR-0044 (storage paths preserved); config.ts already honours XDG_CONFIG_HOME. Keep it as a test-matrix item for the --plain / OSC 52 work (CLI TUI issues), not as a defect. |

## Appendix B: Source → canonical issue index

Every verified finding and verifier-found issue, and where it landed. A source marked `(rel)` is cited as related only.

| Source | Verdict | Sev | → Issue(s) |
|---|---|---|---|
| `jrn:J-01` | confirmed | critical | UX-001, UX-032 (rel) |
| `jrn:J-02` | adjusted | high | UX-007, UX-013 (rel) |
| `jrn:J-03` | confirmed | high | UX-025 |
| `jrn:J-04` | confirmed | high | UX-004, UX-077 (rel) |
| `jrn:J-05` | confirmed | high | UX-005 |
| `jrn:J-06` | confirmed | high | UX-006 |
| `jrn:J-07` | adjusted | medium | UX-026 |
| `jrn:J-08` | confirmed | high | UX-024 |
| `jrn:J-09` | confirmed | medium | UX-002 |
| `jrn:J-10` | confirmed | high | UX-020 |
| `jrn:J-11` | confirmed | high | UX-034 |
| `jrn:J-12` | confirmed | medium | UX-016, UX-021 (rel) |
| `jrn:J-13` | confirmed | medium | UX-029 |
| `jrn:J-14` | confirmed | medium | UX-026 |
| `jrn:J-15` | confirmed | medium | UX-030 |
| `jrn:J-16` | confirmed | medium | UX-031 |
| `jrn:J-17` | confirmed | medium | UX-078 |
| `jrn:J-18` | confirmed | medium | UX-027 |
| `jrn:J-19` | confirmed | medium | UX-028 |
| `jrn:J-20` | confirmed | medium | UX-080 |
| `jrn:J-21` | adjusted | low | UX-061 |
| `jrn:J-22` | adjusted | high | UX-048, UX-051 (rel) |
| `jrn:J-23` | confirmed | medium | UX-041 |
| `jrn:J-24` | confirmed | medium | UX-055, UX-056 (rel) |
| `jrn:J-25` | confirmed | medium | UX-079 |
| `jrn:J-26` | confirmed | medium | UX-022 |
| `jrn:J-27` | confirmed | low | UX-028 |
| `jrn:J-28` | confirmed | low | UX-053 |
| `jrn:J-29` | confirmed | low | UX-036 |
| `jrn:J-30` | adjusted | low | UX-060 |
| `jrn:J-31` | confirmed | low | UX-072 |
| `jrn:J-32` | confirmed | low | UX-027 |
| `jrn:J-33` | confirmed | low | UX-038 |
| `jrn:J-34` | confirmed | low | UX-045 |
| `jrn:J-35` | confirmed | medium | UX-107 |
| `jrn:J-36` | refuted | low | Appendix A.1 (refuted) |
| `jrn:M-1` | verifier-found | critical | UX-001 |
| `jrn:M-2` | verifier-found | high | UX-007 |
| `jrn:M-3` | verifier-found | medium | UX-013 |
| `jrn:M-4` | verifier-found | high | UX-004 |
| `jrn:M-5` | verifier-found | medium | UX-028 |
| `jrn:M-6` | verifier-found | medium | UX-019 |
| `jrn:M-7` | verifier-found | low | UX-037 |
| `jrn:M-8` | verifier-found | low | UX-077 |
| `hot:H-01` | adjusted | high | UX-033 |
| `hot:H-02` | confirmed | critical | UX-002 |
| `hot:H-03` | adjusted | high | UX-018 |
| `hot:H-04` | adjusted | high | UX-004, UX-005 (rel) |
| `hot:H-05` | confirmed | high | UX-011 |
| `hot:H-06` | confirmed | high | UX-017 |
| `hot:H-07` | adjusted | high | UX-016 |
| `hot:H-08` | adjusted | high | UX-034 |
| `hot:H-09` | adjusted | medium | UX-035, UX-036 (rel) |
| `hot:H-10` | adjusted | critical | UX-001, UX-014 (rel) |
| `hot:H-11` | confirmed | high | UX-015 |
| `hot:H-12` | confirmed | medium | UX-077 |
| `hot:H-13` | adjusted | medium | UX-037, UX-036 (rel) |
| `hot:H-14` | confirmed | medium | UX-021 |
| `hot:H-15` | confirmed | medium | UX-054 |
| `hot:H-16` | confirmed | medium | UX-022, UX-033 (rel) |
| `hot:H-17` | confirmed | medium | UX-039 |
| `hot:H-18` | adjusted | medium | UX-008 |
| `hot:H-19` | confirmed | medium | UX-038 |
| `hot:H-20` | adjusted | medium | UX-020 |
| `hot:H-21` | confirmed | medium | UX-005 |
| `hot:H-22` | confirmed | medium | UX-041, UX-019 (rel) |
| `hot:H-23` | adjusted | high | UX-048 |
| `hot:H-24` | adjusted | low | UX-058 |
| `hot:H-25` | confirmed | low | UX-086, UX-069 (rel) |
| `hot:H-26` | adjusted | low | UX-107, UX-109 (rel) |
| `hot:M-1` | verifier-found | high | UX-004 |
| `hot:M-2` | verifier-found | high | UX-002 |
| `hot:M-3` | verifier-found | high | UX-001 |
| `hot:M-4` | verifier-found | medium | UX-008 |
| `hot:M-5` | verifier-found | medium | UX-003 |
| `hot:M-6` | verifier-found | low | UX-020 |
| `hot:M-7` | verifier-found | low | UX-036, UX-035 (rel) |
| `hot:M-8` | verifier-found | low | UX-064, UX-048 (rel) |
| `vis:VIS-01` | adjusted | high | UX-048 |
| `vis:VIS-02` | adjusted | high | UX-050 |
| `vis:VIS-03` | adjusted | high | UX-049, UX-079 (rel) |
| `vis:VIS-04` | confirmed | high | UX-051 |
| `vis:VIS-05` | adjusted | high | UX-052 |
| `vis:VIS-06` | confirmed | high | UX-054 |
| `vis:VIS-07` | adjusted | medium | UX-056 |
| `vis:VIS-08` | adjusted | medium | UX-060 |
| `vis:VIS-09` | confirmed | high | UX-034 |
| `vis:VIS-10` | adjusted | medium | UX-037 |
| `vis:VIS-11` | confirmed | high | UX-044 |
| `vis:VIS-12` | confirmed | high | UX-053 |
| `vis:VIS-13` | adjusted | medium | UX-055 |
| `vis:VIS-14` | confirmed | medium | UX-058 |
| `vis:VIS-15` | confirmed | medium | UX-059 |
| `vis:VIS-16` | confirmed | medium | UX-041 |
| `vis:VIS-17` | confirmed | medium | UX-044, UX-046 (rel), UX-081 (rel) |
| `vis:VIS-18` | confirmed | medium | UX-042 |
| `vis:VIS-19` | confirmed | medium | UX-063 |
| `vis:VIS-20` | confirmed | medium | UX-043 |
| `vis:VIS-21` | confirmed | medium | UX-062 |
| `vis:VIS-22` | confirmed | medium | UX-057 |
| `vis:VIS-23` | confirmed | medium | UX-061 |
| `vis:VIS-24` | adjusted | low | UX-065 |
| `vis:VIS-25` | adjusted | low | UX-065 |
| `vis:VIS-26` | confirmed | medium | UX-045 |
| `vis:VIS-27` | confirmed | medium | UX-045 |
| `vis:VIS-28` | confirmed | medium | UX-051 |
| `vis:VIS-29` | confirmed | medium | UX-070 |
| `vis:VIS-30` | confirmed | low | UX-108 |
| `vis:VIS-31` | confirmed | low | UX-059 |
| `vis:VIS-32` | confirmed | low | UX-028, UX-084 (rel) |
| `vis:VIS-33` | confirmed | low | UX-079 |
| `vis:VIS-34` | confirmed | low | UX-041 |
| `vis:M1` | verifier-found | high | UX-071 |
| `vis:M2` | verifier-found | medium | UX-108 |
| `vis:M3` | verifier-found | medium | UX-077 |
| `vis:M4` | verifier-found | medium | UX-072 |
| `vis:M5` | verifier-found | low | UX-064 |
| `vis:M6` | verifier-found | low | UX-079 |
| `vis:M7` | verifier-found | low | UX-034 |
| `vis:M8` | verifier-found | low | UX-049, UX-107 (rel) |
| `feat:F-01` | adjusted | high | UX-018, UX-014 (rel) |
| `feat:F-02` | confirmed | high | UX-033 |
| `feat:F-03` | adjusted | high | UX-016, UX-022 (rel) |
| `feat:F-04` | confirmed | high | UX-042, UX-017 (rel), UX-034 (rel) |
| `feat:F-05` | confirmed | high | UX-006 |
| `feat:F-06` | adjusted | medium | UX-007, UX-013 (rel) |
| `feat:F-07` | confirmed | high | UX-043, UX-054 (rel) |
| `feat:F-08` | confirmed | high | UX-002 |
| `feat:F-09` | adjusted | medium | UX-021 |
| `feat:F-10` | confirmed | medium | UX-005 |
| `feat:F-11` | adjusted | low | UX-085 |
| `feat:F-12` | confirmed | medium | UX-081 |
| `feat:F-13` | confirmed | medium | UX-069 |
| `feat:F-14` | adjusted | low | UX-037 |
| `feat:F-15` | adjusted | low | UX-079 |
| `feat:F-16` | confirmed | medium | UX-080, UX-028 (rel) |
| `feat:F-17` | confirmed | medium | UX-032, UX-009 (rel) |
| `feat:F-18` | confirmed | medium | UX-027 |
| `feat:F-19` | confirmed | medium | UX-093, UX-088 (rel) |
| `feat:F-20` | confirmed | medium | UX-097, UX-015 (rel), UX-096 (rel) |
| `feat:F-21` | confirmed | medium | UX-082 |
| `feat:F-22` | confirmed | medium | UX-009 |
| `feat:F-23` | confirmed | medium | UX-022, UX-033 (rel) |
| `feat:F-24` | confirmed | low | UX-029, UX-084 (rel), UX-101 (rel) |
| `feat:F-25` | confirmed | low | UX-061 |
| `feat:F-26` | adjusted | low | UX-107, UX-109 (rel) |
| `feat:M1` | verifier-found | high | UX-003 |
| `feat:M2` | verifier-found | medium | UX-014 |
| `feat:M3` | verifier-found | medium | UX-002 |
| `feat:M4` | verifier-found | medium | UX-048 |
| `feat:M5` | verifier-found | low | UX-077 |
| `feat:M6` | verifier-found | medium | UX-003, UX-077 (rel) |
| `feat:M7` | verifier-found | low | UX-092, UX-088 (rel) |
| `a11y:RA-01` | adjusted | high | UX-048, UX-049 (rel) |
| `a11y:RA-02` | adjusted | high | UX-018, UX-014 (rel) |
| `a11y:RA-03` | confirmed | high | UX-072 |
| `a11y:RA-04` | confirmed | high | UX-041 |
| `a11y:RA-05` | adjusted | high | UX-034 |
| `a11y:RA-06` | confirmed | high | UX-066, UX-053 (rel) |
| `a11y:RA-07` | confirmed | high | UX-042 |
| `a11y:RA-08` | confirmed | high | UX-067 |
| `a11y:RA-09` | confirmed | high | UX-068 |
| `a11y:RA-10` | confirmed | high | UX-069 |
| `a11y:RA-11` | confirmed | high | UX-070 |
| `a11y:RA-12` | confirmed | high | UX-051 |
| `a11y:RA-13` | confirmed | high | UX-019 |
| `a11y:RA-14` | confirmed | high | UX-016 |
| `a11y:RA-15` | confirmed | medium | UX-046 |
| `a11y:RA-16` | confirmed | medium | UX-045 |
| `a11y:RA-17` | confirmed | medium | UX-047 |
| `a11y:RA-18` | adjusted | medium | UX-073, UX-064 (rel) |
| `a11y:RA-19` | adjusted | medium | UX-075, UX-037 (rel) |
| `a11y:RA-20` | adjusted | medium | UX-056 |
| `a11y:RA-21` | adjusted | high | UX-002 |
| `a11y:RA-22` | adjusted | medium | UX-074 |
| `a11y:RA-23` | adjusted | medium | UX-057 |
| `a11y:RA-24` | confirmed | medium | UX-044 |
| `a11y:RA-25` | adjusted | medium | UX-026 |
| `a11y:RA-26` | confirmed | low | UX-076 |
| `a11y:RA-27` | confirmed | low | UX-064 |
| `a11y:RA-28` | confirmed | low | UX-107 |
| `a11y:RA-29` | confirmed | low | UX-108, UX-060 (rel) |
| `a11y:M1` | verifier-found | high | UX-003 |
| `a11y:M2` | verifier-found | medium | UX-005 |
| `a11y:M3` | verifier-found | medium | UX-077 |
| `a11y:M4` | verifier-found | medium | UX-068 |
| `a11y:M5` | verifier-found | medium | UX-046 |
| `a11y:M6` | verifier-found | low | UX-056 |
| `a11y:M7` | verifier-found | low | UX-066 |
| `a11y:M8` | verifier-found | low | UX-097, UX-005 (rel) |
| `cli:CLI-01` | confirmed | critical | UX-015 |
| `cli:CLI-02` | confirmed | critical | UX-094 |
| `cli:CLI-03` | adjusted | high | UX-088 |
| `cli:CLI-04` | confirmed | high | UX-095 |
| `cli:CLI-05` | confirmed | high | UX-096 |
| `cli:CLI-06` | adjusted | high | UX-097, UX-005 (rel) |
| `cli:CLI-07` | confirmed | high | UX-011 |
| `cli:CLI-08` | confirmed | high | UX-098 |
| `cli:CLI-09` | confirmed | high | UX-089 |
| `cli:CLI-10` | adjusted | medium | UX-012 |
| `cli:CLI-11` | confirmed | high | UX-009 |
| `cli:CLI-12` | adjusted | medium | UX-093 |
| `cli:CLI-13` | adjusted | high | UX-004, UX-008 (rel), UX-035 (rel) |
| `cli:CLI-14` | confirmed | medium | UX-099, UX-078 (rel) |
| `cli:CLI-15` | confirmed | medium | UX-100 |
| `cli:CLI-16` | confirmed | medium | UX-090 |
| `cli:CLI-17` | confirmed | medium | UX-091 |
| `cli:CLI-18` | adjusted | medium | UX-101 |
| `cli:CLI-19` | confirmed | medium | UX-102 |
| `cli:CLI-20` | confirmed | medium | UX-010 |
| `cli:CLI-21` | confirmed | medium | UX-103 |
| `cli:CLI-22` | confirmed | medium | UX-104 |
| `cli:CLI-23` | confirmed | low | UX-084 |
| `cli:CLI-24` | adjusted | low | UX-083 |
| `cli:CLI-25` | unverifiable | low | Appendix A.3 (unverifiable) |
| `cli:CLI-26` | confirmed | low | UX-109 |
| `cli:M1` | verifier-found | high | UX-004 |
| `cli:M2` | verifier-found | medium | UX-008 |
| `cli:M3` | verifier-found | medium | UX-098 |
| `cli:M4` | verifier-found | medium | UX-018 |
| `cli:M5` | verifier-found | low | UX-098 |
| `cli:M6` | verifier-found | low | UX-092 |
| `cli:M7` | verifier-found | low | UX-105 |
| `lweb:LW-01` | confirmed | critical | UX-001 |
| `lweb:LW-02` | confirmed | high | UX-034 |
| `lweb:LW-03` | confirmed | high | UX-048 |
| `lweb:LW-04` | confirmed | high | UX-050 |
| `lweb:LW-05` | confirmed | high | UX-002, UX-003 (rel) |
| `lweb:LW-07` | confirmed | high | UX-016 |
| `lweb:LW-08` | confirmed | medium | UX-077 |
| `lweb:LW-09` | adjusted | low | UX-037 |
| `lweb:LW-10` | adjusted | high | UX-043 |
| `lweb:LW-11` | confirmed | medium | UX-054 |
| `lweb:LW-12` | confirmed | medium | UX-021 |
| `lweb:LW-13` | adjusted | medium | UX-018 |
| `lweb:LW-14` | confirmed | medium | UX-019 |
| `lweb:LW-15` | confirmed | medium | UX-055, UX-041 (rel) |
| `lweb:LW-16` | confirmed | medium | UX-042 |
| `lweb:LW-17` | confirmed | medium | UX-020 |
| `lweb:LW-18` | confirmed | low | UX-058 |
| `lweb:LW-19` | confirmed | medium | UX-034 |
| `lweb:LW-20` | adjusted | low | UX-036 |
| `lweb:LW-21` | confirmed | low | UX-047 |
| `lweb:LW-22` | adjusted | low | UX-108 |
| `lweb:LW-23` | adjusted | medium | UX-032, UX-005 (rel) |
| `lweb:LW-24` | adjusted | medium | UX-032 |
| `lweb:LW-25` | confirmed | medium | UX-027, UX-026 (rel) |
| `lweb:LW-26` | confirmed | low | UX-028 |
| `lweb:LW-28` | confirmed | low | UX-044 |
| `lweb:LW-29` | confirmed | medium | UX-073 |
| `lweb:LW-30` | adjusted | low | UX-057 |
| `lweb:LW-32` | adjusted | low | UX-023 |
| `lweb:LW-33` | confirmed | medium | UX-040 |
| `lweb:LW-34` | adjusted | medium | UX-033 |
| `lweb:LW-36` | confirmed | medium | UX-029 |
| `lweb:M1` | verifier-found | high | UX-003 |
| `lweb:M2` | verifier-found | critical | UX-001 |
| `lweb:M3` | verifier-found | medium | UX-051 |
| `lweb:M4` | verifier-found | medium | UX-041, UX-107 (rel) |
| `lweb:M5` | verifier-found | low | UX-016, UX-021 (rel) |
| `lweb:M6` | verifier-found | low | UX-018 |
| `lweb:M7` | verifier-found | low | UX-021 |
| `lweb:M8` | verifier-found | low | UX-054 |
| `lcli:F-01` | adjusted | high | UX-087 |
| `lcli:F-02` | adjusted | high | UX-088 |
| `lcli:F-03` | adjusted | high | UX-089 |
| `lcli:F-04` | confirmed | high | UX-011 |
| `lcli:F-05` | adjusted | high | UX-004 |
| `lcli:F-06` | confirmed | high | UX-098 |
| `lcli:F-07` | confirmed | high | UX-089 |
| `lcli:F-08` | confirmed | high | UX-012 |
| `lcli:F-09` | confirmed | high | UX-009 |
| `lcli:F-10` | confirmed | high | UX-010 |
| `lcli:F-11` | confirmed | medium | UX-077 |
| `lcli:F-12` | confirmed | high | UX-095 |
| `lcli:F-13` | confirmed | high | UX-015 |
| `lcli:F-14` | confirmed | medium | UX-015 |
| `lcli:F-15` | adjusted | medium | UX-099 |
| `lcli:F-16` | adjusted | medium | UX-035, UX-033 (rel) |
| `lcli:F-17` | confirmed | medium | UX-092 |
| `lcli:F-18` | confirmed | medium | UX-103 |
| `lcli:F-19` | confirmed | high | UX-096 |
| `lcli:F-20` | refuted | low | Appendix A.1 (refuted) |
| `lcli:F-21` | adjusted | medium | UX-097, UX-005 (rel), UX-023 (rel) |
| `lcli:F-22` | confirmed | medium | UX-036 |
| `lcli:F-23` | confirmed | medium | UX-100 |
| `lcli:F-24` | confirmed | low | UX-090 |
| `lcli:F-25` | adjusted | medium | UX-101, UX-090 (rel) |
| `lcli:F-26` | adjusted | medium | UX-101 |
| `lcli:F-27` | confirmed | medium | UX-091 |
| `lcli:F-28` | adjusted | medium | UX-093 |
| `lcli:F-29` | confirmed | low | UX-102, UX-083 (rel) |
| `lcli:F-30` | confirmed | low | UX-099, UX-008 (rel), UX-078 (rel) |
| `lcli:F-31` | confirmed | low | UX-097 |
| `lcli:F-32` | confirmed | low | UX-109 |
| `lcli:M1` | verifier-found | high | UX-008 |
| `lcli:M2` | verifier-found | medium | UX-093, UX-009 (rel) |
| `lcli:M3` | verifier-found | medium | UX-092 |
| `lcli:M4` | verifier-found | medium | UX-097, UX-109 (rel) |
| `lcli:M5` | verifier-found | low | UX-106 |
| `lcli:M6` | verifier-found | low | UX-021 |
| `lcli:M7` | verifier-found | medium | UX-082 |
