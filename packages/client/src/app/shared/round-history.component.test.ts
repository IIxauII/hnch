/**
 * Unit tests for RoundHistoryComponent — specifically the `entries` computed
 * signal that drives the compact round-history list.
 *
 * The key logic under test:
 *  - Rounds without a terminal status are filtered out
 *  - Entries appear in reverse chronological order (newest first)
 *  - Round numbers reflect original array position, not display position
 *  - Vote summary groups identical cards by count (sorted count-desc,
 *    tie-broken by scale order) and formats as "card×count, card×count"
 *  - Rounds with no votes render "No votes"
 *  - Elapsed time uses formatElapsed(terminalAt - timerStartedAt) for revealed rounds
 *  - Rounds missing timerStartedAt produce null elapsed
 *
 * Pattern: Ionic component stubs + TestBed, matching avatar-vote-row style.
 */

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ABSTAIN_SENTINEL } from '@hnch/shared';
import type { Round } from '@hnch/shared';

// Provide minimal Angular stub components so the standalone component
// can compile its imports without requiring the full Ionic runtime.
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core');

  @Comp({ selector: 'ion-button', template: '', standalone: true })
  class IonButton {}

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {}

  return { IonButton, IonIcon };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ pencilOutline: '' }));

// Import signal here (not inside vi.mock factory) — hoisting is not needed.
import { signal } from '@angular/core';

// Helpers

function makeScale(cards: string[]) {
  return { id: 'fibonacci', cards };
}

function makeRound(overrides: Partial<Round> & Pick<Round, 'id' | 'scale' | 'votes'>): Round {
  return {
    createdAt: Date.now(),
    createdBy: 'p1',
    status: 'pending',
    ...overrides,
  };
}

/** Stub DocService for tests that don't need agenda data. */
class StubDocService {
  readonly agenda = signal<readonly import('@hnch/shared').AgendaItem[]>([]).asReadonly();
}

async function createComponent(rounds: readonly Round[], isHost = false) {
  const { RoundHistoryComponent } = await import('./round-history.component');
  const { DocService } = await import('../core/doc/doc.service');
  TestBed.configureTestingModule({
    providers: [{ provide: DocService, useClass: StubDocService }],
  });
  const fixture = TestBed.createComponent(RoundHistoryComponent);
  fixture.componentRef.setInput('rounds', rounds);
  fixture.componentRef.setInput('isHost', isHost);
  fixture.detectChanges();
  return fixture.componentInstance;
}

async function createComponentWithAllRounds(rounds: readonly Round[], allRounds: readonly Round[]) {
  const { RoundHistoryComponent } = await import('./round-history.component');
  const { DocService } = await import('../core/doc/doc.service');
  TestBed.configureTestingModule({
    providers: [{ provide: DocService, useClass: StubDocService }],
  });
  const fixture = TestBed.createComponent(RoundHistoryComponent);
  fixture.componentRef.setInput('rounds', rounds);
  fixture.componentRef.setInput('allRounds', allRounds);
  fixture.detectChanges();
  return fixture.componentInstance;
}

// Tests

