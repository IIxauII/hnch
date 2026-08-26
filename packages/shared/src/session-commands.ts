/**
 * Session commands — the whole UI-facing writer seam, bound once to a live
 * session and reached the same way from both surfaces (#516).
 *
 * Every rule already lived here: `round-commands`, `vote-commands`,
 * `agenda-commands` and `roster-commands` each own their gate, their clock and
 * their refusal reasons. What neither surface did was *call* them. The client's
 * `DocService` carried twenty named writer methods, thirteen of them one-line
 * forwards whose only contribution was a null check; the CLI's `SessionHandle`
 * carried eleven more under different names for the same acts. Adding a command
 * to `@hnch/shared` was therefore a three-file act, and forgetting one of the
 * two forwards was silent — the surface simply lacked the affordance.
 *
 * `bindSessionCommands` closes that by binding a session's *context* — the doc,
 * the caller's participant id, a reading of the online set, an injectable clock
 * — and returning eighteen flat members named exactly as the commands are
 * named. Because the context is bound, the ids callers used to thread disappear
 * from the call sites: `toggleCurrentVote(card)`, `kick(targetId)`,
 * `handoffHost(targetId)`, `endSession()`.
 *
 * **Flat, not grouped by module.** Grouping would re-introduce the width this
 * exists to remove — a caller would learn four group names *and* their members,
 * and those group names would drift from the module names the moment a command
 * moved between modules.
 *
 * **Two acts stay out, deliberately.** `promoteHost` is ungated because the
 * ADR-0048 election has already chosen and there is no host to authorise the
 * write; putting it beside the gated `handoffHost` invites the call site that
 * erases the distinction. `rejoin` is called only from `connectToRelay`'s
 * `onSynced`, because that moment is what guarantees the LWW merge ordering the
 * departure lifecycle depends on (ADR-0036 §6); a bound member would advertise
 * it as callable at any time. Both keep their direct call sites in the adapters
 * that own them.
 *
 * Session-settings patching and round-descriptor patching also stay out:
 * `patchSettings` already carries its own gate in its narrowed public parameter
 * type, and a descriptor patch is not a command.
 */

import type * as Y from 'yjs';
import {
  addItem,
  cancelItem,
  editItem,
  moveItem,
  skipItem,
  type AddItemInit,
  type AgendaResult,
  type EditItemPatch,
} from './agenda-commands.js';
import {
  endSession,
  handoffHost,
  kick,
  leave,
  recolor,
  rename,
  toggleRole,
  type RosterResult,
} from './roster-commands.js';
import {
  discardCurrentRound,
  revealCurrentRound,
  skipCurrentRound,
  startRound,
  type RoundResult,
  type StartRoundInit,
  type TerminalResult,
} from './round-commands.js';
import { clearCurrentVote, toggleCurrentVote, type VoteResult } from './vote-commands.js';

/** Injectable clock — defaults to `Date.now`; tests pass a deterministic stub. */
type Clock = () => number;

/**
 * What a live session supplies to bind its command set.
 *
 * The shape encodes two decisions. `participantId` is a **value** because it is
 * immutable for a session's life — a getter would advertise a mutability that
 * does not exist. `onlineIds` is a **getter** because the online set changes
 * continuously; this matches the rule the drivers already follow, that a module
 * is fed a *reading* rather than a live primitive.
 */
export interface SessionCommandsContext {
  /** The live session doc. */
  readonly doc: Y.Doc;
  /** The caller's own participant id — the actor every self-acting member binds. */
  readonly participantId: string;
  /** A reading of the awareness-derived online set, taken at call time. */
  readonly onlineIds: () => ReadonlySet<string>;
  /** Injectable clock, threaded to every command that stamps a timestamp. */
  readonly now?: Clock;
}

/**
 * The whole UI-facing writer seam as one interface: eighteen members, each
 * named as its underlying command is named, each returning that command's
 * typed result so a refusal is always available to branch on.
 *
 * Two adapters implement it — {@link bindSessionCommands} against a live
 * session, and {@link UNBOUND_SESSION_COMMANDS} for a surface that has no
 * session yet.
 */
export interface SessionCommands {
  // --- round commands ------------------------------------------------------

  /**
   * Start a round, attributed to the session's host and stamped from the bound
   * clock. Pass `parentRoundId` for a re-vote (ADR-0013).
   */
  startRound(init?: StartRoundInit): RoundResult;
  /** Reveal the current round. */
  revealCurrentRound(): TerminalResult;
  /** Skip the current round (ADR-0040). */
  skipCurrentRound(): TerminalResult;
  /** Discard the current round, attributed to the bound participant. */
  discardCurrentRound(): TerminalResult;

  // --- vote commands -------------------------------------------------------

  /** Cast, change, or clear the bound participant's vote on the active round. */
  toggleCurrentVote(card: string): VoteResult;
  /** Clear the bound participant's vote on the active round. */
  clearCurrentVote(): VoteResult;

  // --- agenda commands -----------------------------------------------------

