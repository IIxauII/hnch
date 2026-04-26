# Plan: Must-Have Feature Gaps (g, a, h, m)

**Decided:** D1=A (role in Yjs doc), D2=B (full-screen consensus animation)

## Gaps

| # | Gap | Where | Complexity |
|---|-----|-------|-----------|
| g | Participant cap (20) | Relay + both | Low |
| a | Round title input on CLI | CLI | Low |
| h | Viewer/voter role switching | Both + schema | Medium |
| m | Consensus celebration (full-screen) | Both | Low-medium |

## Spec

### Participant Cap (g)

- Relay rejects WS upgrade when `record.connections >= MAX_ROOM_PARTICIPANTS` (20)
- Rejection: HTTP 403 pre-upgrade, close code 4006 (`room-full`)
- Mobile: toast "This room is full (max 20 participants)", navigate back
- CLI: stderr error, exit

### CLI Round Title (a)

- `[s]` Start Round and `[n]` Next Round prompt for optional title via TextInput
- Empty → undefined title (same as today)
- Non-empty → passed as `title` to `newRound()`
- Escape cancels prompt, no round started
- Re-vote `[v]` inherits title from parent (no prompt)

### Viewer/Voter Role (h)

- New field `role?: 'voter' | 'viewer'` on participant Y.Map (default `'voter'` when absent)
- `Participant` interface in doc.ts gets `role` field
- `participantRole()` helper: returns `p.role ?? 'voter'`
- Auto-reveal counts only online participants with `role !== 'viewer'`
- Guard: require at least 1 online voter with a vote (prevent vacuous auto-reveal)
- Viewers cannot cast votes (UI disables card grid)
- Mobile: toggle in estimating page for self
- CLI: `[w]` key toggles during voting
- ADR-0020 required

### Consensus Celebration (m)

- `isConsensus(round): boolean` — 2+ votes, all same value
- Mobile: full-screen animation overlay in VoteResultsComponent + haptic
- CLI: bold colored "Consensus! Everyone voted [X]" in results
- Edge: < 2 voters → no celebration

## Interfaces

```typescript
// shared/src/doc.ts
export interface Participant {
  displayName: string
  joinedAt: number
  role?: 'voter' | 'viewer'
}

// shared/src/doc-projection.ts
export function participantRole(p: Pick<Participant, 'role'>): 'voter' | 'viewer' {
  return p.role ?? 'voter'
}

export function isConsensus(round: Round): boolean {
  const values = Object.values(round.votes)
  if (values.length < 2) return false
  return values.every(v => v === values[0])
}

// shared/src/auth.ts
export const MAX_ROOM_PARTICIPANTS = 20
```

## Tasks

### Phase 1: ADR + Shared

- **T1**: Write ADR-0020 (participant roles) [shared-sonnet]
  - File: `adr/0020-participant-viewer-voter-role.md`
  - Blocked by: —

- **T2**: Add role field to Participant + projection helpers [shared-sonnet]
  - Files: `packages/shared/src/doc.ts`, `packages/shared/src/doc-projection.ts`, tests
  - Blocked by: T1

- **T3**: Add isConsensus() helper [shared-haiku]
  - Files: `packages/shared/src/doc-projection.ts`, tests
  - Blocked by: —

- **T4**: Export MAX_ROOM_PARTICIPANTS constant [shared-haiku]
  - Files: `packages/shared/src/auth.ts`, `packages/shared/src/index.ts`
  - Blocked by: —

### Phase 2: Relay

- **T5**: Enforce participant cap on WS upgrade [shared-sonnet]
  - Files: `packages/relay/src/server.ts`, tests
  - Blocked by: T4

### Phase 3: CLI

- **T6**: Add round title prompt to CLI [cli-sonnet]
  - Files: `packages/cli/src/ui/App.tsx`, `packages/cli/src/ui/Lobby.tsx`
  - Blocked by: —

- **T7**: Add viewer/voter toggle to CLI [cli-sonnet]
  - Files: `packages/cli/src/ui/Voting.tsx`, `packages/cli/src/ui/components/ParticipantList.tsx`, `packages/cli/src/session.ts`
  - Blocked by: T2

- **T8**: Add consensus celebration to CLI [cli-haiku]
  - Files: `packages/cli/src/ui/Lobby.tsx`
  - Blocked by: T3

- **T9**: Add room-full error handling to CLI [cli-haiku]
  - Files: `packages/cli/src/session.ts`, `packages/cli/src/index.ts`
  - Blocked by: T5

### Phase 4: Mobile

- **T10**: Add room-full handling to mobile [mobile-haiku]
  - Files: join page, rejection handling
  - Blocked by: T5

- **T11**: Add viewer/voter role toggle to mobile [mobile-sonnet]
  - Files: `packages/client/src/app/estimating/estimating.page.ts`, `packages/client/src/app/lobby/lobby.page.ts`, doc.service.ts
  - Blocked by: T2

- **T12**: Add consensus celebration to mobile (full-screen animation) [mobile-sonnet]
  - Files: `packages/client/src/app/shared/vote-results.component.ts`
  - Blocked by: T3

### Phase 5: Docs

- **T13**: Update schema.md with role field [shared-haiku]
  - Files: `schema.md`
  - Blocked by: T2

- **T14**: Update ux.md consensus entry [shared-haiku]
  - Files: `ux.md`
  - Blocked by: T12

## Team

- shared-sonnet: T1, T2, T5
- shared-haiku: T3, T4, T13, T14
- cli-sonnet: T6, T7
- cli-haiku: T8, T9
- mobile-sonnet: T11, T12
- mobile-haiku: T10
- reviewer: phase reviews