describe('RoundHistoryComponent.entries', () => {
  // Filtering

  it('returns empty array when no rounds', async () => {
    const c = await createComponent([]);
    expect(c.entries()).toHaveLength(0);
  });

  it('filters out rounds that have no terminal status', async () => {
    const scale = makeScale(['1', '2', '3']);
    const notRevealed = makeRound({ id: 'r1', scale, votes: { p1: '1' } });
    const c = await createComponent([notRevealed]);
    expect(c.entries()).toHaveLength(0);
  });

  it('includes only rounds that have a terminal status', async () => {
    const scale = makeScale(['1', '2', '3']);
    const revealed = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '1' },
      status: 'revealed',
      terminalAt: 1000,
    });
    const notRevealed = makeRound({ id: 'r2', scale, votes: {} });
    const c = await createComponent([revealed, notRevealed]);
    expect(c.entries()).toHaveLength(1);
    expect(c.entries()[0]!.roundId).toBe('r1');
  });

  // Ordering & round numbering

  it('returns entries in reverse chronological order (newest first)', async () => {
    const scale = makeScale(['1', '2']);
    const r1 = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 1000 });
    const r2 = makeRound({ id: 'r2', scale, votes: {}, status: 'revealed', terminalAt: 2000 });
    const r3 = makeRound({ id: 'r3', scale, votes: {}, status: 'revealed', terminalAt: 3000 });
    const c = await createComponent([r1, r2, r3]);
    const entries = c.entries();
    expect(entries).toHaveLength(3);
    expect(entries[0]!.roundId).toBe('r3');
    expect(entries[1]!.roundId).toBe('r2');
    expect(entries[2]!.roundId).toBe('r1');
  });

  it('round numbers reflect original array position (1-based), not display order', async () => {
    const scale = makeScale(['1', '2']);
    const r1 = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 1000 });
    const r2 = makeRound({ id: 'r2', scale, votes: {}, status: 'revealed', terminalAt: 2000 });
    const c = await createComponent([r1, r2]);
    const entries = c.entries();
    // Display order: r2 (index 0), r1 (index 1) — newest first
    // Round numbers must reflect original position: r1 → Round 1, r2 → Round 2
    expect(entries[0]!.roundNumber).toBe(2); // r2 is entry 0 (newest), but was round 2
    expect(entries[1]!.roundNumber).toBe(1); // r1 is entry 1 (oldest), but was round 1
  });

  // Vote summary

  it('"No votes" when round has no votes', async () => {
    const scale = makeScale(['1', '2', '3']);
    const r = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 1000 });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.summary).toBe('No votes');
  });

  it('single unanimous vote produces "card×count"', async () => {
    const scale = makeScale(['1', '2', '3', '5']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '5', p2: '5', p3: '5' },
      status: 'revealed',
      terminalAt: 2000,
    });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.summary).toBe('5×3');
  });

  it('multiple cards are sorted count-desc', async () => {
    const scale = makeScale(['1', '2', '3', '5']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '5', p2: '5', p3: '3' },
      status: 'revealed',
      terminalAt: 2000,
    });
    const c = await createComponent([r]);
    // 5 appears twice, 3 once → "5×2, 3×1"
    expect(c.entries()[0]!.summary).toBe('5×2, 3×1');
  });

  it('count ties are broken by scale order (card appearing earlier wins)', async () => {
    const scale = makeScale(['1', '2', '3', '5']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '3', p2: '1' }, // both count 1; "1" is earlier in scale
      status: 'revealed',
      terminalAt: 2000,
    });
    const c = await createComponent([r]);
    // "1" (index 0) beats "3" (index 2) on tie
    expect(c.entries()[0]!.summary).toBe('1×1, 3×1');
  });

  // Elapsed time

  it('computes elapsed as formatElapsed(terminalAt − timerStartedAt)', async () => {
    const scale = makeScale(['1', '2']);
    // 90 000 ms = 1 min 30 sec → "1:30"
    const r = makeRound({
      id: 'r1',
      scale,
      votes: {},
      status: 'revealed',
      terminalAt: 100_000,
      timerStartedAt: 10_000,
    });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.elapsed).toBe('1:30');
  });

  it('elapsed is null when timerStartedAt is absent', async () => {
    const scale = makeScale(['1', '2']);
    const r = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 1000 });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.elapsed).toBeNull();
  });

  it('elapsed is null when status is not revealed (guard)', async () => {
    const scale = makeScale(['1', '2']);
    // no terminal status → filtered out entirely; entries returns []
    const r = makeRound({ id: 'r1', scale, votes: {}, timerStartedAt: 0 });
    const c = await createComponent([r]);
    expect(c.entries()).toHaveLength(0);
  });

  // Label passthrough (formatRoundLabel: ticketId · title)

  it('label is null when round has no title and no ticketId', async () => {
    const scale = makeScale(['1']);
    const r = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 500 });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.label).toBeNull();
  });

  it('label is the title alone when only title is set', async () => {
    const scale = makeScale(['1']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: {},
      status: 'revealed',
      terminalAt: 500,
      title: 'Auth migration',
    });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.label).toBe('Auth migration');
  });

  it('label is the ticketId alone when only ticketId is set', async () => {
    const scale = makeScale(['1']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: {},
      status: 'revealed',
      terminalAt: 500,
      ticketId: 'PROJ-42',
    });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.label).toBe('PROJ-42');
  });

  it('label is "ticketId · title" when both are set', async () => {
    const scale = makeScale(['1']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: {},
      status: 'revealed',
      terminalAt: 500,
      title: 'Auth migration',
      ticketId: 'PROJ-42',
    });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.label).toBe('PROJ-42 · Auth migration');
  });

  // Skipped rounds

  it('includes a skipped round', async () => {
    const scale = makeScale(['1', '2', '3']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '1' },
      status: 'skipped',
      terminalAt: 2000,
    });
    const c = await createComponent([r]);
    expect(c.entries()).toHaveLength(1);
    expect(c.entries()[0]!.roundId).toBe('r1');
    expect(c.entries()[0]!.skipped).toBe(true);
  });

  it('skipped entry has no summary text', async () => {
    const scale = makeScale(['1', '2']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '1' },
      status: 'skipped',
      terminalAt: 2000,
    });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.summary).toBe('');
  });

  it('skipped entry has null elapsed', async () => {
    const scale = makeScale(['1', '2']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: {},
      status: 'skipped',
      terminalAt: 2000,
      timerStartedAt: 1000,
    });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.elapsed).toBeNull();
  });

  it('skipped round interleaves with revealed by array position', async () => {
    const scale = makeScale(['1', '2']);
    const r1 = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '1' },
      status: 'revealed',
      terminalAt: 1000,
    });
    const r2 = makeRound({ id: 'r2', scale, votes: {}, status: 'skipped', terminalAt: 2000 });
    const r3 = makeRound({
      id: 'r3',
      scale,
      votes: { p1: '2' },
      status: 'revealed',
      terminalAt: 3000,
    });
    const c = await createComponent([r1, r2, r3]);
    const entries = c.entries();
    expect(entries).toHaveLength(3);
    // Reverse order: r3 first, r2 second, r1 third
    expect(entries[0]!.roundId).toBe('r3');
    expect(entries[0]!.skipped).toBe(false);
    expect(entries[1]!.roundId).toBe('r2');
    expect(entries[1]!.skipped).toBe(true);
    expect(entries[2]!.roundId).toBe('r1');
    expect(entries[2]!.skipped).toBe(false);
    // Round numbers by original position
    expect(entries[0]!.roundNumber).toBe(3);
    expect(entries[1]!.roundNumber).toBe(2);
    expect(entries[2]!.roundNumber).toBe(1);
  });

  it('filters out rounds that are not terminal (no status set)', async () => {
    const scale = makeScale(['1', '2']);
    const active = makeRound({ id: 'r1', scale, votes: {} });
    const revealed = makeRound({
      id: 'r2',
      scale,
      votes: {},
      status: 'revealed',
      terminalAt: 1000,
    });
    const c = await createComponent([active, revealed]);
    expect(c.entries()).toHaveLength(1);
    expect(c.entries()[0]!.roundId).toBe('r2');
  });

  // Re-vote lineage (#111)

  it('first-round (no parent, no children) has null lineageLabel', async () => {
    const scale = makeScale(['1', '2']);
    const r1 = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 1000 });
    const c = await createComponent([r1]);
    expect(c.entries()[0]!.lineageLabel).toBeNull();
  });

  it('chain root with descendants has null lineageLabel', async () => {
    const scale = makeScale(['1', '2']);
    const r1 = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 1000 });
    const r2 = makeRound({
      id: 'r2',
      scale,
      votes: {},
      status: 'revealed',
      terminalAt: 2000,
      parentRoundId: 'r1',
    });
    const c = await createComponent([r1, r2]);
    const entries = c.entries();
    // entries[1] is r1 (oldest, root) — no badge
    expect(entries[1]!.roundId).toBe('r1');
    expect(entries[1]!.lineageLabel).toBeNull();
    // entries[0] is r2 — has badge
    expect(entries[0]!.roundId).toBe('r2');
    expect(entries[0]!.lineageLabel).toBe('Re-vote');
  });

  it('re-voted round (with parent) has lineageLabel "Re-vote"', async () => {
    const scale = makeScale(['1', '2']);
    const r1 = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 1000 });
    const r2 = makeRound({
      id: 'r2',
      scale,
      votes: {},
      status: 'revealed',
      terminalAt: 2000,
      parentRoundId: 'r1',
    });
    const r3 = makeRound({
      id: 'r3',
      scale,
      votes: {},
      status: 'revealed',
      terminalAt: 3000,
      parentRoundId: 'r2',
    });
    const c = await createComponent([r1, r2, r3]);
    const entries = c.entries();
    expect(entries[0]!.roundId).toBe('r3');
    expect(entries[0]!.lineageLabel).toBe('Re-vote');
    expect(entries[1]!.roundId).toBe('r2');
    expect(entries[1]!.lineageLabel).toBe('Re-vote');
    expect(entries[2]!.roundId).toBe('r1');
    expect(entries[2]!.lineageLabel).toBeNull();
  });

  it('missing parent ref falls back to null lineageLabel', async () => {
    const scale = makeScale(['1']);
    const orphan = makeRound({
      id: 'r2',
      scale,
      votes: {},
      status: 'revealed',
      terminalAt: 2000,
      parentRoundId: 'missing-root',
    });
    const c = await createComponent([orphan]);
    expect(c.entries()[0]!.lineageLabel).toBeNull();
  });

  it('uses allRounds for lineage when rounds is a filtered subset', async () => {
    // Caller passes pastRevealedRounds (without current), but allRounds is full.
    // Lineage must walk the full chain even though the parent is not in `rounds`.
    const scale = makeScale(['1']);
    const r1 = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 1000 });
    const r2 = makeRound({
      id: 'r2',
      scale,
      votes: {},
      status: 'revealed',
      terminalAt: 2000,
      parentRoundId: 'r1',
    });
    // rounds = [r1] only; allRounds = [r1, r2]. r1 is chain root → null label.
    const c = await createComponentWithAllRounds([r1], [r1, r2]);
    expect(c.entries()[0]!.lineageLabel).toBeNull();
  });

  // Abstentions (ADR-0041)

  it('never shows the abstain sentinel — abstentions trail the cards as a count', async () => {
    const scale = makeScale(['1', '2', '3', '5', '8']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '5', p2: '8', p3: ABSTAIN_SENTINEL },
      status: 'revealed',
      terminalAt: 2000,
    });
    const c = await createComponent([r]);
    const summary = c.entries()[0]!.summary;
    expect(summary).toBe('5×1, 8×1, 1 abstained');
    expect(summary).not.toContain(ABSTAIN_SENTINEL);
  });

  it('an abstention never outranks a card, however many there are', async () => {
    const scale = makeScale(['1', '2', '3']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: ABSTAIN_SENTINEL, p2: ABSTAIN_SENTINEL, p3: '2' },
      status: 'revealed',
      terminalAt: 2000,
    });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.summary).toBe('2×1, 2 abstained');
  });

  it('a round where everyone abstained says so instead of "No votes"', async () => {
    const scale = makeScale(['1', '2']);
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: ABSTAIN_SENTINEL, p2: ABSTAIN_SENTINEL },
      status: 'revealed',
      terminalAt: 2000,
    });
    const c = await createComponent([r]);
    expect(c.entries()[0]!.summary).toBe('2 abstained');
  });

  // Discarded rounds (ADR-0046)

  it('leaves a discarded round out — a tombstone is not history', async () => {
    const scale = makeScale(['1', '2']);
    const r1 = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 1000 });
    const discarded = makeRound({
      id: 'r2',
      scale,
      // A vote that raced the discard still sits in the map.
      votes: { p1: '2' },
      status: 'discarded',
      terminalAt: 2000,
    });
    const c = await createComponent([r1, discarded]);
    expect(c.entries().map((e) => e.roundId)).toEqual(['r1']);
  });

  it('numbers a round by its place in the session, not in the filtered list', async () => {
    // Round 3 is the one Lobby shows in full, so `rounds` is [r1, r2]. r2 was
    // "Round 2" on the Estimating screen and must still be "Round 2" here.
    const scale = makeScale(['1', '2']);
    const r1 = makeRound({ id: 'r1', scale, votes: {}, status: 'skipped', terminalAt: 1000 });
    const r2 = makeRound({ id: 'r2', scale, votes: {}, status: 'revealed', terminalAt: 2000 });
    const r3 = makeRound({ id: 'r3', scale, votes: {}, status: 'revealed', terminalAt: 3000 });
    const c = await createComponentWithAllRounds([r2], [r1, r2, r3]);
    expect(c.entries().map((e) => [e.roundId, e.roundNumber])).toEqual([['r2', 2]]);
  });

  it('a cancelled round takes no number, so the history has no gap', async () => {
    const scale = makeScale(['1', '2']);
    const r1 = makeRound({ id: 'r1', scale, votes: {}, status: 'revealed', terminalAt: 1000 });
    const r2 = makeRound({ id: 'r2', scale, votes: {}, status: 'discarded', terminalAt: 2000 });
    const r3 = makeRound({ id: 'r3', scale, votes: {}, status: 'revealed', terminalAt: 3000 });
    const r4 = makeRound({ id: 'r4', scale, votes: {}, status: 'revealed', terminalAt: 4000 });
    const c = await createComponentWithAllRounds([r1, r3], [r1, r2, r3, r4]);
    expect(c.entries().map((e) => [e.roundId, e.roundNumber])).toEqual([
      ['r3', 2],
      ['r1', 1],
    ]);
  });
});

