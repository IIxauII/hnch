/**
 * Tests for ConnectionStatusBannerComponent.
 *
 * JSDOM does not render Ionic components, so we assert against the
 * TypeScript source directly — the same pattern used by
 * vote-results.component.test.ts.
 */

import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

describe('ConnectionStatusBannerComponent', () => {
  const sourceFile = readFileSync(
    './src/app/shared/connection-status-banner.component.ts',
    'utf-8',
  )

  it('has aria-live="polite" on the ion-chip', () => {
    expect(sourceFile).toContain('aria-live="polite"')
  })

  it('has role="status" on the ion-chip', () => {
    expect(sourceFile).toContain('role="status"')
  })

  it('has data-testid="connection-status-banner" on the ion-chip', () => {
    expect(sourceFile).toContain('data-testid="connection-status-banner"')
  })

  it('uses color="warning" on ion-chip', () => {
    expect(sourceFile).toContain('color="warning"')
  })

  it('uses ChangeDetectionStrategy.OnPush', () => {
    expect(sourceFile).toContain('ChangeDetectionStrategy.OnPush')
  })

  it('has selector app-connection-status-banner', () => {
    expect(sourceFile).toContain("selector: 'app-connection-status-banner'")
  })
})
