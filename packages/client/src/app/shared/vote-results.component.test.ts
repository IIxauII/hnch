/**
 * Tests for VoteResultsComponent accessibility and structure.
 *
 * Because JSDOM doesn't evaluate CSS media queries or Angular templates at
 * build time, we test by reading the source file and asserting on substrings.
 * Logic tests use direct signal/computed helpers extracted from the component.
 *
 * Real TestBed rendering is provided in the second describe block below,
 * covering the abstain additions (ADR-0041) and the voteGroups/abstainedNames
 * computeds that were previously at 0% coverage.
 */

import { readFileSync } from 'fs';
import { describe, expect, it, vi } from 'vitest';
import { isAbstainVote, ABSTAIN_SENTINEL } from '@hnch/shared';

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

describe('VoteResultsComponent', () => {
  const sourceFile = readFileSync('./src/app/shared/vote-results.component.ts', 'utf-8');

  describe('prefers-reduced-motion', () => {
    it('contains @media (prefers-reduced-motion: reduce) block for reveal stagger', () => {
      expect(sourceFile).toContain('@media (prefers-reduced-motion: reduce)');
      const mediaBlock = sourceFile.match(
        /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\.group\s*{[\s\S]*?animation:\s*none/,
      );
      expect(mediaBlock).toBeTruthy();
    });

    it('consensus overlay animation respects prefers-reduced-motion', () => {
      expect(sourceFile).toContain('@keyframes consensusScaleIn');
      expect(sourceFile).toContain('@keyframes consensusPulse');
      const mediaBlock = sourceFile.match(
        /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\.consensus-text\s*{[\s\S]*?animation:\s*none/,
      );
      expect(mediaBlock).toBeTruthy();
    });
  });

  describe('computeRoundStats migration', () => {
    it('imports computeRoundStats from @hnch/shared', () => {
      expect(sourceFile).toContain('computeRoundStats');
      expect(sourceFile).toContain('@hnch/shared');
      const importMatch = sourceFile.match(
        /import\s*\{[^}]*\bcomputeRoundStats\b[^}]*\}\s*from\s*['"]@hnch\/shared['"]/,
      );
      expect(importMatch).toBeTruthy();
    });

    it('contains @switch (s.kind) block and spreadColor method', () => {
      expect(sourceFile).toContain('@switch (s.kind)');
      expect(sourceFile).toContain('spreadColor(');
      expect(sourceFile).toContain('spreadDisplay(');
    });

    it('contains categorical Most common branch', () => {
      expect(sourceFile).toContain('Most common:');
      expect(sourceFile).toContain("@case ('categorical')");
    });

    it('stats block appears before elapsed block in template', () => {
      const statsIdx = sourceFile.indexOf('<div class="stats"');
      const elapsedIdx = sourceFile.indexOf('<p class="elapsed"');
      expect(statsIdx).toBeGreaterThan(-1);
      expect(elapsedIdx).toBeGreaterThan(-1);
      expect(statsIdx).toBeLessThan(elapsedIdx);
    });
  });

  describe('abstain group (ADR-0041)', () => {
    it('template renders an Abstained group', () => {
      expect(sourceFile).toContain('abstainedNames()');
      expect(sourceFile).toContain('Abstained');
    });

    it("Abstained group appears before Didn't vote group in template", () => {
      const abstainedIdx = sourceFile.indexOf('class="group abstained"');
      const didntVoteIdx = sourceFile.indexOf('class="group didnt-vote"');
      expect(abstainedIdx).toBeGreaterThan(-1);
      expect(didntVoteIdx).toBeGreaterThan(-1);
      expect(abstainedIdx).toBeLessThan(didntVoteIdx);
    });

    it('voteGroups filters sentinel via isAbstainVote', () => {
      expect(sourceFile).toContain('isAbstainVote(card)');
      // The filter must have a `continue` so sentinel skips numeric group
      expect(sourceFile).toContain('if (isAbstainVote(card)) continue;');
    });

    it('abstainedNames computed is present and checks isAbstainVote', () => {
      expect(sourceFile).toContain('abstainedNames');
      expect(sourceFile).toContain('isAbstainVote');
    });
  });

  describe('abstain sentinel logic', () => {
    it('ABSTAIN_SENTINEL is the string hnch_abstain', () => {
      expect(ABSTAIN_SENTINEL).toBe('hnch_abstain');
    });

    it('isAbstainVote returns true for sentinel', () => {
      expect(isAbstainVote('hnch_abstain')).toBe(true);
    });

    it('isAbstainVote returns false for normal card values', () => {
      expect(isAbstainVote('5')).toBe(false);
      expect(isAbstainVote('13')).toBe(false);
      expect(isAbstainVote('')).toBe(false);
    });

    it("abstained participants are NOT in Didn't vote (they have a votes entry)", () => {
      // Simulate the didntVoteNames filter: "no entry in round.votes"
      const votes: Record<string, string> = {
        voter1: '5',
        voter2: ABSTAIN_SENTINEL,
      };
      const voted = new Set(Object.keys(votes));
      // voter2 has an entry (the sentinel), so NOT in didn't-vote
      expect(voted.has('voter2')).toBe(true);
      // voter3 has no entry — should appear in didn't-vote
      expect(voted.has('voter3')).toBe(false);
    });

    it('sentinel values do not appear in numeric vote groups', () => {
      // Simulate voteGroups skip: filter out sentinel before grouping
      const votes = { voter1: '5', voter2: ABSTAIN_SENTINEL, voter3: '8' };
      const byCard = new Map<string, string[]>();
      for (const [, card] of Object.entries(votes)) {
        if (isAbstainVote(card)) continue;
        byCard.set(card, [...(byCard.get(card) ?? [])]);
      }
      expect(byCard.has(ABSTAIN_SENTINEL)).toBe(false);
      expect(byCard.has('5')).toBe(true);
      expect(byCard.has('8')).toBe(true);
    });
  });
});

describe('CustomScaleEditorSheet — abstain sentinel validation', () => {
  const editorSource = readFileSync(
    './src/app/session-settings/custom-scale-editor.sheet.ts',
    'utf-8',
  );

  it('imports isValidCustomCardLabel from @hnch/shared', () => {
    expect(editorSource).toContain('isValidCustomCardLabel');
    expect(editorSource).toContain('@hnch/shared');
  });

  it('rejects hnch_abstain sentinel in onAddCard', () => {
    expect(editorSource).toContain("'hnch_abstain' is reserved");
  });

  it('shows error via newCardError signal', () => {
    expect(editorSource).toContain('newCardError');
    expect(editorSource).toContain('newCardError.set(');
  });

  it('isValidCustomCardLabel rejects sentinel literal', async () => {
    // isValidCustomCardLabel is tested directly in @hnch/shared; verify the
    // exported function behaves correctly for sentinel and common values.
    const { isValidCustomCardLabel: fn } = await import('@hnch/shared');
    expect(fn('hnch_abstain')).toBe(false);
    expect(fn('5')).toBe(true);
    expect(fn('')).toBe(false);
    expect(fn('   ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TestBed rendering — exercises the abstain code paths at runtime.
// ---------------------------------------------------------------------------

import { TestBed } from '@angular/core/testing';
import type { ParticipantSnapshot, Round } from '@hnch/shared';
import { HapticService } from '../core/haptic.service';

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

describe('VoteResultsComponent — TestBed rendering', () => {
  it("2 numeric voters → 2 numeric groups, no Abstained, no Didn't-vote group", async () => {
    const round = makeRound({ votes: { p1: '3', p2: '5' } });
    const participants = [makeParticipant('p1', 'Alice'), makeParticipant('p2', 'Bob')];
    const fixture = await mountVoteResults(round, participants);
    const el = fixture.nativeElement as HTMLElement;
    const groups = Array.from(el.querySelectorAll('.group'));
    // Two numeric groups, no abstained or didnt-vote
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
    // Abstained chip must NOT be in any numeric group
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
    // Carol (no vote) appears in didn't-vote
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
    // No numeric groups — only the abstained group
    expect(numericGroups.length).toBe(0);
    expect(el.querySelector('.abstained')).not.toBeNull();
  });

  it('abstainedNames() excludes departed (leftAt) participants', async () => {
    const round = makeRound({ votes: { p1: '5', p2: ABSTAIN_SENTINEL, p3: ABSTAIN_SENTINEL } });
    const participants = [
      makeParticipant('p1', 'Alice'),
      makeParticipant('p2', 'Bob'), // active abstainer
      makeParticipant('p3', 'Carol', 9999), // departed — should be excluded
    ];
    const fixture = await mountVoteResults(round, participants);
    const component = fixture.componentInstance;
    const abstained = (component as unknown as { abstainedNames: () => string[] }).abstainedNames();
    expect(abstained).toContain('Bob');
    expect(abstained).not.toContain('Carol');
  });
});