describe('RoundHistoryComponent — rendering', () => {
  async function render(rounds: readonly Round[], isHost = false): Promise<HTMLElement> {
    const { RoundHistoryComponent } = await import('./round-history.component');
    const { DocService } = await import('../core/doc/doc.service');
    TestBed.configureTestingModule({
      providers: [{ provide: DocService, useClass: StubDocService }],
    });
    const fixture = TestBed.createComponent(RoundHistoryComponent);
    fixture.componentRef.setInput('rounds', rounds);
    fixture.componentRef.setInput('isHost', isHost);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const scale = makeScale(['1', '2', '3']);

  it('renders the round name on its own, with no punctuation glued to it', async () => {
    const el = await render([
      makeRound({
        id: 'r1',
        scale,
        votes: { p1: '2' },
        status: 'revealed',
        terminalAt: 2000,
        title: 'Auth migration',
        ticketId: 'PROJ-42',
      }),
    ]);
    expect(el.querySelector('.round-label')!.textContent).toBe('Round 1');
    expect(el.querySelector('.round-title')!.textContent).toBe('PROJ-42 · Auth migration');
    expect(el.querySelector('.round-summary')!.textContent).toBe('2×1');
  });

  it('marks a skipped round and offers no edit for it', async () => {
    const el = await render(
      [makeRound({ id: 'r1', scale, votes: {}, status: 'skipped', terminalAt: 2000 })],
      true,
    );
    expect(el.querySelector('.history-item')!.classList).toContain('skipped');
    expect(el.querySelector('.round-skipped')!.textContent).toBe('Skipped');
    expect(el.querySelector('.edit-btn')).toBeNull();
  });

  it('shows the edit button to the host only', async () => {
    const round = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '1' },
      status: 'revealed',
      terminalAt: 2000,
    });
    expect((await render([round], true)).querySelector('.edit-btn')).not.toBeNull();
    TestBed.resetTestingModule();
    expect((await render([round], false)).querySelector('.edit-btn')).toBeNull();
  });

  it('keeps the edit button out of the text, as the last thing in the row', async () => {
    const el = await render(
      [makeRound({ id: 'r1', scale, votes: { p1: '1' }, status: 'revealed', terminalAt: 2000 })],
      true,
    );
    const row = el.querySelector('.history-item')!;
    expect(row.lastElementChild!.classList).toContain('edit-btn');
    expect(row.querySelector('.history-text .edit-btn')).toBeNull();
    expect(row.querySelector('.edit-btn')!.getAttribute('aria-label')).toBe('Edit round 1');
  });

  it('holds the place of the button on a skipped row, for the host only', async () => {
    const skipped = makeRound({
      id: 'r1',
      scale,
      votes: {},
      status: 'skipped',
      terminalAt: 2000,
    });
    const spacer = (await render([skipped], true)).querySelector('.edit-spacer');
    expect(spacer).not.toBeNull();
    // Layout only: nothing for a screen reader to land on.
    expect(spacer!.getAttribute('aria-hidden')).toBe('true');
    TestBed.resetTestingModule();
    expect((await render([skipped], false)).querySelector('.edit-spacer')).toBeNull();
  });

  it('renders nothing at all when there is no history', async () => {
    expect((await render([])).querySelector('.history-list')).toBeNull();
  });
});
