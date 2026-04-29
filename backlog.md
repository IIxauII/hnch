# backlog.md — hnch working backlog

Curated list of bugs, technical-debt items, features, and improvements. Updated as the project evolves. Items are grouped by theme and roughly ordered within each group by impact. Cross-linked to ADRs and roadmap phases where relevant.

---

## 1. Bugs & correctness issues

### 1.1 `appVersion` drift — settings screen shows stale version

`environment.prod.ts` and `environment.ts` both hardcode `appVersion: '1.1.1'`, but `packages/client/package.json` is already at `1.2.0`. The Settings screen (`settings.page.ts:268`) surfaces this value directly to the user.

**Fix:** generate `src/environments/version.ts` from `package.json` at build time via an `angular.json` pre-build script or a tiny `scripts/generate-version.ts` generator, then import the generated constant into both environment files. Remove the hand-bumped literal so the version never drifts again.

---

### 1.2 ADR citation typo — `auth.ts:57` cites ADR-0020 instead of ADR-0024

`packages/shared/src/auth.ts:57` JSDoc on `JoinRejectionReason.roomFull` says "ADR-0020" when the participant-cap decision lives in ADR-0024. ADR-0020 is the viewer/voter role decision and is unrelated.

**Fix:** change the one-line comment to `ADR-0024`.

---

### 1.3 ADR-0016 close-code table missing close-code 4006

ADR-0016 (`adr/0016-client-relay-connection-handshake.md`) defines the authoritative close-code table for codes 4001–4005 but does not mention 4006 (`room-full`), which was added later by ADR-0024.

**Fix:** append a row for 4006 to ADR-0016's close-code table with a cross-reference to ADR-0024.

---

## 2. Technical debt & polish

### 2.1 Accept proposed ADRs that are already implemented

ADRs 0021–0030 have status `Proposed` even though their corresponding code shipped. Keeping them "Proposed" indefinitely makes the ADR index misleading. Each one should be reviewed and either:

- Flipped to `Accepted` (if the implementation matches the decision), or
- Updated with implementation-time corrections and then accepted.

Candidates in rough order of confidence:

| ADR | Subject | Confidence code is shipped |
|-----|---------|---------------------------|
| 0021 | CLI package | High — `packages/cli` fully implemented |
| 0022 | Last-session cache | High — `cli/src/last-session.ts` implements 0600 mode, 24h TTL |
| 0023 | Session-end broadcast | High — `session-end.service.ts` + `session-end-observer.ts` both implemented |
| 0024 | Participant cap | High — relay enforces cap at WS upgrade |
| 0025 | Reconnect/backoff | High — sync-provider has reconnect logic |
| 0026 | Deep-link URL format | High — `/join?code=` implemented |
| 0027 | Test-only relay surfaces | High — `DELETE /test/rooms/:uuid` implemented |
| 0028 | Telemetry posture | High — no telemetry, posture is "none" |
| 0029 | Relay deployment | High — Caddy + systemd infra shipped |
| 0030 | Canonical origin hnch.dev | High — single-origin confirmed in ADR-0029 |

---

### 2.2 Reconnect UX — "Reconnecting…" banner not yet designed or built

`ux.md §8` flags the reconnecting-banner as an open question. The y-websocket provider already emits connect/disconnect lifecycle events, but the UI has no visual feedback during a momentary network blip. Users currently see no indicator that the app is trying to reconnect.

**Suggested approach:** show a slim non-blocking banner ("Reconnecting…") fixed to the top of Lobby and Estimating screens while the sync provider is in the `connecting` state (not the initial connect, only after a drop). Dismiss automatically on reconnect. This resolves the open UX question and closes an ADR-0025 action item about wiring the reconnect state into the UI.

---

### 2.3 Host-election transition state — no UI during 5-second debounce

`ux.md §8` and ADR-0010 describe a 5-second debounce before the lowest-peer-ID client promotes itself to host. During those 5 seconds, participants have no host. The UI currently shows no feedback.

**Suggested approach:** show a status chip or inline message ("Waiting for a new host…") in the Lobby participant list area during the debounce window. Dismiss immediately when `settings.hostParticipantId` changes. Prevents user confusion when the host drops mid-session.

---

### 2.4 Add regression test for sync-provider `online`-reset path

ADR-0025 §5 notes that the reconnect logic resets the backoff timer when the browser fires the `online` event. There is currently no test that exercises this path: the sync provider's `online` listener calls `provider.connect()`, but no unit/integration test verifies the timer is reset and a new connection is attempted.

