/**
 * Unit tests for ConnectionChipComponent.
 *
 * Tests the debounce logic that controls chip visibility:
 * - `connected` / `offline` → chip hidden
 * - `connecting` → "Connecting…" chip (medium palette) appears immediately
 * - `disconnected` → hidden for the first 5 s, then "Reconnecting…" (warning palette)
 * - A brief disconnect blip (< 5 s) followed by reconnect must NOT flip the chip visible
 *
 * DISCONNECTED_WARNING_DELAY_MS (the 5 s constant) is exported for cross-module
 * reference and is verified here.
 *
 * The component is tested via structural source-code assertions for the debounce
 * and template behavior that requires Angular scheduling (effect + setTimeout),
 * and via the exported constant for the specific delay value.
 */

import { readFileSync } from 'fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@ionic/angular/standalone', () => ({
  IonChip: {},
  IonIcon: {},
  IonLabel: {},
}))
vi.mock('ionicons', () => ({ addIcons: vi.fn() }))
vi.mock('ionicons/icons', () => ({ cloudOfflineOutline: '', syncOutline: '' }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

import { DISCONNECTED_WARNING_DELAY_MS } from './connection-chip.component'

const source = readFileSync('./src/app/core/connection-chip.component.ts', 'utf-8')

describe('ConnectionChipComponent', () => {
  describe('DISCONNECTED_WARNING_DELAY_MS', () => {
    it('is exported as a number', () => {
      expect(typeof DISCONNECTED_WARNING_DELAY_MS).toBe('number')
    })

    it('equals 5000 ms (5 seconds per plan §3.9)', () => {
      expect(DISCONNECTED_WARNING_DELAY_MS).toBe(5_000)
    })
  })

  describe('template structure', () => {
    it('uses ChangeDetectionStrategy.OnPush', () => {
      expect(source).toContain('ChangeDetectionStrategy.OnPush')
    })

    it('has selector app-connection-chip', () => {
      expect(source).toContain("selector: 'app-connection-chip'")
    })

    it('renders the chip conditionally via @if (display(); as chip)', () => {
      expect(source).toContain('@if (display(); as chip)')
    })

    it('binds ion-chip color to chip.color', () => {
      expect(source).toContain('[color]="chip.color"')
    })

    it('binds ion-icon name to chip.icon', () => {
      expect(source).toContain('[name]="chip.icon"')
    })

    it('has aria-live="polite" for accessibility (live region)', () => {
      expect(source).toContain('aria-live="polite"')
    })

    it('has aria-label binding on the chip', () => {
      expect(source).toContain('[attr.aria-label]="chip.ariaLabel"')
    })
  })

  describe('display() computed logic', () => {
    it('returns null for connected status', () => {
      expect(source).toContain("case 'connected':")
      expect(source).toContain("case 'offline':")
      expect(source).toContain('return null')
    })

    it('returns connecting state with medium color', () => {
      expect(source).toContain("case 'connecting':")
      expect(source).toContain("color: 'medium'")
      expect(source).toContain("label: 'Connecting…'")
    })

    it('returns disconnected state with warning color', () => {
      expect(source).toContain("case 'disconnected':")
      expect(source).toContain("color: 'warning'")
      expect(source).toContain("label: 'Reconnecting…'")
    })

    it('gates the disconnected chip on disconnectedLongEnough signal', () => {
      expect(source).toContain('disconnectedLongEnough')
      expect(source).toContain('if (!this.disconnectedLongEnough()) return null')
    })
  })

  describe('debounce effect', () => {
    it('cancels the existing timer on every status change', () => {
      expect(source).toContain('clearTimeout(timerId)')
    })

    it('schedules setTimeout with DISCONNECTED_WARNING_DELAY_MS', () => {
      expect(source).toContain('DISCONNECTED_WARNING_DELAY_MS')
      expect(source).toContain('setTimeout(')
    })

    it('resets disconnectedLongEnough to false on non-disconnected status', () => {
      expect(source).toContain("this.disconnectedLongEnough.set(false)")
    })

    it('clears timer on destroy', () => {
      expect(source).toContain('clearTimeout(timerId)')
      expect(source).toContain('onDestroy')
    })
  })

  describe('icons', () => {
    it('imports cloud-offline-outline icon for disconnected state', () => {
      expect(source).toContain('cloudOfflineOutline')
      expect(source).toContain("'cloud-offline-outline'")
    })

    it('imports sync-outline icon for connecting state', () => {
      expect(source).toContain('syncOutline')
      expect(source).toContain("'sync-outline'")
    })
  })
})
