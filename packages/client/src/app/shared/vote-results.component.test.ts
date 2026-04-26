/**
 * Tests for VoteResultsComponent accessibility, specifically
 * prefers-reduced-motion support.
 *
 * The component uses CSS @media (prefers-reduced-motion: reduce) blocks
 * to disable animations. Since JSDOM doesn't evaluate CSS media queries,
 * we test by verifying the CSS source contains the expected blocks.
 */

import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

describe('VoteResultsComponent', () => {
  describe('prefers-reduced-motion', () => {
    const sourceFile = readFileSync(
      './src/app/shared/vote-results.component.ts',
      'utf-8',
    )

    it('contains @media (prefers-reduced-motion: reduce) block for reveal stagger', () => {
      // The component's styles should include a media query that disables
      // the fadeInUp stagger animation when reduced motion is preferred.
      expect(sourceFile).toContain('@media (prefers-reduced-motion: reduce)')
      // Verify the media query disables the .group animation
      const mediaBlock = sourceFile.match(
        /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\.group\s*{[\s\S]*?animation:\s*none/,
      )
      expect(mediaBlock).toBeTruthy()
    })

    it('consensus overlay animation respects prefers-reduced-motion', () => {
      // Consensus scale-in and pulse animations are disabled when
      // prefers-reduced-motion: reduce.
      // Verify both animation keyframes exist
      expect(sourceFile).toContain('@keyframes consensusScaleIn')
      expect(sourceFile).toContain('@keyframes consensusPulse')
      // Verify media query disables the .consensus-text animation
      const mediaBlock = sourceFile.match(
        /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\.consensus-text\s*{[\s\S]*?animation:\s*none/,
      )
      expect(mediaBlock).toBeTruthy()
    })
  })
})
