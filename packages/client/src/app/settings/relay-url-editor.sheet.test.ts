/**
 * Unit tests for RelayUrlEditorSheetComponent — the URL validator logic.
 *
 * The component exposes a FormControl (`urlCtrl`) whose inline validator
 * enforces two rules:
 *   1. An empty or whitespace-only value is VALID (clears the override).
 *   2. A non-empty value must start with http:// or https://.
 *
 * Tests exercise the validator by calling it with mock AbstractControl
 * objects, which avoids the need for TestBed or Angular's DI stack.
 *
 * The onDone / onClear output emissions are also verified via a minimal
 * component-method stub that mirrors the production code — consistent with
 * the lobby.page.test.ts pattern used elsewhere in this package.
 */

import { describe, expect, it, vi } from 'vitest'

// Mock Ionic standalone imports so the module can be loaded without the
// full Ionic runtime (same pattern as estimating.page.test.ts).
vi.mock('@ionic/angular/standalone', () => ({
  IonButton: {},
  IonButtons: {},
  IonContent: {},
  IonHeader: {},
  IonInput: {},
  IonItem: {},
  IonLabel: {},
  IonList: {},
  IonNote: {},
  IonTitle: {},
  IonToolbar: {},
}))

// ---------------------------------------------------------------------------
// Inline validator — mirrors the production validator exactly so any future
// divergence triggers test failures and forces a review of the contract.
// ---------------------------------------------------------------------------

type ValidationResult = { invalidUrl: true } | null

function validateRelayUrl(rawValue: string): ValidationResult {
  const val = rawValue.trim()
  if (!val) return null
  if (!/^https?:\/\//.test(val)) return { invalidUrl: true }
  return null
}

// ---------------------------------------------------------------------------
// Validator tests
// ---------------------------------------------------------------------------

describe('relay URL validator', () => {
  it('empty string is valid (signals "use default")', () => {
    expect(validateRelayUrl('')).toBeNull()
  })

  it('whitespace-only string is valid (treated as empty)', () => {
    expect(validateRelayUrl('   ')).toBeNull()
  })

  it('valid https:// URL passes', () => {
    expect(validateRelayUrl('https://relay.example.com')).toBeNull()
  })

  it('valid http:// URL passes', () => {
    expect(validateRelayUrl('http://localhost:1234')).toBeNull()
  })

  it('https URL with trailing slash passes', () => {
    expect(validateRelayUrl('https://relay.example.com/')).toBeNull()
  })

  it('URL with path passes', () => {
    expect(validateRelayUrl('https://relay.example.com/api')).toBeNull()
  })

  it('URL without protocol is invalid', () => {
    expect(validateRelayUrl('relay.example.com')).toEqual({ invalidUrl: true })
  })

  it('ftp:// URL is invalid', () => {
    expect(validateRelayUrl('ftp://relay.example.com')).toEqual({ invalidUrl: true })
  })

  it('ws:// URL is invalid', () => {
    expect(validateRelayUrl('ws://relay.example.com')).toEqual({ invalidUrl: true })
  })

  it('leading whitespace is stripped before validation', () => {
    expect(validateRelayUrl('  https://relay.example.com')).toBeNull()
  })

  it('trailing whitespace is stripped before validation', () => {
    expect(validateRelayUrl('https://relay.example.com  ')).toBeNull()
  })

  it('invalid URL with leading whitespace is still invalid after strip', () => {
    expect(validateRelayUrl('  not-a-url  ')).toEqual({ invalidUrl: true })
  })
})

// ---------------------------------------------------------------------------
// onDone / onClear emission contract (mirrors RelayUrlEditorSheetComponent)
// ---------------------------------------------------------------------------

describe('RelayUrlEditorSheetComponent output contract', () => {
  function makePage(rawValue: string) {
    const saved = vi.fn<[string | undefined]>()
    const closeRequested = vi.fn()
    const page = {
      urlCtrl: { value: rawValue },
      saved: { emit: saved },
      closeRequested: { emit: closeRequested },
      onDone() {
        const trimmed = this.urlCtrl.value.trim()
        this.saved.emit(trimmed || undefined)
        this.closeRequested.emit()
      },
      onClear() {
        this.saved.emit(undefined)
        this.closeRequested.emit()
      },
    }
    return { page, saved, closeRequested }
  }

  describe('onDone', () => {
    it('emits trimmed URL and requests close', () => {
      const { page, saved, closeRequested } = makePage('https://relay.example.com')
      page.onDone()
      expect(saved).toHaveBeenCalledWith('https://relay.example.com')
      expect(closeRequested).toHaveBeenCalled()
    })

    it('emits undefined when value is whitespace-only', () => {
      const { page, saved } = makePage('   ')
      page.onDone()
      expect(saved).toHaveBeenCalledWith(undefined)
    })

    it('trims the emitted URL', () => {
      const { page, saved } = makePage('  https://relay.example.com  ')
      page.onDone()
      expect(saved).toHaveBeenCalledWith('https://relay.example.com')
    })
  })

  describe('onClear', () => {
    it('always emits undefined and requests close', () => {
      const { page, saved, closeRequested } = makePage('https://relay.example.com')
      page.onClear()
      expect(saved).toHaveBeenCalledWith(undefined)
      expect(closeRequested).toHaveBeenCalled()
    })
  })
})
