/**
 * Screen selection — the single home for "which screen should this peer be
 * on?", for every surface that has more than one (#508).
 *
 * The rule is the one `activeRound` already encodes: an active round means
 * the peer belongs on Estimating; otherwise it belongs on Lobby. Because
 * `activeRound` has **no anchor fallback**, a session whose only round is
 * discarded resolves to Lobby naturally — the case that previously needed a
 * second, hand-written recovery effect on the client's Estimating page.
 *
 * The selector is total on a projection: no null, no `loading` member, no
 * options bag. A peer with no session is not a screen question — that is the
 * consuming adapter's pre-load concern, not this rule's.
 */

import { activeRound, type DocProjection } from './doc-projection.js';

/**
 * The screens a peer inside a session can be on. Both surfaces speak this
 * union: the client's routes (`/lobby`, `/estimating`) and its last-session
 * cache, and the CLI's lobby / voting views.
 */
export type Screen = 'lobby' | 'estimating';

/**
 * The screen this projection puts a peer on. An active round → `'estimating'`;
 * otherwise → `'lobby'`.
 */
export function screenFor(projection: DocProjection): Screen {
  return activeRound(projection) === null ? 'lobby' : 'estimating';
}