**Fix:** add a test to `sync-provider.test.ts` (or a new `sync-provider.reconnect.test.ts`) that simulates the `online` event on a disconnected provider and asserts that a reconnect attempt fires.

---

### 2.5 `normalizeRoomCode` — internal whitespace not stripped

`normalizeRoomCode` (via `.trim()`) strips leading/trailing whitespace, and the test at `room-code.test.ts:75` explicitly locks in that interior spaces are preserved (e.g., `'k7p 9mr'` → `'K7P 9MR'`). This means a user pasting a code with an embedded space (e.g., a broken copy-paste across a line break) silently passes normalization but then fails `isValidRoomCode`.

**Consider:** decide whether the intended behaviour is intentional (interior spaces are user error, not silently fixed) or whether a `.replace(/\s+/g, '')` is preferable. Update the test and ADR-0026 §2 to document the decision explicitly either way.

---

## 3. Phase 6b — Native iOS build

This is the next major roadmap phase (see `roadmap.md §9`). Blocking items that must be resolved before the v1 candidate tag:

### 3.1 Bootstrap the Capacitor iOS project

`npx cap add ios` has not been run yet. This must happen before any native-specific work below can be tested on device.

**Work:** run `npx cap add ios` in `packages/client`, commit the generated `ios/` directory, resolve any plugin version conflicts, and verify a clean Xcode build.

---

### 3.2 Universal links (AASA + App Links manifest)

Users tapping an `https://hnch.dev/join?code=XXXXXX` link on iOS should open the app directly. This requires:

1. Apple App Site Association (AASA) file at `https://hnch.dev/.well-known/apple-app-site-association`.
2. `Associated Domains` entitlement in Xcode (`applinks:hnch.dev`).
3. `App.addListener('appUrlOpen', ...)` handler in the Angular app to parse the URL and navigate to `/join?code=`.

The client-side `/join?code=` route is already implemented (Phase 5). This step wires OS-level interception.

---

### 3.3 Capawesome SQLite persistence on native

ADR-0004 specifies Capawesome SQLite on native and IndexedDB on PWA. The PWA path uses IndexedDB today. The native path needs the SQLite provider wired in when `Capacitor.isNativePlatform()` is true.

**Work:** add `@capacitor-community/sqlite` (or the Capawesome variant pinned in the ADR) as a dependency, create a native persistence adapter that matches the IndexedDB adapter's interface in the doc service, and verify that Y.Doc state survives app restarts on device.

---

### 3.4 NSCameraUsageDescription in Info.plist

QR scanning via `@capacitor-mlkit/barcode-scanning` requires camera permission. Without `NSCameraUsageDescription` in `ios/App/App/Info.plist`, the app crashes on iOS when the QR scanner is opened.

**Fix:** add the key with a user-facing string explaining why the camera is needed (e.g., "hnch uses the camera to scan QR codes for joining sessions").

---

### 3.5 On-device smoke test

Before tagging a v1 candidate, run the full happy path on a physical iPhone:

- Fresh install → onboarding → create room → share invite → second device joins → vote → reveal → re-vote → next round → leave → jump-back-in banner → rejoin.

Also verify: haptics fire at the right moments, safe-area insets are correct, keyboard does not cover inputs, dark mode toggles correctly, and the QR scanner opens and dismisses cleanly.

---

## 4. Features & enhancements

### 4.1 Clipboard markdown export of round history

ADR-0013 §7 action items list "export formats beyond clipboard markdown dump" as a post-v1 stretch, but the clipboard markdown dump itself is listed as a v1 item that has never been implemented. Round history is available in the doc (`rounds` Y.Array with `parentRoundId` lineage); the missing piece is a "Copy results" button on the Lobby results section that formats the results as a markdown table and writes it to the clipboard.

**Suggested format:**
```
## Session — [room name]
| Round | Story | Votes | Result |
|-------|-------|-------|--------|
| 1     | Login page | 3, 3, 5, 3 | 3 |
| 2     | Login page (re-vote) | 3, 3, 3, 3 | 3 🎉 |
```

---

### 4.2 Consensus indicator in Lobby results

`ux.md §8` defers this to post-v1 but the architecture is ready today. When all cast votes in a revealed round are equal, show a celebratory state: distinct icon/colour treatment on the results section, a "Consensus!" banner, and a distinct haptic (using the haptic service already wired in Phase 6a).

**Scope:** purely a display-layer addition — no schema change needed, no new ADR. Consensus is computed from the already-projected round results.

---

### 4.3 Re-vote breadcrumb in Lobby results

