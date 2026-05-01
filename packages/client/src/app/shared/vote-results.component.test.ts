/**
 * Tests for VoteResultsComponent accessibility and structure.
 *
 * Because JSDOM doesn't evaluate CSS media queries or Angular templates at
 * build time, we test by reading the source file and asserting on substrings.
 */

import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

describe('VoteResultsComponent', () => {
  const sourceFile = readFileSync(
    './src/app/shared/vote-results.component.ts',
    'utf-8',
  )

  describe('prefers-reduced-motion', () => {
    it('contains @media (prefers-reduced-motion: reduce) block for reveal stagger', () => {
      expect(sourceFile).toContain('@media (prefers-reduced-motion: reduce)')
      const mediaBlock = sourceFile.match(
        /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\.group\s*{[\s\S]*?animation:\s*none/,
      )
      expect(mediaBlock).toBeTruthy()
    })

    it('consensus overlay animation respects prefers-reduced-motion', () => {
      expect(sourceFile).toContain('@keyframes consensusScaleIn')
      expect(sourceFile).toContain('@keyframes consensusPulse')
      const mediaBlock = sourceFile.match(
        /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\.consensus-text\s*{[\s\S]*?animation:\s*none/,
      )
      expect(mediaBlock).toBeTruthy()
    })
  })

  describe('computeRoundStats migration', () => {
    it('imports computeRoundStats from @hnch/shared', () => {
      expect(sourceFile).toContain("computeRoundStats")
      expect(sourceFile).toContain('@hnch/shared')
      // Both on the same import line
      const importLine = sourceFile
        .split('\n')
        .find((l) => l.includes('computeRoundStats'))
      expect(importLine).toBeTruthy()
      expect(importLine).toContain('@hnch/shared')
    })

    it('contains @switch (s.kind) block and spreadColor method', () => {
      expect(sourceFile).toContain('@switch (s.kind)')
      expect(sourceFile).toContain("spreadColor(")
      expect(sourceFile).toContain("spreadDisplay(")
    })

    it('contains categorical Most common branch', () => {
      expect(sourceFile).toContain("Most common:")
      expect(sourceFile).toContain("@case ('categorical')")
    })

    it('stats block appears before elapsed block in template', () => {
      const statsIdx = sourceFile.indexOf('<div class="stats"')
      const elapsedIdx = sourceFile.indexOf('<p class="elapsed"')
      expect(statsIdx).toBeGreaterThan(-1)
      expect(elapsedIdx).toBeGreaterThan(-1)
      expect(statsIdx).toBeLessThan(elapsedIdx)
    })
  })
})
