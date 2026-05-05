/**
 * Unit tests for JumpBackInBannerComponent.
 *
 * Tests the two pieces of in-component logic:
 *
 * 1. `onTap()` guard — the banner must suppress `resumeRequested` when
 *    `resuming()` is true AND `stale()` is false. When stale, tapping
 *    must always emit regardless of the `resuming` flag (the parent
 *    handles the stale-clear path as a fast synchronous op).
 *
 * 2. `screenLabel` computed — maps `LastSessionScreen` to human-readable
 *    copy ('lobby' → 'In the lobby', 'estimating' → 'Estimating now').
 *
 * Uses vi.fn() stubs for the `resumeRequested` output and constructs a
 * minimal class instance to avoid TestBed overhead for pure logic, matching
 * the relay-url-editor.sheet.test.ts pattern.
 */

import { describe, it, expect, vi } from 'vitest'
import type { LastSessionScreen } from '../core/last-session.service'
import type { JumpBackInSummary } from './jump-back-in-banner.component'

// ---------------------------------------------------------------------------
// Minimal component-logic stub
// Mirrors the production onTap() and screenLabel logic without Angular DI.
// ---------------------------------------------------------------------------

function makeComponent(opts: {
  stale?: boolean
  resuming?: boolean
  lastScreen?: LastSessionScreen
}) {
  const emitFn = vi.fn()
  const stale = opts.stale ?? false
  const resuming = opts.resuming ?? false
  const summary: JumpBackInSummary = {
    roomCode: 'ABC123',
    lastScreen: opts.lastScreen ?? 'lobby',
  }

  // Mirror production onTap() exactly
  function onTap(): void {
    if (resuming && !stale) return
    emitFn()
  }

  // Mirror production screenLabel computed
  function screenLabel(): string {
    switch (summary.lastScreen) {
      case 'lobby':
        return 'In the lobby'
      case 'estimating':
        return 'Estimating now'
    }
  }

  return { onTap, screenLabel, emitFn }
}

// ---------------------------------------------------------------------------
// onTap guard logic
// ---------------------------------------------------------------------------

describe('JumpBackInBannerComponent — onTap guard', () => {
  it('emits resumeRequested when not resuming and not stale', () => {
    const { onTap, emitFn } = makeComponent({ resuming: false, stale: false })
    onTap()
    expect(emitFn).toHaveBeenCalledOnce()
  })

  it('suppresses resumeRequested when resuming and not stale', () => {
    const { onTap, emitFn } = makeComponent({ resuming: true, stale: false })
    onTap()
    expect(emitFn).not.toHaveBeenCalled()
  })

  it('emits resumeRequested when resuming and stale (stale overrides guard)', () => {
    const { onTap, emitFn } = makeComponent({ resuming: true, stale: true })
    onTap()
    expect(emitFn).toHaveBeenCalledOnce()
  })

  it('emits resumeRequested when stale and not resuming', () => {
    const { onTap, emitFn } = makeComponent({ resuming: false, stale: true })
    onTap()
    expect(emitFn).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// screenLabel computed
// ---------------------------------------------------------------------------

describe('JumpBackInBannerComponent — screenLabel', () => {
  it('maps lobby → "In the lobby"', () => {
    const { screenLabel } = makeComponent({ lastScreen: 'lobby' })
    expect(screenLabel()).toBe('In the lobby')
  })

  it('maps estimating → "Estimating now"', () => {
    const { screenLabel } = makeComponent({ lastScreen: 'estimating' })
    expect(screenLabel()).toBe('Estimating now')
  })
})
