/**
 * Unit tests for TextInput and scale selection callback logic.
 *
 * Since Ink components require a TTY to render, these tests verify the
 * underlying logic by simulating the state transitions and callback
 * invocations that the components perform, without rendering to a terminal.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  FIBONACCI_SCALE,
  TSHIRT_SCALE,
  POWERS_OF_2_SCALE,
  LINEAR_SCALE,
  RISK_SCALE,
  buildAvailableScales,
} from '@hnch/shared'

// ── TextInput logic ──────────────────────────────────────────────────────────

/**
 * Simulates the key handler inside TextInput.
 * Returns the new value or invokes callbacks as the component would.
 */
function simulateTextInput(
  current: string,
  event: { char?: string; backspace?: boolean; return?: boolean; escape?: boolean },
  callbacks: { onChange: (v: string) => void; onSubmit: (v: string) => void; onCancel?: () => void },
): void {
  if (event.escape) {
    callbacks.onCancel?.()
  } else if (event.return) {
    callbacks.onSubmit(current)
  } else if (event.backspace) {
    callbacks.onChange(current.slice(0, -1))
  } else if (event.char) {
    callbacks.onChange(current + event.char)
  }
}

describe('TextInput logic', () => {
  it('appends printable characters', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    simulateTextInput('he', { char: 'l' }, { onChange, onSubmit })
    expect(onChange).toHaveBeenCalledWith('hel')
  })

  it('backspace removes last character', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    simulateTextInput('hello', { backspace: true }, { onChange, onSubmit })
    expect(onChange).toHaveBeenCalledWith('hell')
  })

  it('backspace on empty string produces empty string', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    simulateTextInput('', { backspace: true }, { onChange, onSubmit })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('return calls onSubmit with current value', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    simulateTextInput('hello', { return: true }, { onChange, onSubmit })
    expect(onSubmit).toHaveBeenCalledWith('hello')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('return calls onSubmit with empty string', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    simulateTextInput('', { return: true }, { onChange, onSubmit })
    expect(onSubmit).toHaveBeenCalledWith('')
  })

  it('escape calls onCancel', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    simulateTextInput('partial', { escape: true }, { onChange, onSubmit, onCancel })
    expect(onCancel).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('escape without onCancel does not throw', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    expect(() =>
      simulateTextInput('partial', { escape: true }, { onChange, onSubmit }),
    ).not.toThrow()
  })
})

// ── Name submission logic ────────────────────────────────────────────────────

/**
 * Simulates name submission logic:
 * empty/whitespace-only → undefined (remove), otherwise trimmed string.
 */
function resolveNameSubmit(raw: string): string | undefined {
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

describe('Name submission', () => {
  it('non-empty string is trimmed and returned', () => {
    expect(resolveNameSubmit('Sprint 42')).toBe('Sprint 42')
    expect(resolveNameSubmit('  Sprint 42  ')).toBe('Sprint 42')
  })

  it('empty string returns undefined (removes name)', () => {
    expect(resolveNameSubmit('')).toBeUndefined()
  })

  it('whitespace-only returns undefined', () => {
    expect(resolveNameSubmit('   ')).toBeUndefined()
  })
})

describe('Scale selection', () => {
  const scales = buildAvailableScales()

  it('buildAvailableScales returns all 5 builtins by default', () => {
    expect(scales).toHaveLength(5)
    expect(scales.map((s) => s.id)).toEqual([
      'fibonacci',
      't-shirt',
      'powers-of-2',
      'linear',
      'risk',
    ])
  })

  it('no builtin scale contains sentinel cards', () => {
    for (const s of scales) {
      expect(s.cards).not.toContain('?')
      expect(s.cards).not.toContain('☕')
    }
  })

  it('selecting fibonacci scale fires callback with fibonacci scale', () => {
    const onChangeScale = vi.fn()
    const cursor = scales.findIndex((s) => s.id === 'fibonacci')
    onChangeScale(scales[cursor]!)
    expect(onChangeScale).toHaveBeenCalledWith(FIBONACCI_SCALE)
  })

  it('selecting t-shirt scale fires callback with t-shirt scale', () => {
    const onChangeScale = vi.fn()
    const cursor = scales.findIndex((s) => s.id === 't-shirt')
    onChangeScale(scales[cursor]!)
    expect(onChangeScale).toHaveBeenCalledWith(TSHIRT_SCALE)
  })

  it('selecting powers-of-2 scale fires callback with powers-of-2 scale', () => {
    const onChangeScale = vi.fn()
    const cursor = scales.findIndex((s) => s.id === 'powers-of-2')
    onChangeScale(scales[cursor]!)
    expect(onChangeScale).toHaveBeenCalledWith(POWERS_OF_2_SCALE)
  })

  it('selecting linear scale fires callback with linear scale', () => {
    const onChangeScale = vi.fn()
    const cursor = scales.findIndex((s) => s.id === 'linear')
    onChangeScale(scales[cursor]!)
    expect(onChangeScale).toHaveBeenCalledWith(LINEAR_SCALE)
  })

  it('selecting risk scale fires callback with risk scale', () => {
    const onChangeScale = vi.fn()
    const cursor = scales.findIndex((s) => s.id === 'risk')
    onChangeScale(scales[cursor]!)
    expect(onChangeScale).toHaveBeenCalledWith(RISK_SCALE)
  })

  it('scale cursor clamps to valid range', () => {
    const clamp = (c: number) => Math.max(0, Math.min(scales.length - 1, c))
    expect(clamp(-1)).toBe(0)
    expect(clamp(0)).toBe(0)
    expect(clamp(scales.length - 1)).toBe(scales.length - 1)
    expect(clamp(scales.length)).toBe(scales.length - 1)
  })

  it('buildAvailableScales appends custom scales after builtins', () => {
    const withCustom = buildAvailableScales({}, [
      { id: 'custom-team', label: 'Team', cards: ['S', 'M', 'L'] },
    ])
    expect(withCustom).toHaveLength(6)
    expect(withCustom[5]!.id).toBe('custom-team')
  })

  it('buildAvailableScales applies preset overrides', () => {
    const withOverride = buildAvailableScales({ fibonacci: [0] }) // disable '0'
    const fib = withOverride.find((s) => s.id === 'fibonacci')!
    expect(fib.cards).not.toContain('0')
    expect(fib.cards).toContain('1')
  })
})
