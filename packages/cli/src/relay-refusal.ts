/**
 * What the CLI prints when the relay turns down an access change or a
 * handoff (ADR-0059), in one place for both acts. The sentences are the
 * docs/cli.md table's, word for word.
 */

import {
  RelayAccessError,
  RelayRejectionError,
  type AccessRefusalReason,
  type HandoffResult,
} from '@hnch/shared';

/** The relay's answer, sorted: its own reason, the room gone, or no usable answer. */
export type RelayRefusalReason = AccessRefusalReason | 'unknown-room' | 'unreachable';

/** Sort a failed relay call into a {@link RelayRefusalReason}, as the shared handoff does. */
export function relayRefusalReason(err: unknown): RelayRefusalReason {
  if (err instanceof RelayAccessError) return err.reason;
  if (err instanceof RelayRejectionError) return 'unknown-room';
  return 'unreachable';
}

/** The relay reasons that read the same whichever act was refused. */
const RELAY_SAYS: Record<Exclude<RelayRefusalReason, 'not-host' | 'bad-target'>, string> = {
  unauthenticated: 'the relay did not accept this device as the host',
  'unknown-room': 'the relay no longer knows this room',
  unreachable: 'the relay could not be reached',
};

function capitalize(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Why an access change failed: a sentence that stands alone. */
export const ACCESS_REFUSAL: Record<RelayRefusalReason, string> = {
  'not-host': 'Only the host can change the password',
  // A handoff's reason: the access route never gives it.
  'bad-target': 'The relay refused the change',
  unauthenticated: capitalize(RELAY_SAYS.unauthenticated),
  'unknown-room': capitalize(RELAY_SAYS['unknown-room']),
  unreachable: capitalize(RELAY_SAYS.unreachable),
};

/**
 * Why a handoff failed, after "Handoff failed: ". The doc's own refusals come
 * first, then the relay's. The roster union is one per module rather than one
 * per command, so `'self-target'` — a `kick`-only reason — appears too; it gets
 * a sentence describing *this* act, but `handoffHost` never returns it.
 */
export const HANDOFF_REFUSAL: Record<Extract<HandoffResult, { applied: false }>['reason'], string> =
  {
    'not-found': 'that participant is not in the session',
    'not-online': 'that participant is offline',
    'self-target': 'you cannot hand off to yourself',
    'not-host': 'only the current host can hand off',
    'bad-target': 'the relay cannot hand host to that participant',
    ...RELAY_SAYS,
  };