`ux.md §8` notes that `parentRoundId` is stored but not surfaced in the UI. When viewing results for a re-voted round (Round N with a non-null `parentRoundId`), show a subtitle like "Re-vote of Round 1" to help teams track how many attempts it took to reach consensus.

**Scope:** read-only display change. Walk the `parentRoundId` chain to count attempts; show "Attempt N" or "Re-vote of Round M".

---

### 4.4 Password-hint in invite URL

`ux.md §8` asks: should invite URLs for password-protected rooms include a hint that a password is required? Currently, joining via a deep link into a password-protected room involves a round-trip: the client fetches the room, discovers it is password-protected, then shows the password field.

**Proposed:** append `?code=XXXXXX&protected=1` (or similar) to the invite URL so the Join screen can pre-show the password field without a round-trip. This interacts with ADR-0009's opaque-token model — a full decision needs an ADR amendment before implementing.

---

### 4.5 CLI: `hnch config` command for relay URL preference

The relay URL is currently set via environment variable or defaults to `https://hnch.dev`. Power users running a self-hosted relay have to set `HNCH_RELAY_URL` manually on every shell session. A `hnch config set relayUrl <url>` subcommand writing to `~/.config/hnch/config.json` would make this persistent.

`packages/cli/src/config.ts` already handles the config directory path — this is an additive command.

---

### 4.6 TestFlight distribution for the iOS build

Once the Capacitor iOS project exists (3.1 above), set up TestFlight distribution so the native build can be shared with testers without requiring a physical cable.

**Work:** configure `fastlane` or the GitHub Actions `ios-deploy` action, create an App Store Connect app record, and add a `deploy-ios.yml` workflow triggered on `ios-v*` tags (matching the pattern of `deploy-relay.yml` and `deploy-client.yml`).

---

## 5. Developer experience & CI

### 5.1 Auto-sync `appVersion` at build time

See bug 1.1. The fix belongs here too: once a build-time generator exists, remove the hand-bumped literal from both environment files so version drift cannot recur.

**Suggested implementation:** `scripts/generate-version.ts` that reads `packages/client/package.json` and writes `src/environments/version.ts`; called from the `prebuild` npm script.

---

### 5.2 CLI e2e test harness (node-pty + vitest)

Commit `9747590` (docs: "CLI e2e harness via node-pty + vitest") documents the plan for a terminal-level e2e harness that exercises `hnch create`, `hnch join`, and `hnch resume` against a live relay. This was planned but the harness has not been implemented yet.

**Value:** currently CLI behaviour is only unit-tested; no test covers the full create→join→vote→reveal flow from the terminal. Parity with the Playwright e2e suite for the mobile client.

---

### 5.3 Accessibility regression tests

`angular.md` sets a WCAG AA baseline and Phase 6a included a manual a11y sweep, but no automated tests enforce the baseline. Adding `axe-core` to the Playwright suite (via `@axe-core/playwright`) would catch regressions before they reach main.

**Suggested scope:** run an axe audit on the Home, Lobby, Estimating, Join, and Settings pages in the existing e2e fixtures; fail on WCAG AA violations.

---

### 5.4 Stale Proposed ADRs block discoverability

Nine ADRs sitting at "Proposed" for shipped code makes the ADR index harder to read and makes it unclear which decisions are settled. In addition to accepting them (item 2.1), consider adding an `adr-status-check` CI script that warns if any non-template ADR has been in `Proposed` state for more than 30 days without a linked PR.

---

### 5.5 `prebuild` step to validate environment configs

Both `environment.ts` and `environment.prod.ts` are manually maintained. A short Zod-style schema check run as a `prestart`/`prebuild` step would catch mismatches (missing keys, wrong types) before the Angular compiler sees them. Low effort, high value.

---

## 6. Out-of-scope for v1 (tracked for post-v1)

These are deliberately excluded from v1 per `roadmap.md §11` but worth keeping in the backlog so they are not forgotten:

- **iPad / landscape layouts** — PWA stretches acceptably; a dedicated iPad layout is post-v1.
- **Android native** — PWA covers Android; a native Android build with Material You theming is post-v1.
- **Team UI** — ADR-0007 architecture is in place; no UI planned for v1.
- **Jira / Linear integrations** — story-point writing back to trackers; post-v1.
- **Account sign-in / cross-device identity** — device-scoped identity (ADR-0005) is the v1 model.
- **Session history / analytics** — beyond the Jump-back-in banner; post-v1.
- **Liquid Glass / iOS 26 theming** — `@rdlabo/ionic-theme-ios26` deferred pending package stabilisation (`ux.md §7`).
- **Export formats beyond clipboard markdown** — CSV/PDF/JSON export; post-v1.
