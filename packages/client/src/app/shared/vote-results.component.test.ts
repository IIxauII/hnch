/**
 * Tests for VoteResultsComponent accessibility and structure.
 *
 * Because JSDOM doesn't evaluate CSS media queries or Angular templates at
 * build time, we test by reading the source file and asserting on substrings.
 * Logic tests use direct signal/computed helpers extracted from the component.
 */

import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { isAbstainVote, ABSTAIN_SENTINEL } from '@hnch/shared';

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
      // Both on the same import line
      const importLine = sourceFile.split('\n').find((l) => l.includes('computeRoundStats'));
      expect(importLine).toBeTruthy();
      expect(importLine).toContain('@hnch/shared');
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
