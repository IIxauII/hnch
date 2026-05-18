/**
 * Tests for VoteResultsComponent — TestBed rendering.
 *
 * Exercises the abstain sentinel (ADR-0041) and proportional vote-distribution
 * bar (issue #123) code paths at runtime via TestBed + JSDOM.
 *
 * Intentionally absent:
 *  - CSS media-query properties (prefers-reduced-motion, ::before bar) — JSDOM
 *    does not evaluate CSS; recording as blocked gaps.
 *  - Source-code structure checks (computeRoundStats import, template syntax) —
 *    source-scanning provides no regression signal and is forbidden per the
 *    No-Simulation rule; coverage is provided by the TestBed rendering tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { ABSTAIN_SENTINEL } from '@hnch/shared';
import { TestBed } from '@angular/core/testing';
import type { ParticipantSnapshot, Round } from '@hnch/shared';
import { HapticService } from '../core/haptic.service';

// ---------------------------------------------------------------------------
// Ionic stubs — must be hoisted before the component import.
// ---------------------------------------------------------------------------
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});

  @Comp({ selector: 'ion-chip', template: '<ng-content/>', standalone: true })
  class IonChip {
    @Input() color: string | undefined;
  }

  return {
    IonChip,
    IonItemGroup: stub('ion-item-group'),
    IonLabel: stub('ion-label'),
  };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCALE = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] };

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'round-1',
    scale: SCALE,
    createdBy: 'host',
    createdAt: 1000,
    votes: {},
    revealedAt: 2000,
    timerStartedAt: 1000,
    ...overrides,
  };
}

function makeParticipant(id: string, displayName: string, leftAt?: number): ParticipantSnapshot {
  return { id, displayName, joinedAt: 0, ...(leftAt !== undefined ? { leftAt } : {}) };
}

const hapticStub = {
  notificationSuccess: vi.fn(),
  impactMedium: vi.fn(),
  impactLight: vi.fn(),
  impactHeavy: vi.fn(),
};

async function mountVoteResults(
  round: Round,
  participants: ParticipantSnapshot[],
  myId: string | null = null,
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: HapticService, useValue: hapticStub }],
  });
  const { VoteResultsComponent } = await import('./vote-results.component');
  const fixture = TestBed.createComponent(VoteResultsComponent);
  fixture.componentRef.setInput('round', round);
  fixture.componentRef.setInput('participants', participants);
  if (myId !== null) fixture.componentRef.setInput('myId', myId);
  fixture.detectChanges();
  return fixture;
}

// ---------------------------------------------------------------------------
// TestBed rendering
// ---------------------------------------------------------------------------

// Exercises: vote-results.component:VoteResultsComponent
describe('VoteResultsComponent — TestBed rendering', () => {
  it("2 numeric voters → 2 numeric groups, no Abstained, no Didn't-vote group", async () => {
    const round = makeRound({ votes: { p1: '3', p2: '5' } });
    const participants = [makeParticipant('p1', 'Alice'), makeParticipant('p2', 'Bob')];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const groups = Array.from(el.querySelectorAll('.group'));
    expect(groups.length).toBe(2);
    expect(el.querySelector('.abstained')).toBeNull();
    expect(el.querySelector('.didnt-vote')).toBeNull();
  });

  it('1 numeric + 1 abstain → numeric group + Abstained group; abstainer name in Abstained', async () => {
    const round = makeRound({ votes: { p1: '5', p2: ABSTAIN_SENTINEL } });
    const participants = [makeParticipant('p1', 'Alice'), makeParticipant('p2', 'Bob')];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.abstained')).not.toBeNull();
    expect(el.querySelector('.didnt-vote')).toBeNull();
    expect(el.querySelector('.abstained')!.textContent).toContain('Bob');
    const numericGroups = Array.from(
      el.querySelectorAll('.group:not(.abstained):not(.didnt-vote)'),
    );
    expect(numericGroups.length).toBe(1);
    expect(numericGroups[0]!.textContent).not.toContain('Bob');
  });

  it("1 numeric + 1 abstain + 1 missing → all three groups; Abstained before Didn't-vote", async () => {
    const round = makeRound({ votes: { p1: '5', p2: ABSTAIN_SENTINEL } });
    const participants = [
      makeParticipant('p1', 'Alice'),
      makeParticipant('p2', 'Bob'),
      makeParticipant('p3', 'Carol'),
    ];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const groupEls = Array.from(el.querySelectorAll('.group'));
    const classes = groupEls.map((g) => g.className);
    const abstainedIdx = classes.findIndex((c) => c.includes('abstained'));
    const didntVoteIdx = classes.findIndex((c) => c.includes('didnt-vote'));
    expect(abstainedIdx).toBeGreaterThan(-1);
    expect(didntVoteIdx).toBeGreaterThan(-1);
    expect(abstainedIdx).toBeLessThan(didntVoteIdx);
    expect(el.querySelector('.didnt-vote')!.textContent).toContain('Carol');
  });

  it('sentinel-valued entry does NOT appear under any numeric card group', async () => {
    const round = makeRound({ votes: { p1: ABSTAIN_SENTINEL } });
    const participants = [makeParticipant('p1', 'Alice')];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const numericGroups = Array.from(
      el.querySelectorAll('.group:not(.abstained):not(.didnt-vote)'),
    );
    expect(numericGroups.length).toBe(0);
    expect(el.querySelector('.abstained')).not.toBeNull();
  });

  it('abstainedNames() excludes departed (leftAt) participants', async () => {
    const round = makeRound({ votes: { p1: '5', p2: ABSTAIN_SENTINEL, p3: ABSTAIN_SENTINEL } });
    const participants = [
      makeParticipant('p1', 'Alice'),
      makeParticipant('p2', 'Bob'),
      makeParticipant('p3', 'Carol', 9999),
    ];
    const fixture = await mountVoteResults(round, participants);
    const component = fixture.componentInstance;
    const abstained = (component as unknown as { abstainedNames: () => string[] }).abstainedNames();
    expect(abstained).toContain('Bob');
    expect(abstained).not.toContain('Carol');
  });

  it('plurality group has .plurality class; others do not (issue #123)', async () => {
    const round = makeRound({ votes: { p1: '3', p2: '5', p3: '5', p4: '5', p5: '8' } });
    const participants = [
      makeParticipant('p1', 'Alice'),
      makeParticipant('p2', 'Bob'),
      makeParticipant('p3', 'Carol'),
      makeParticipant('p4', 'Dave'),
      makeParticipant('p5', 'Eve'),
    ];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const groups = Array.from(el.querySelectorAll('.group:not(.abstained):not(.didnt-vote)'));
    expect(groups.length).toBe(3);
    expect(groups[0]!.classList.contains('plurality')).toBe(true);
    expect(groups[1]!.classList.contains('plurality')).toBe(false);
    expect(groups[2]!.classList.contains('plurality')).toBe(false);
  });

  it('--bar-width inline style is proportional to group share (issue #123)', async () => {
    const round = makeRound({ votes: { p1: '3', p2: '5', p3: '5', p4: '5', p5: '8' } });
    const participants = [
      makeParticipant('p1', 'Alice'),
      makeParticipant('p2', 'Bob'),
      makeParticipant('p3', 'Carol'),
      makeParticipant('p4', 'Dave'),
      makeParticipant('p5', 'Eve'),
    ];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const groups = Array.from(
      el.querySelectorAll<HTMLElement>('.group:not(.abstained):not(.didnt-vote)'),
    );
    expect(groups[0]!.style.getPropertyValue('--bar-width')).toBe('60%');
    expect(groups[1]!.style.getPropertyValue('--bar-width')).toBe('20%');
    expect(groups[2]!.style.getPropertyValue('--bar-width')).toBe('20%');
  });

  it('unanimous round → single 100%-width plurality bar (issue #123 AC #5)', async () => {
    const round = makeRound({ votes: { p1: '5', p2: '5', p3: '5' } });
    const participants = [
      makeParticipant('p1', 'Alice'),
      makeParticipant('p2', 'Bob'),
      makeParticipant('p3', 'Carol'),
    ];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const groups = Array.from(
      el.querySelectorAll<HTMLElement>('.group:not(.abstained):not(.didnt-vote)'),
    );
    expect(groups.length).toBe(1);
    expect(groups[0]!.style.getPropertyValue('--bar-width')).toBe('100%');
    expect(groups[0]!.classList.contains('plurality')).toBe(true);
  });

  it('categorical scale → consensus chip rendered with aria-label (issue #157)', async () => {
    const TSHIRT = { id: 't-shirt', cards: ['XS', 'S', 'M', 'L', 'XL'] };
    const round = makeRound({
      scale: TSHIRT,
      votes: { p1: 'M', p2: 'L' },
    });
    const participants = [makeParticipant('p1', 'Alice'), makeParticipant('p2', 'Bob')];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const chip = el.querySelector('ion-chip.spread-chip');
    expect(chip).not.toBeNull();
    expect(chip!.getAttribute('aria-label')).toBe('Consensus level: Close');
    expect(chip!.textContent).toContain('Close');
  });

  it('categorical unanimous → consensus chip "Unanimous" (issue #157)', async () => {
    const TSHIRT = { id: 't-shirt', cards: ['XS', 'S', 'M', 'L', 'XL'] };
    const round = makeRound({ scale: TSHIRT, votes: { p1: 'M', p2: 'M' } });
    const participants = [makeParticipant('p1', 'Alice'), makeParticipant('p2', 'Bob')];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const chip = el.querySelector('ion-chip.spread-chip');
    expect(chip!.getAttribute('aria-label')).toBe('Consensus level: Unanimous');
  });

  it('categorical 3-distinct → consensus chip "Spread" (issue #157 AC #4)', async () => {
    const TSHIRT = { id: 't-shirt', cards: ['XS', 'S', 'M', 'L', 'XL'] };
    const round = makeRound({ scale: TSHIRT, votes: { p1: 'S', p2: 'M', p3: 'L' } });
    const participants = [
      makeParticipant('p1', 'Alice'),
      makeParticipant('p2', 'Bob'),
      makeParticipant('p3', 'Carol'),
    ];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const chip = el.querySelector('ion-chip.spread-chip');
    expect(chip!.getAttribute('aria-label')).toBe('Consensus level: Spread');
  });

  it('zero votes → no consensus chip (issue #157 AC #5)', async () => {
    const TSHIRT = { id: 't-shirt', cards: ['XS', 'S', 'M', 'L', 'XL'] };
    const round = makeRound({ scale: TSHIRT, votes: {} });
    const participants = [makeParticipant('p1', 'Alice')];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('ion-chip.spread-chip')).toBeNull();
  });

  it('numeric chip carries aria-label too (issue #157 AC #7)', async () => {
    const round = makeRound({ votes: { p1: '5', p2: '5' } });
    const participants = [makeParticipant('p1', 'Alice'), makeParticipant('p2', 'Bob')];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const chip = el.querySelector('ion-chip.spread-chip');
    expect(chip!.getAttribute('aria-label')).toBe('Consensus level: Unanimous');
  });

  it('abstain entries excluded from bar denominator (issue #123 AC #3)', async () => {
    const round = makeRound({ votes: { p1: '5', p2: '5', p3: ABSTAIN_SENTINEL } });
    const participants = [
      makeParticipant('p1', 'Alice'),
      makeParticipant('p2', 'Bob'),
      makeParticipant('p3', 'Carol'),
    ];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const numericGroups = Array.from(
      el.querySelectorAll<HTMLElement>('.group:not(.abstained):not(.didnt-vote)'),
    );
    expect(numericGroups.length).toBe(1);
    expect(numericGroups[0]!.style.getPropertyValue('--bar-width')).toBe('100%');
  });
});
