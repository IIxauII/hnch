import { describe, expect, it, vi, afterEach } from 'vitest'

import { getSheetBreakpoints, getSheetInitialBreakpoint, getTallSheetBreakpoints, getTallSheetInitialBreakpoint, presentSheet } from './present-sheet'

function makeModal(dismissData: { data?: unknown; role?: string } = {}): {
  present: ReturnType<typeof vi.fn>
  onDidDismiss: ReturnType<typeof vi.fn>
} {
  return {
    present: vi.fn().mockResolvedValue(undefined),
    onDidDismiss: vi.fn().mockResolvedValue(dismissData),
  }
}

describe('presentSheet', () => {
  it('restores focus to the previously focused element after dismiss', async () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    expect(document.activeElement).toBe(button)

    const modal = makeModal()
    await presentSheet({ modal: modal as any })

    expect(document.activeElement).toBe(button)
    document.body.removeChild(button)
  })

  it('returns the didDismiss result', async () => {
    const modal = makeModal({ data: { foo: 'bar' }, role: 'confirm' })
    const result = await presentSheet({ modal: modal as any })
    expect(result).toEqual({ data: { foo: 'bar' }, role: 'confirm' })
  })

  it('calls present() then onDidDismiss() in order', async () => {
    const order: string[] = []
    const modal = {
      present: vi.fn().mockImplementation(async () => { order.push('present') }),
      onDidDismiss: vi.fn().mockImplementation(async () => { order.push('dismiss'); return {} }),
    }
    await presentSheet({ modal: modal as any })
    expect(order).toEqual(['present', 'dismiss'])
  })

  it('does not throw when invoking element removed before dismiss', async () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()

    // Remove from DOM before dismiss fires.
    document.body.removeChild(button)

    const modal = makeModal()
    await expect(presentSheet({ modal: modal as any })).resolves.not.toThrow()
  })

  it('does not throw when no element was focused', async () => {
    // Blur any active element.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    const modal = makeModal()
    await expect(presentSheet({ modal: modal as any })).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// getSheetBreakpoints / getSheetInitialBreakpoint
// ---------------------------------------------------------------------------

function mockMatchMedia(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query === '(min-width: 1024px)' ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('getSheetBreakpoints', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [0, 0.6, 0.95] on mobile (matches = false)', () => {
    mockMatchMedia(false)
    expect(getSheetBreakpoints()).toEqual([0, 0.6, 0.95])
  })

  it('returns undefined on desktop (matches = true)', () => {
    mockMatchMedia(true)
    expect(getSheetBreakpoints()).toBeUndefined()
  })
})

describe('getSheetInitialBreakpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 0.6 on mobile (matches = false)', () => {
    mockMatchMedia(false)
    expect(getSheetInitialBreakpoint()).toBe(0.6)
  })

  it('returns undefined on desktop (matches = true)', () => {
    mockMatchMedia(true)
    expect(getSheetInitialBreakpoint()).toBeUndefined()
  })
})

describe('getTallSheetBreakpoints', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [0, 0.6, 1] on mobile (matches = false)', () => {
    mockMatchMedia(false)
    expect(getTallSheetBreakpoints()).toEqual([0, 0.6, 1])
  })

  it('returns undefined on desktop (matches = true)', () => {
    mockMatchMedia(true)
    expect(getTallSheetBreakpoints()).toBeUndefined()
  })
})

describe('getTallSheetInitialBreakpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 1 on mobile (matches = false)', () => {
    mockMatchMedia(false)
    expect(getTallSheetInitialBreakpoint()).toBe(1)
  })

  it('returns undefined on desktop (matches = true)', () => {
    mockMatchMedia(true)
    expect(getTallSheetInitialBreakpoint()).toBeUndefined()
  })
})
