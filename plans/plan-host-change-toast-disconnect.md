# Plan — Enrich host-change toast with prior host name (issue #43)

## Context

Issue #43 ("Surface host-election debounce status to waiting participants") asked for an inline `"Electing a new host…"` status line during the 5-second host-election debounce window (ADR-0010). When the host disconnects, host-only controls (Reveal, Start Round) vanish for 5 seconds with no UI feedback, which feels like an app failure.

Approach pivoted: instead of surfacing the *transient* debounce state (which had timing AC conflicts — "appear within ~1s" vs. "never appear if drop is transient"), we **enrich the existing post-election toast** so participants learn what happened once it's resolved. The 5-second silence is accepted; the post-event message ("Alice disconnected. Bob is now the host.") closes the comprehension gap without inline UI, new components, or election-mechanic changes.

The issue's user-story intent is preserved — participants understand why host controls briefly disappeared. The original debounce-banner ACs are superseded by this revised approach; the issue body should be updated on close.

## Approach

Modify the existing host-change toast in `AppComponent` so the message includes the *previous* host's display name when the change is triggered by a host departure. Reuse the already-tracked `previousHostId` signal — only the toast formatter and the call site need to thread the prior ID through.

Existing toast paths:
- `"You are now the host"` (when `newHostId === myId`)
- `"{name} is now the host"` (otherwise)

Become:
- `"{prevName} disconnected. You are now the host."` (self-promotion after host drop)
- `"{prevName} disconnected. {newName} is now the host."` (other peer promoted after host drop)
- Keep `"You are now the host"` / `"{name} is now the host"` as fallbacks when there is no previous host (initial assignment) or the previous record can't be resolved.

The "disconnected" wording is a slight inaccuracy when the prior host was *kicked* or actively *left* — but in those flows the prior host already saw their own removal toast, and remaining participants still benefit from a clear "{prev} → {new}" transition message. Acceptable.

## Critical files

| File | Change |
| --- | --- |
| `packages/client/src/app/app.component.ts` | Pass prior `hostId` into `showHostChangeToast`; format message with both names. Existing `previousHostId` signal already tracks the value. |
| `packages/client/src/app/core/host-change-message.ts` *(new)* | Pure formatter `formatHostChangeMessage({ prevName, newName, isSelf })` returning the toast string. Easier to unit-test than the component. |
| `packages/client/src/app/core/host-change-message.spec.ts` *(new)* | Vitest specs (see Verification §1). |
| `packages/e2e/tests/host-election.spec.ts` | Extend the existing test to assert the enriched toast on the surviving player after host disconnect. Use `expectToast(player.page, /disconnected\. .* is now the host/i, { timeout: 15_000 })`. |

### Existing utilities to reuse

- `docService.participants()` — raw map including departed (already used by current toast for name lookup; resolves a host with `leftAt` set). `packages/client/src/app/core/doc/doc.service.ts:198`.
- `previousHostId` signal already in `AppComponent` at `app.component.ts:58`.
- `ToastService.info()` for non-blocking toast (already wired).
- `expectToast` helper in `packages/e2e/tests/fixtures/helpers.ts:10` for e2e assertion.
- `host.disconnect()` fixture in `packages/e2e/tests/fixtures/app.fixture.ts:339`.

### Edge cases handled

1. **Initial host assignment** — `previousHostId` is `null` on first observation; effect already seeds without toast (`app.component.ts:71-74`). No change.
2. **Self becomes host after drop** — `newHostId === myId` → `"{prevName} disconnected. You are now the host."`.
3. **Prior host record missing** (pre-projection race) — fall back to old `"X is now the host"` wording when `prevName` cannot be resolved.
4. **Prior host's `displayName` empty** — fall back to participant ID short-form (current behaviour).
5. **Initial host transition where `previousHostId` was `null`** — keep old wording (no "disconnected" prefix).
6. **Manual host transfer** (out of scope, ADR-0010 deferred Option C) — when added later, the same enriched format works; only the verb might want to change ("transferred" vs "disconnected").

### Out of scope

- The original inline `"Electing a new host…"` banner during debounce — superseded.
- Changing election mechanics, debounce duration, or the 5-second window (ADR-0010).
- Manual host handoff UI.
- Updating ADR-0010 — no architectural change. The open UX question in `ux.md` §8 should be marked resolved with a pointer to issue #43.

## Verification

1. **Unit test** the formatter (`host-change-message.spec.ts`):
   - prev=Alice, next=Bob, isSelf=false → `"Alice disconnected. Bob is now the host."`
   - prev=Alice, isSelf=true → `"Alice disconnected. You are now the host."`
   - prev=null, next=Alice, isSelf=false → `"Alice is now the host"` (initial)
   - prev=null, isSelf=true → `"You are now the host"` (initial)
   - prev resolved but name empty → fall back to short-form ID.

2. **E2E** in `packages/e2e/tests/host-election.spec.ts`:
   - Existing assertion still passes (player gains start-round button after 5s).
   - Add: `await expectToast(player.page, /disconnected\. .* is now the host/i, { timeout: 15_000 })` after `host.disconnect()` and before the start-round assertion.

3. **Manual smoke** — two browser tabs:
   - Tab A creates session, Tab B joins.
   - Close Tab A. Within ~6 s, Tab B shows toast `"Host disconnected. You are now the host."` and gains Start Round button.

4. **Type / lint / build / test**:
   ```
   pnpm --filter @hnch/client typecheck
   pnpm --filter @hnch/client lint
   pnpm --filter @hnch/client test
   pnpm --filter @hnch/e2e test -- host-election
   ```

## Workflow: worktree

Active in `/Users/xau/Documents/projects/hnch-host-toast-disconnect` on branch `host-toast-disconnect`. Ports: client 5100, relay 2134.

```sh
# already created via:
#   pnpm worktree:add host-toast-disconnect

# after merge:
cd /Users/xau/Documents/projects/hnch
pnpm worktree:remove host-toast-disconnect
git branch -D host-toast-disconnect
```

## Estimated scope

~15 LOC in `app.component.ts` + small `host-change-message.ts` helper + spec + one e2e assertion. Single commit, single PR. Conventional Commits scope: `client`.

## Followups

- Update `ux.md` §8 to mark the debounce-status question resolved, link to issue #43.
- Add a one-line note on issue #43 explaining the pivot before closing as completed.
