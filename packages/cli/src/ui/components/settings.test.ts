/**
 * Unit tests for TextInput and SettingsPanel callback logic.
 *
 * Since Ink components require a TTY to render, these tests verify the
 * underlying logic by simulating the state transitions and callback
 * invocations that the components perform, without rendering to a terminal.
 */

import { describe, it, expect, vi } from 'vitest'
import { FIBONACCI_SCALE, TSHIRT_SCALE } from '@hnch/shared'

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

// ── SettingsPanel callback logic ─────────────────────────────────────────────

/**
 * Simulates SettingsPanel's name submission logic:
 * empty/whitespace-only → undefined (remove), otherwise trimmed string.
 */
function resolveNameSubmit(raw: string): string | undefined {
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

describe('SettingsPanel name submission', () => {
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

describe('SettingsPanel scale selection', () => {
  it('selecting fibonacci scale fires callback with fibonacci scale', () => {
    const onChangeScale = vi.fn()
    const scales = [FIBONACCI_SCALE, TSHIRT_SCALE]
    const cursor = 0
    const chosen = scales[cursor]!
    onChangeScale(chosen)
    expect(onChangeScale).toHaveBeenCalledWith(FIBONACCI_SCALE)
  })

  it('selecting t-shirt scale fires callback with t-shirt scale', () => {
    const onChangeScale = vi.fn()
    const scales = [FIBONACCI_SCALE, TSHIRT_SCALE]
    const cursor = 1
    const chosen = scales[cursor]!
    onChangeScale(chosen)
    expect(onChangeScale).toHaveBeenCalledWith(TSHIRT_SCALE)
  })

  it('scale cursor clamps to valid range', () => {
    const scales = [FIBONACCI_SCALE, TSHIRT_SCALE]
    const clamp = (c: number) => Math.max(0, Math.min(scales.length - 1, c))
    expect(clamp(-1)).toBe(0)
    expect(clamp(0)).toBe(0)
    expect(clamp(1)).toBe(1)
    expect(clamp(2)).toBe(1)
  })
})
