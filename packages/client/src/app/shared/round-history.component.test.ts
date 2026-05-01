/**
 * Unit tests for RoundHistoryComponent ticketId rendering.
 *
 * Uses source-file inspection (same pattern as vote-results.component.test.ts)
 * plus computed-signal testing for the HistoryEntry ticketId field.
 */

import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const sourceFile = readFileSync(
  './src/app/shared/round-history.component.ts',
  'utf-8',
)

describe('RoundHistoryComponent', () => {
  describe('template: ticketId rendering', () => {
    it('renders an <a target="_blank"> for URL ticketId', () => {
      // Template must contain target="_blank" inside the ticketId block
      expect(sourceFile).toContain('target="_blank"')
      expect(sourceFile).toContain('rel="noopener noreferrer"')
      expect(sourceFile).toContain('round-ticket')
    })

    it('renders a <code> for plain ticketId', () => {
      expect(sourceFile).toContain('<code class="round-ticket">')
    })

    it('uses @if (entry.ticketId) guard so absent ticketId renders nothing', () => {
      expect(sourceFile).toContain('@if (entry.ticketId)')
    })
  })

  describe('entries() computed: ticketId propagation', () => {
    it('includes ticketId in the return object', () => {
      // The mapped return object must spread ticketId from round
      expect(sourceFile).toContain('ticketId: round.ticketId')
    })

    it('HistoryEntry interface includes ticketId field', () => {
      expect(sourceFile).toContain('readonly ticketId: string | undefined')
    })
  })

  describe('isUrl delegation', () => {
    it('imports isLikelyUrl from @hnch/shared', () => {
      expect(sourceFile).toContain("import { isLikelyUrl } from '@hnch/shared'")
    })

    it('exposes isUrl as protected class member', () => {
      expect(sourceFile).toContain('protected readonly isUrl = isLikelyUrl')
    })
  })
})
