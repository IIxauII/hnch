import type { ParticipantSnapshot } from '@hnch/shared';

/**
 * Compute the human-readable participant-section summary
 * (e.g. "5 online · 1 offline · 2 viewers"). Empty string when
 * no segment applies. Pure helper exported for unit testing.
 */
export function summarizeParticipants(
  participants: readonly ParticipantSnapshot[],
  onlineIds: ReadonlySet<string>,
  isViewer: (p: ParticipantSnapshot) => boolean,
): string {
  let onlineVoters = 0;
  let viewers = 0;
  let offline = 0;
  for (const p of participants) {
    const online = onlineIds.has(p.id);
    if (isViewer(p)) viewers++;
    else if (online) onlineVoters++;
    else offline++;
  }
  const parts: string[] = [];
  if (onlineVoters > 0) parts.push(`${onlineVoters} online`);
  if (offline > 0) parts.push(`${offline} offline`);
  if (viewers > 0) parts.push(`${viewers} viewer${viewers === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/**
 * Accordion `value` for the participants section. Returns `'open'`
 * when the participants list should be expanded; `null` collapses.
 * Collapses once a round has been revealed so results stay above
 * the fold. Pure helper exported for unit testing.
 */
export function participantsAccordionValueFor(hasRevealedRound: boolean): 'open' | null {
  return hasRevealedRound ? null : 'open';
}

/**
 * Maps the ion-accordion-group `(ionChange)` detail value to the
 * "is the participants section actually expanded" boolean used to gate
 * the redundant header summary. `'open'` → true; everything else
 * (null, undefined, any other value) → false. Pure helper exported
 * for unit testing — the binding from intent (`participantsAccordionValueFor`)
 * to DOM state is one-way, so the component reconciles via this predicate.
 */
export function participantsAccordionOpenFromValue(value: string | null | undefined): boolean {
  return value === 'open';
}
