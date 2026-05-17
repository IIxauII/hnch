# Plan — Extend relay `/health` with operational metrics (#131)

## Context

Relay `/health` currently returns `{ status: 'ok' }` (liveness only). Operators can't see room/peer counts, uptime, or version without SSH + `journalctl`. Extending the response with aggregate counters lets `curl https://hnch.dev/health` answer "is anything happening?" and "what's deployed?" cheaply.

All new fields are dimensionless aggregates — no room UUIDs, codes, participant IDs, or session content — so the change stays content-blind (ADR-0001) and outside ADR-0028's user-telemetry scope. No new ADR needed (per ticket Dependencies note).

## Decisions (confirmed)

- **`version`** — include plain, read from `packages/relay/package.json` at module load.
- **`snapshots.estimatedBytes`** — skip. Defer to Prometheus later.
- **`HealthResponse` type** — live in `packages/shared` (relay already imports types from there).
- **`status: 'ok'`** — kept alongside new fields (additive; existing probes unaffected).

## Response shape

```ts
// packages/shared/src/health.ts (new file)
export interface HealthResponse {
  readonly status: 'ok';
  readonly version: string;          // packages/relay/package.json#version
  readonly uptime: number;            // seconds since process start, integer
  readonly rooms: {
    readonly active: number;          // rooms with connections > 0
    readonly snapshotted: number;     // rooms with connections === 0 (retained snapshot)
    readonly cap: number;             // ROOM_CAP (HNCH_ROOM_CAP override or MAX_ROOM_PARTICIPANTS)
  };
  readonly peers: {
    readonly connected: number;       // sum of connections across all rooms
  };
}
```

## Files to modify

### `packages/shared/src/health.ts` (new)
Define and export `HealthResponse` interface.

### `packages/shared/src/index.ts`
Re-export `HealthResponse` from `./health`.

### `packages/relay/src/server.ts`
- Add import: `import type { HealthResponse } from '@hnch/shared';`
- Replace inline `HealthPayload` interface (lines 42–45) — use `HealthResponse` instead.
- At module load: read relay version from `package.json` via `readFileSync` relative to `import.meta.url`. Path: `../package.json` (works for both `src/` and `dist/` layouts since `package.json` sits one level above either).
- Extend `/health` handler (lines 189–193):
  - Iterate `roomStore.listRooms()` once, count `active` / `snapshotted` / sum `connections`.
  - Build `HealthResponse`, `uptime = Math.floor(process.uptime())`, `rooms.cap = ROOM_CAP` (existing constant at line 90).
  - `sendJson(res, 200, payload)` unchanged.

**Pseudocode:**
```ts
const rooms = roomStore.listRooms();
let active = 0, snapshotted = 0, peers = 0;
for (const r of rooms) {
  if (r.connections > 0) { active++; peers += r.connections; }
  else { snapshotted++; }
}
const payload: HealthResponse = {
  status: 'ok',
  version: RELAY_VERSION,
  uptime: Math.floor(process.uptime()),
  rooms: { active, snapshotted, cap: ROOM_CAP },
  peers: { connected: peers },
};
```

