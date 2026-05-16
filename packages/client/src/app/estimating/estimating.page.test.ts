/**
 * Tests for EstimatingPage accessibility and auto-reveal logic.
 */

import { readFileSync } from 'fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({
  IonBackButton: {},
  IonButton: {},
  IonButtons: {},
  IonCard: {},
  IonCardContent: {},
  IonChip: {},
  IonCol: {},
  IonContent: {},
  IonFooter: {},
  IonGrid: {},
  IonHeader: {},
  IonIcon: {},
  IonItem: {},
  IonLabel: {},
  IonList: {},
  IonListHeader: {},
  IonRow: {},
  IonTitle: {},
  IonToast: {},
  IonToolbar: {},
  ActionSheetController: class ActionSheetController {},
  AlertController: class AlertController {},
  ModalController: class ModalController {},
  PopoverController: class PopoverController {},
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { shouldAutoReveal } from './estimating.page';

describe('EstimatingPage', () => {
  describe('shouldAutoReveal', () => {
    it('returns false when no round', () => {
      expect(shouldAutoReveal(null, new Set(['voter1']))).toBe(false);
      expect(shouldAutoReveal(undefined, new Set(['voter1']))).toBe(false);
    });

    it('returns false when round already revealed', () => {
      const round = {
        id: 'r1',
        revealedAt: 1000,
        votes: { voter1: 'card1' },
      };
      expect(shouldAutoReveal(round, new Set(['voter1']))).toBe(false);
    });

    it('returns false when zero online voters (all viewers)', () => {
      const round = {
        id: 'r1',
        votes: { viewer1: 'card1' },
      };
      expect(shouldAutoReveal(round, new Set())).toBe(false);
    });

    it('returns false when not all voters have voted', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'card1' },
      };
      // 2 online voters but only 1 has voted
      expect(shouldAutoReveal(round, new Set(['voter1', 'voter2']))).toBe(false);
    });

    it('returns true when all online voters have voted', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'card1', voter2: 'card2' },
      };
      expect(shouldAutoReveal(round, new Set(['voter1', 'voter2']))).toBe(true);
    });

    it('ignores non-voter participants in the vote count', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'card1', viewer1: 'card1' },
      };
      // Only 1 voter online; voter1 has voted, so should reveal
      expect(shouldAutoReveal(round, new Set(['voter1']))).toBe(true);
    });

    it('returns true when single voter has voted', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'card1' },
      };
      expect(shouldAutoReveal(round, new Set(['voter1']))).toBe(true);
    });

    it('returns false when round already skipped', () => {
      const round = {
        id: 'r1',
        skippedAt: 1000,
        votes: { voter1: 'card1' },
      };
      expect(shouldAutoReveal(round, new Set(['voter1']))).toBe(false);
    });

    // ADR-0041: abstain denominator
    it('fires when 1 of 2 online voters abstains and the other has a numeric vote', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'card1', voter2: 'hnch_abstain' },
      };
      expect(shouldAutoReveal(round, new Set(['voter1', 'voter2']))).toBe(true);
    });

    it('does NOT fire when all online voters abstained (denominator 0)', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'hnch_abstain', voter2: 'hnch_abstain' },
      };
      expect(shouldAutoReveal(round, new Set(['voter1', 'voter2']))).toBe(false);
    });

    it('does NOT fire when 1 abstains, 1 votes, and 1 has not voted yet', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'hnch_abstain', voter2: 'card5' },
      };
      // voter3 is online but has no vote yet
      expect(shouldAutoReveal(round, new Set(['voter1', 'voter2', 'voter3']))).toBe(false);
    });

    it('fires when only non-abstain voters have voted (zero abstainers)', () => {
      // existing behaviour unchanged with 0 abstainers
      const round = {
        id: 'r1',
        votes: { voter1: 'card1', voter2: 'card2', voter3: 'card3' },
      };
      expect(shouldAutoReveal(round, new Set(['voter1', 'voter2', 'voter3']))).toBe(true);
    });
  });

  describe('prefers-reduced-motion', () => {
    const sourceFile = readFileSync('./src/app/estimating/estimating.page.ts', 'utf-8');

    it('contains @media (prefers-reduced-motion: reduce) block for card transition', () => {
      // The page's styles should include a media query that disables
      // the card press transition when reduced motion is preferred.
      expect(sourceFile).toContain('@media (prefers-reduced-motion: reduce)');
      expect(sourceFile).toContain('transition: none;');
    });

    it('card press transition disabled under reduced motion', () => {
      // The .card element's transition is disabled when prefers-reduced-motion.
      const mediaBlock = sourceFile.match(
        /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\.card\s*{[\s\S]*?transition:\s*none/,
      );
      expect(mediaBlock).toBeTruthy();
    });
  });
});
