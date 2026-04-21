# Phase 1 — Foundation (implementation plan)

Working document for the first implementation phase of hnch. Mirrors [`roadmap.md` §3](../roadmap.md#3-phase-1--foundation) but expands the per-file / per-commit shape that the roadmap deliberately leaves unbaked.

- **Status:** Proposed, pending execution.
- **Previous phase:** n/a — this is the starting phase.
- **Next phase:** [Phase 2 — Local session loop](../roadmap.md#4-phase-2--local-session-loop).

Discard this file once Phase 1 ships and the exit bar is met; retain any decisions that turned out to be load-bearing either as ADRs (if structural) or as comments near the relevant code.

## 1. Scope recap

Plumbing only. No Yjs, no relay wiring, no device-ID plugin, no real session state. The exit bar is an app that boots, captures a display name on first launch, persists it, and lands on Home on subsequent launches.

Touches existing ADRs as a consumer only — no new ADRs expected unless implementation surfaces an ambiguity in [`schema.md`](../schema.md) or an existing decision.

## 2. Decisions settled for this phase

### 2.1 Standalone Angular bootstrap

The Ionic scaffold is NgModule-based (`IonicModule.forRoot()`, `AppModule`, declarations array, `standalone: false`). Phase 1 migrates to Angular 20 standalone components:

- `main.ts` uses `bootstrapApplication(AppComponent, { providers: [provideIonicAngular(), provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding())] })`.
- `AppModule`, `AppRoutingModule`, and the NgModule-style `HomePageModule` / `HomePageRoutingModule` are deleted.
- Every new page is authored as `@Component({ standalone: true, imports: [IonicModule, …] })`.
- The scaffolded `HomePage` is rewritten as a standalone component (placeholder content anyway).

Rationale: the codebase is tiny, the roadmap's wording already names `provideIonicAngular()`, and standalone is Angular 20's default direction. Doing it now avoids a second migration later.

### 2.2 Display name persistence

`@capacitor/preferences` is the storage layer. Device-ID identity ([ADR-0005](../adr/0005-device-identity-capacitor-device-plugin.md)) is a Phase 3 concern; Phase 1 only writes:

- `hnch.displayName` — user-entered string.
- `hnch.pendingJoinUrl` — set by the onboarding guard if a deep-link into `/join` is intercepted before a name is saved; cleared after resume.

## 3. Work items

### 3.1 `@hnch/shared` doc types (`packages/shared/src/doc.ts`)

Platform-neutral TypeScript mirror of [`schema.md`](../schema.md). No Yjs import — shared stays runtime-neutral; Yjs bindings live in the client.

Exports:

- `type RevealMode = 'manual' | 'timer'`
- `interface Scale { id: string; cards: string[] }`
- `interface Meta { roomUuid: string; createdAt: number; createdBy: string }`
- `interface Settings { name?: string; defaultScale: Scale; revealMode: RevealMode; timerDurationMs?: number; hostParticipantId: string }`
- `interface Participant { displayName: string; joinedAt: number }`
- `interface Round { id: string; title?: string; description?: string; ticketId?: string; parentRoundId?: string; scale: Scale; timerStartedAt?: number; revealedAt?: number; createdBy: string; createdAt: number; votes: Record<string, string> }`
- `interface AwarenessPayload { participantId: string }`
- `const FIBONACCI_SCALE: Scale`, `const TSHIRT_SCALE: Scale`, `const BUILTIN_SCALES: Record<string, Scale>`

Re-exported from `packages/shared/src/index.ts`. `votes` is typed as `Record<string, string>` at the shared level; the Y.Map binding in the client handles the runtime shape.

Test: `doc.test.ts` asserting the two builtin scales have the card faces documented in `schema.md`.

### 3.2 Route skeleton

Seven routes, lazy-loaded via `loadComponent`:

| Path | Component | Notes |
|---|---|---|
| `/onboarding` | `OnboardingPage` | First-run only per [`ux.md` §4.1](../ux.md#41-first-run-onboarding) |
| `/home` | `HomePage` | Rewrite scaffolded `home/` |
| `/join` | `JoinPage` | Placeholder only |
| `/lobby` | `LobbyPage` | Placeholder only |
| `/estimating` | `EstimatingPage` | Placeholder only |
| `/revealed` | `RevealedPage` | Placeholder only |
| `/settings` | `SettingsPage` | Placeholder only |
| `''` (redirect) | n/a | Guard decides `/onboarding` vs `/home` |
| `'**'` (wildcard) | n/a | Redirect to `/home` |

Each placeholder page uses the [`ux.md` §2](../ux.md#2-app-shell--navigation) shell: `ion-header` with large title, `ion-content`, `ion-footer` where primary-action placement calls for one. No interactive behavior beyond back navigation.

### 3.3 `DisplayNameService` + `displayNameGuard`

`packages/client/src/app/core/display-name.service.ts`:

- `async getDisplayName(): Promise<string | null>`
- `async setDisplayName(name: string): Promise<void>`
- `async getPendingJoinUrl(): Promise<string | null>`
- `async setPendingJoinUrl(url: string): Promise<void>`
- `async clearPendingJoinUrl(): Promise<void>`

`packages/client/src/app/core/display-name.guard.ts` — a functional `CanMatchFn`:

- If `hnch.displayName` exists: allow.
- Else if target is `/onboarding`: allow.
- Else: stash target (only if it looks like `/join?…`) into `pendingJoinUrl` and redirect to `/onboarding`.

Applied to `/home`, `/join`, `/lobby`, `/estimating`, `/revealed`, `/settings`. Not applied to `/onboarding`.

### 3.4 Onboarding page

- `ion-input` bound to a signal; Continue button disabled until trimmed value is non-empty.
- On Continue: `setDisplayName(trimmed)` → check `pendingJoinUrl` → if set, clear it and `navigateByUrl(url)`; else `navigateByUrl('/home')`.
- No large title (standalone first-run screen); primary action in `ion-footer` per [`ux.md` §2](../ux.md#2-app-shell--navigation) "Primary action placement".

### 3.5 Home page (rewrite)

Replaces the scaffolded Ionic "tabs" demo content:

- Large title "hnch".
- `ion-card` "Create Room" → logs `console.debug('create room — phase 2')` and no-ops.
- `ion-card` "Join Room" → `navigateByUrl('/join')`.
- `JumpBackInBanner` component rendered but hidden behind a condition that is never true in Phase 1. Exists so Phase 3 can wire its state source without adding new DOM.
- `ion-header` right-side ⋯ button → `ion-action-sheet` with "Settings" (→ `/settings`) and Cancel.

### 3.6 Dark mode

Import `@ionic/angular/css/palettes/dark.system.css` in `global.scss` (or `styles` array). Respects `prefers-color-scheme`. No explicit theme picker — that's Phase 6.

### 3.7 Dependencies + CI

- `pnpm add @capacitor/preferences --filter @hnch/client` (currently missing).
- `pnpm test` at root still fans out to `@hnch/shared`; keep green.
- `pnpm typecheck` across all three packages passes.
- Existing `room-code.test.ts` untouched.

## 4. Commit plan

Small, bisectable, green at each step:

1. **`Add @hnch/shared doc types mirroring schema.md`** — `doc.ts`, `doc.test.ts`, index re-export.
2. **`Migrate client to Angular standalone bootstrap`** — rewrite `main.ts`, delete `AppModule` / `AppRoutingModule` / `HomePageModule`, establish `app.routes.ts` with the seven routes and placeholder standalone page components. Tree compiles, `ng serve` boots to a placeholder.
3. **`Add display-name persistence and onboarding guard`** — `@capacitor/preferences` dep, `DisplayNameService`, functional `displayNameGuard`, wire guard into routes.
4. **`Implement Onboarding screen`** — name input + Continue button + pending-join-URL resume.
5. **`Rewrite Home launchpad`** — Create/Join cards, Settings ⋯ menu, hidden JumpBackInBanner shell.
6. **`Enable system dark mode palette`** — single-line stylesheet import.

Each commit ends with `pnpm typecheck && pnpm test` green.

## 5. Out of scope for Phase 1

Explicit non-goals so scope doesn't drift:

- Yjs doc or any real session state.
- Relay wiring (that is all Phase 3).
- Device-ID plugin and `participantId` derivation (Phase 3).
- `@capacitor/share`, QR generation, QR scanning, universal links (all Phase 5).
- Theme picker, haptics, a11y audit, native iOS build (all Phase 6).
- Karma/Cypress UI tests (per [`roadmap.md` §9](../roadmap.md#9-cross-cutting-concerns)).
- Any behavior on Join / Lobby / Estimating / Revealed / Settings beyond navigation placeholders.
- The Jump-back-in banner's actual wiring (it's present as hidden DOM only).

## 6. Exit bar

From [`roadmap.md` §3](../roadmap.md#3-phase-1--foundation), unmodified:

> `pnpm --filter @hnch/client start` boots, onboarding flow captures a name and persists it, relaunch skips onboarding and lands on Home.

Smoke-test recipe:

1. `pnpm install && pnpm --filter @hnch/client start`.
2. Open the dev server; expect Onboarding (no stored name).
3. Type a name, tap Continue; expect Home.
4. Reload the tab; expect Home (no Onboarding).
5. Clear site data; reload; expect Onboarding again.

## 7. Risks & fallbacks

- **Ionic standalone caveats.** `IonicModule` still imports a lot of declarations even in standalone mode; if a page needs a component Ionic ships only via a sub-module, import it directly. If we hit a wall, fall back to `@NgModule` for just that page — no global rollback.
- **Capacitor Preferences on web.** Works via `localStorage` on the web shim; no extra setup. If the shim behavior surprises, wrap writes in try/catch and log — do not block onboarding UX on storage failures.
- **`loadComponent` ergonomics.** If tree-shaking a standalone page pulls in Ionic CSS we expected to be global, handle per-page. Not expected to be a real risk at this size.

## 8. Follow-ups for Phase 2 (parking lot)

Surface here anything Phase 1 implementation reveals that Phase 2 should pick up:

- _(empty — update as implementation surfaces items.)_
