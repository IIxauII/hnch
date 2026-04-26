/**
 * Tests for EstimatingPage accessibility and auto-reveal logic.
 */

import { readFileSync } from 'fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@ionic/angular/standalone', () => ({
  IonBackButton: {},
  IonButton: {},
  IonButtons: {},
  IonCard: {},
  IonCardContent: {},
  IonChip: {},
  IonContent: {},
  IonFooter: {},
  IonHeader: {},
  IonIcon: {},
  IonLabel: {},
  IonTitle: {},
  IonToast: {},
  IonToolbar: {},
  ActionSheetController: {},
  AlertController: {},
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

import { shouldAutoReveal } from './estimating.page'

describe('EstimatingPage', () => {
  describe('shouldAutoReveal', () => {
    it('returns false when no round', () => {
      expect(shouldAutoReveal(null, new Set(['voter1']))).toBe(false)
      expect(shouldAutoReveal(undefined, new Set(['voter1']))).toBe(false)
    })

    it('returns false when round already revealed', () => {
      const round = {
        id: 'r1',
        revealedAt: 1000,
        votes: { voter1: 'card1' },
      }
      expect(shouldAutoReveal(round, new Set(['voter1']))).toBe(false)
    })

    it('returns false when zero online voters (all viewers)', () => {
      const round = {
        id: 'r1',
        votes: { viewer1: 'card1' },
      }
      expect(shouldAutoReveal(round, new Set())).toBe(false)
    })

    it('returns false when not all voters have voted', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'card1' },
      }
      // 2 online voters but only 1 has voted
      expect(shouldAutoReveal(round, new Set(['voter1', 'voter2']))).toBe(false)
    })

    it('returns true when all online voters have voted', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'card1', voter2: 'card2' },
      }
      expect(shouldAutoReveal(round, new Set(['voter1', 'voter2']))).toBe(true)
    })

    it('ignores non-voter participants in the vote count', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'card1', viewer1: 'card1' },
      }
      // Only 1 voter online; voter1 has voted, so should reveal
      expect(shouldAutoReveal(round, new Set(['voter1']))).toBe(true)
    })

    it('returns true when single voter has voted', () => {
      const round = {
        id: 'r1',
        votes: { voter1: 'card1' },
      }
      expect(shouldAutoReveal(round, new Set(['voter1']))).toBe(true)
    })
  })

  describe('prefers-reduced-motion', () => {
    const sourceFile = readFileSync(
      './src/app/estimating/estimating.page.ts',
      'utf-8',
    )

    it('contains @media (prefers-reduced-motion: reduce) block for card transition', () => {
      // The page's styles should include a media query that disables
      // the card press transition when reduced motion is preferred.
      expect(sourceFile).toContain('@media (prefers-reduced-motion: reduce)')
      expect(sourceFile).toContain('transition: none;')
    })

    it('card press transition disabled under reduced motion', () => {
      // The .card element's transition is disabled when prefers-reduced-motion.
      const mediaBlock = sourceFile.match(
        /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\.card\s*{[\s\S]*?transition:\s*none/,
      )
      expect(mediaBlock).toBeTruthy()
    })
  })
})
