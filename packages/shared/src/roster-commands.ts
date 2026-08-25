/**
 * Roster commands (writer side) — the single seam both client and CLI call to
 * change who is in a session, what they are called, and who is in charge.
 *
 * Built exactly like `round-commands` and `vote-commands`: take the doc, apply
 * the gate, stamp the injectable clock (default `Date.now`), delegate to the
 * low-level `doc-projection` writer, return a typed result. Nothing throws —
 * a non-host mis-tapping "End session" is a refusal, not an exception (#507).
 *
 * **Where the authority gates are, and why.** `kick`, `handoffHost` and
 * `endSession` verify the acting participant is the current host. The first
 * two had that rule spelled twice and differently — the CLI threw, the client
 * gated in the page and its service did not check at all. `endSession` is
 * included despite existing in only one place because it is the most
 * destructive act in the app and the mobile side had no gate whatsoever; the
 * shared gate sits *underneath* ADR-0023's UI gate rather than replacing it.
 * `rename`, `recolor`, `toggleRole` and `leave` act on the caller's own
 * record and need no authority.
 *
 * **Handing off and electing are two different acts.** `handoffHost` is a
 * host delegating: it needs authority, and it needs the target to be online,
 * because handing the room to someone who cannot act on it strands it.
 * `promoteHost` is a leaderless room repairing itself: the ADR-0048 election
 * has already picked a winner from the eligible peer set, and there is by
 * definition no current host to authorise the write. Naming them apart is
 * what lets the gate exist on one and not the other, while keeping every host
 * write behind this one module — which is also why `patchSettings`' public
 * parameter type excludes `hostParticipantId` (see `PublicSettingsPatch`).
 *
 * **Awareness is the caller's to supply.** Online-ness lives in Yjs
 * awareness, not in the doc, so `handoffHost` takes the set of online
 * participant ids as plain data. That keeps the rule testable without a
 * provider and keeps `Awareness` out of this seam. `kick` takes no such
 * parameter — removing an offline peer is the whole point of the affordance.
 */

import type * as Y from 'yjs';

import { participantRole, type Participant } from './doc.js';
import {
  clearLeftStatus,
  endSessionForEveryone,
  leaveSession,
  patchSettingsInternal,
  projectDoc,
  removeParticipant,
  setAvatarColor,
  upsertParticipant,
  type ParticipantSnapshot,
} from './doc-projection.js';

/**
 * The outcome of a roster command. `at` is optional because only the commands
 * that persist a timestamp carry one: `leave` and `kick` (`leftAt`) and
 * `endSession` (`sessionEndedAt`). Rename, recolor, role-toggle and the two
 * host writes stamp nothing, and inventing a clock call for them would be
 * dishonest.
 *
 * Refusal reasons, and which commands can return them:
 *  - `'not-found'`   — the participant id has no record (`rename`,
 *                      `recolor`, `toggleRole`, `leave`, `kick`,
 *                      `handoffHost`).
 *  - `'not-host'`    — the acting participant does not currently hold host
 *                      authority (`kick`, `handoffHost`, `endSession`).
 *  - `'not-online'`  — the handoff target is absent from the supplied online
 *                      set (`handoffHost`).
 *  - `'self-target'` — a host tried to remove themselves through the kick
 *                      path; `leave` is the route, so the room gets a proper
 *                      election (`kick`).
 */
export type RosterResult =
  | { applied: true; at?: number }
  | { applied: false; reason: 'not-found' | 'not-host' | 'not-online' | 'self-target' };

/** Injectable clock — defaults to `Date.now`; tests pass a deterministic stub. */
type Clock = () => number;

/** The participant record for `id`, or `undefined` when there is none. */
function findParticipant(doc: Y.Doc, id: string): ParticipantSnapshot | undefined {
  return projectDoc(doc).participants.find((p) => p.id === id);
}

/**
 * One projection for the commands that need to read both the host field and
 * a participant record. `projectDoc` walks the whole doc, so the gated
 * commands take a single snapshot and answer both questions from it rather
 * than projecting once per question.
 */
function readRoster(
  doc: Y.Doc,
  actorId: string,
  targetId: string,
): { isHost: boolean; target: ParticipantSnapshot | undefined } {
  const projection = projectDoc(doc);
  return {
    isHost: projection.settings.hostParticipantId === actorId,
    target: projection.participants.find((p) => p.id === targetId),
  };
}

/** `true` when `actorId` currently holds host authority. */
function isHost(doc: Y.Doc, actorId: string): boolean {
  return projectDoc(doc).settings.hostParticipantId === actorId;
}

/**
 * Rebuild a full participant record from a snapshot, overriding `patch`.
 *
 * `upsertParticipant` treats `role` and `avatarColor` as partial-update
 * fields, so this read-modify-write is belt *and* braces — but it keeps the
 * three call sites that used to spell it out down to one, and it is what
 * makes "renaming preserves my role and my colour" a property of this module
 * rather than of the writer's `undefined` handling.
 */
function withParticipantFields(
  existing: ParticipantSnapshot,
  patch: Partial<Pick<Participant, 'displayName' | 'role'>>,
): Participant {
  const role = patch.role ?? existing.role;
  return {
    displayName: patch.displayName ?? existing.displayName,
    joinedAt: existing.joinedAt,
    ...(role !== undefined && { role }),
    ...(existing.avatarColor !== undefined && { avatarColor: existing.avatarColor }),
  };
}

/**
 * Change `participantId`'s display name, preserving role, avatar colour and
 * `joinedAt`. Refuses with `'not-found'` when there is no such record.
 * Persists no timestamp.
 */