### `packages/relay/src/server.test.ts`
Update existing `GET /health` block (lines 49–68):
- Existing "returns 200 with { status: 'ok' }" — extend assertion to verify full shape (status, version string, uptime number ≥ 0, rooms.{active,snapshotted,cap}, peers.connected, all numeric fields ≥ 0). Covers AC #1, #2.
- New: `version` matches `packages/relay/package.json#version` (AC #3).
- New: `peers.connected` and `rooms.active` increment on WS connect, decrement on disconnect — drive via test WS client into a real room (AC #4, #5).
- New: `rooms.snapshotted` reflects rooms whose connections dropped to 0 (AC #6).
- New: `HNCH_ROOM_CAP` override propagates to `rooms.cap` (AC #7). Note: `ROOM_CAP` is evaluated at module import — test via dynamic `await import('./server.js')` after setting `process.env.HNCH_ROOM_CAP` and `vi.resetModules()`.
- New: response key set is exactly the documented set — no extra keys leaking IDs (AC #8).

### `packages/e2e/tests/health.spec.ts` (new, optional smoke)
Single test: `GET ${RELAY_URL}/health` returns valid JSON, all fields present and numeric counters ≥ 0. Skip if e2e relay fixture doesn't already expose `RELAY_URL` cleanly.

## Reuse / existing utilities

- `roomStore.listRooms()` — already returns all `RoomRecord`s with `.connections` and `.lastEmptyAt`. No new room-store method needed.
- `ROOM_CAP` constant — `packages/relay/src/server.ts:90`, already reads `HNCH_ROOM_CAP`.
- `sendJson()` helper — `packages/relay/src/server.ts:459`, sets content-type + status.
- `process.uptime()` — Node built-in, integer seconds via `Math.floor()`.

## Out of scope (per ticket)

- Auth / rate limit on `/health`.
- Prometheus `/metrics` exporter.
- Per-room / per-participant metrics.
- Persistent metric history.
- Client-side consumption.

## Open flags

- **Version-read path under build output.** Need to confirm `dist/server.js` resolves `../package.json` correctly. If tsdown flattens output, may need `../../package.json` or a build-time inline. Verify during implementation by running `pnpm --filter @hnch/relay build && node dist/index.js`.
- **`rooms.cap` naming** — could be misread as "max number of rooms" rather than "per-room participant cap". Ticket AC explicitly names it `rooms.cap`, so kept. If feedback arises, rename to `rooms.participantCap` in a follow-up.

## Verification

1. **Unit:** `pnpm --filter @hnch/relay test` — new assertions for shape, counters, cap override.
2. **Manual local:**
   - `pnpm --filter @hnch/relay build && node packages/relay/dist/index.js`
   - `curl -s localhost:1234/health | jq` → verify all fields present, types correct.
   - Open browser to client dev server, join a room → re-curl, observe `peers.connected = 1`, `rooms.active = 1`.
   - Close browser → wait → re-curl, observe `peers.connected = 0`, `rooms.snapshotted = 1`.
3. **Cap override:** `HNCH_ROOM_CAP=5 node packages/relay/dist/index.js` → `curl /health | jq .rooms.cap` → `5`.
4. **Version:** `jq .version` matches `packages/relay/package.json#version`.
5. **No PII:** grep response for known room UUID / code from manual session → must not appear.
6. **e2e (if added):** `pnpm --filter @hnch/e2e test health.spec.ts`.

## Worktree

Single-PR scope, but still isolate per project convention. Before any edits:

```
git fetch origin
pnpm worktree:add health-metrics main
cd ../hnch-health-metrics
```

All implementation + tests happen in `../hnch-health-metrics`. `main` stays clean. Tear down with `pnpm worktree:remove health-metrics` after merge.

## Atomic commits

Split the PR into reviewable, individually-revertable commits in this order:

1. **`feat(shared): add HealthResponse type`**
   - `packages/shared/src/health.ts`
   - `packages/shared/src/index.ts` (re-export)
   - No relay change yet — type compiles standalone.

2. **`feat(relay): expose version + uptime on /health`**
   - Read `package.json` version at module load.
   - Add `version` + `uptime` to response.
   - Replace inline `HealthPayload` with `HealthResponse` import from shared.
   - Update one `/health` test for new fields.

3. **`feat(relay): expose room + peer counts on /health`**
   - Iterate `roomStore.listRooms()`, compute `rooms.{active,snapshotted,cap}` + `peers.connected`.
   - Add tests for connect/disconnect increment, snapshot transition, cap override (AC #4–#7).

4. **`test(relay): assert /health response shape has no PII (AC #8)`**
   - Single test asserting response key set is exactly the documented one.

5. **(optional) `test(e2e): smoke /health response shape`**
   - Only if e2e relay fixture already exposes `RELAY_URL` cleanly; skip otherwise.

Each commit passes `pnpm --filter @hnch/relay test` + typecheck independently. No squash on merge — preserve the sequence in `main` history.

## Persist plan in repo

Per project convention (memory: plans-in-repo), copy this plan into the worktree at:

```
docs/plans/health-metrics.md
```

Commit it as the first commit of the worktree (`docs(plans): add /health metrics implementation plan`) before any code.

## Commit / PR

- PR scope: `feat(relay,shared)` — both packages touched, additive type export from shared.
- PR title: `feat(relay,shared): extend /health with operational metrics`
- Closes #131.