  /** Append a pre-session agenda item (ADR-0042). */
  addItem(init: AddItemInit): AgendaResult;
  /** Patch an agenda item's editable fields. */
  editItem(id: string, patch: EditItemPatch): AgendaResult;
  /** Skip an agenda item without creating a round. */
  skipItem(id: string): AgendaResult;
  /** Soft-delete an agenda item. */
  cancelItem(id: string): AgendaResult;
  /** Reorder a pending agenda item between two sortKeys. */
  moveItem(id: string, before?: string | null, after?: string | null): AgendaResult;

  // --- roster commands -----------------------------------------------------

  /** Change the bound participant's display name. */
  rename(displayName: string): RosterResult;
  /** Set the bound participant's avatar colour (ADR-0043). */
  recolor(color: string): RosterResult;
  /** Flip the bound participant between `'voter'` and `'viewer'`. */
  toggleRole(): RosterResult;
  /** Soft-delete the bound participant's own record (ADR-0036). */
  leave(): RosterResult;
  /** Host-gated removal of another participant (ADR-0036). */
  kick(targetId: string): RosterResult;
  /**
   * Host-gated handoff of host authority. The online-set rule is applied from
   * the bound context, so a call site cannot forget it.
   */
  handoffHost(targetId: string): RosterResult;
  /** Host-gated end of the session for everyone (ADR-0023). */
  endSession(): RosterResult;
}

/**
 * Bind the writer seam to one live session.
 *
 * Members that act on the caller lose their actor parameter entirely; members
 * that act on a *target* keep the target and lose the actor. `handoffHost`
 * additionally loses its online-set parameter, which the binding supplies from
 * the context getter at call time.
 *
 * The returned set is a plain object of closures. A surface holds exactly one
 * per session and drops it on teardown — a set bound to a destroyed doc must
 * never be reachable, which is why rebinding on a second session is the
 * adapter's job rather than something this module can enforce.
 */
export function bindSessionCommands(ctx: SessionCommandsContext): SessionCommands {
  const { doc, participantId, onlineIds } = ctx;
  const clock = ctx.now ?? Date.now;

  return {
    startRound: (init) => startRound(doc, init, clock),
    revealCurrentRound: () => revealCurrentRound(doc, clock),
    skipCurrentRound: () => skipCurrentRound(doc, clock),
    discardCurrentRound: () => discardCurrentRound(doc, participantId, clock),

    toggleCurrentVote: (card) => toggleCurrentVote(doc, participantId, card),
    clearCurrentVote: () => clearCurrentVote(doc, participantId),

    addItem: (init) => addItem(doc, init, clock),
    editItem: (id, patch) => editItem(doc, id, patch),
    skipItem: (id) => skipItem(doc, id),
    cancelItem: (id) => cancelItem(doc, id),
    moveItem: (id, before, after) => moveItem(doc, id, before, after),

    rename: (displayName) => rename(doc, participantId, displayName),
    recolor: (color) => recolor(doc, participantId, color),
    toggleRole: () => toggleRole(doc, participantId),
    leave: () => leave(doc, participantId, clock),
    kick: (targetId) => kick(doc, participantId, targetId, clock),
    handoffHost: (targetId) => handoffHost(doc, participantId, targetId, onlineIds()),
    endSession: () => endSession(doc, participantId, clock),
  };
}

/**
 * The same interface for a surface with no session — a real adapter, not a
 * hypothetical one. The client holds it before a session is attached and after
 * teardown, and both surfaces' tests spread it as a fake.
 *
 * Every member refuses using a reason its own result type already carries: no
 * doc means no current round for the terminal acts, no active round for the
 * vote acts, and no record for the agenda and roster acts. `startRound` gets
 * `'no-session'`, the one reason added for this state. Nothing new is invented,
 * so no caller grows a null check it did not already have.
 */
export const UNBOUND_SESSION_COMMANDS: SessionCommands = {
  startRound: () => ({ applied: false, reason: 'no-session' }),
  revealCurrentRound: () => ({ applied: false, reason: 'no-current-round' }),
  skipCurrentRound: () => ({ applied: false, reason: 'no-current-round' }),
  discardCurrentRound: () => ({ applied: false, reason: 'no-current-round' }),

  toggleCurrentVote: () => ({ applied: false, reason: 'no-active-round' }),
  clearCurrentVote: () => ({ applied: false, reason: 'no-active-round' }),

  addItem: () => ({ applied: false, reason: 'not-found' }),
  editItem: () => ({ applied: false, reason: 'not-found' }),
  skipItem: () => ({ applied: false, reason: 'not-found' }),
  cancelItem: () => ({ applied: false, reason: 'not-found' }),
  moveItem: () => ({ applied: false, reason: 'not-found' }),

  rename: () => ({ applied: false, reason: 'not-found' }),
  recolor: () => ({ applied: false, reason: 'not-found' }),
  toggleRole: () => ({ applied: false, reason: 'not-found' }),
  leave: () => ({ applied: false, reason: 'not-found' }),
  kick: () => ({ applied: false, reason: 'not-found' }),
  handoffHost: () => ({ applied: false, reason: 'not-found' }),
  endSession: () => ({ applied: false, reason: 'not-found' }),
};