export function rename(doc: Y.Doc, participantId: string, displayName: string): RosterResult {
  const existing = findParticipant(doc, participantId);
  if (!existing) return { applied: false, reason: 'not-found' };

  upsertParticipant(doc, participantId, withParticipantFields(existing, { displayName }));
  return { applied: true };
}

/**
 * Set `participantId`'s avatar colour (ADR-0043). `color` is the validated
 * wire value (`AccentKey` or `#rrggbb`) — sanitize with `parseAvatarColor`
 * before calling. Refuses with `'not-found'`; persists no timestamp.
 */
export function recolor(doc: Y.Doc, participantId: string, color: string): RosterResult {
  if (!findParticipant(doc, participantId)) return { applied: false, reason: 'not-found' };

  setAvatarColor(doc, participantId, color);
  return { applied: true };
}

/**
 * Flip `participantId` between `'voter'` and `'viewer'` (ADR-0020),
 * preserving every other field. Refuses with `'not-found'`; persists no
 * timestamp.
 */
export function toggleRole(doc: Y.Doc, participantId: string): RosterResult {
  const existing = findParticipant(doc, participantId);
  if (!existing) return { applied: false, reason: 'not-found' };

  const next = participantRole(existing) === 'voter' ? 'viewer' : 'voter';
  upsertParticipant(doc, participantId, withParticipantFields(existing, { role: next }));
  return { applied: true };
}

/**
 * Deliberate departure: soft-delete `selfId`'s own record so the roster stops
 * counting them toward consensus (ADR-0036). Tab-close and network drop do
 * *not* come through here — those are awareness. Refuses with `'not-found'`;
 * stamps `leftAt` from the clock.
 */
export function leave(doc: Y.Doc, selfId: string, clock: Clock = Date.now): RosterResult {
  if (!findParticipant(doc, selfId)) return { applied: false, reason: 'not-found' };

  const at = clock();
  leaveSession(doc, selfId, at);
  return { applied: true, at };
}

/**
 * The inverse of {@link leave}: a participant who is back clears their own
 * `leftAt` / `removedBy` so the roster counts them again (ADR-0036 §6).
 *
 * Both surfaces call this from `connectToRelay`'s `onSynced` hook, and the
 * timing is the rule: run before the relay snapshot has applied and the
 * snapshot's `leftAt` simply lands on top. Refuses with `'not-found'`;
 * `applied: true` covers "was already active", which is the same outcome.
 */
export function rejoin(doc: Y.Doc, selfId: string): RosterResult {
  if (!findParticipant(doc, selfId)) return { applied: false, reason: 'not-found' };

  clearLeftStatus(doc, selfId);
  return { applied: true };
}

/**
 * Host removal of another participant (ADR-0036). Refuses with `'not-host'`
 * when `hostId` does not hold authority, `'self-target'` when a host aims the
 * kick at themselves — `leave` is that route, and it is the one that triggers
 * a proper election — and `'not-found'` when the target has no record. Stamps
 * `leftAt` from the clock.
 */
export function kick(
  doc: Y.Doc,
  hostId: string,
  targetId: string,
  clock: Clock = Date.now,
): RosterResult {
  const roster = readRoster(doc, hostId, targetId);
  if (!roster.isHost) return { applied: false, reason: 'not-host' };
  if (targetId === hostId) return { applied: false, reason: 'self-target' };
  if (!roster.target) return { applied: false, reason: 'not-found' };

  const at = clock();
  removeParticipant(doc, hostId, targetId, at);
  return { applied: true, at };
}

/**
 * Hand host authority to `targetId`. Refuses with `'not-host'` when
 * `actorId` is not the current host, `'not-found'` when the target has no
 * participant record, and `'not-online'` when the target is absent from
 * `onlineIds` — a room handed to someone who cannot act on it is stranded.
 * Persists no timestamp.
 */
export function handoffHost(
  doc: Y.Doc,
  actorId: string,
  targetId: string,
  onlineIds: ReadonlySet<string>,
): RosterResult {
  const roster = readRoster(doc, actorId, targetId);
  if (!roster.isHost) return { applied: false, reason: 'not-host' };
  if (!roster.target) return { applied: false, reason: 'not-found' };
  if (!onlineIds.has(targetId)) return { applied: false, reason: 'not-online' };

  patchSettingsInternal(doc, { hostParticipantId: targetId });
  return { applied: true };
}

/**
 * Install `winnerId` as host with **no authority check** — the seam the
 * ADR-0048 election adapter binds to in both surfaces. The condition it
 * exists for is precisely the one `handoffHost`'s gate would reject: the room
 * has no reachable host, so there is nobody to authorise the write. The
 * election has already restricted `winnerId` to the eligible peer set, which
 * is why there is no existence check either.
 *
 * Always returns `{ applied: true }`; it is a `RosterResult` for one union
 * per module, not because it can refuse.
 */
export function promoteHost(doc: Y.Doc, winnerId: string): RosterResult {
  patchSettingsInternal(doc, { hostParticipantId: winnerId });
  return { applied: true };
}

/**
 * End the session for everyone by stamping `meta.sessionEndedAt`. Refuses
 * with `'not-host'` when `actorId` does not hold authority — the shared floor
 * under ADR-0023's UI gate, which the mobile client previously lacked
 * entirely. Idempotent: a second call from the host re-stamps harmlessly.
 */
export function endSession(doc: Y.Doc, actorId: string, clock: Clock = Date.now): RosterResult {
  if (!isHost(doc, actorId)) return { applied: false, reason: 'not-host' };

  const at = clock();
  endSessionForEveryone(doc, at);
  return { applied: true, at };
}
