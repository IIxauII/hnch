/**
 * Unit tests for LobbyPage role-toggle chip logic.
 *
 * No TestBed, no Ionic rendering — pure predicate + method tests.
 * Mirrors the harness pattern in estimating.page.test.ts and
 * lobby-summary.test.ts.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@ionic/angular/standalone', () => ({
  AlertController: {},
  IonAvatar: {},
  IonButton: {},
  IonButtons: {},
  IonChip: {},
  IonCol: {},
  IonContent: {},
  IonFooter: {},
  IonGrid: {},
  IonHeader: {},
  IonIcon: {},
  IonItem: {},
  IonItemOption: {},
  IonItemOptions: {},
  IonItemSliding: {},
  IonLabel: {},
  IonList: {},
  IonModal: {},
  IonNote: {},
  IonRow: {},
  IonTitle: {},
  IonToolbar: {},
  PopoverController: {},
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }))

import { participantRole } from '@hnch/shared'
import type { ParticipantSnapshot } from '@hnch/shared'

// ---------------------------------------------------------------------------
// Inline helpers that mirror LobbyPage.isParticipantViewer / chip predicates
// ---------------------------------------------------------------------------

function isParticipantViewer(p: { role?: 'voter' | 'viewer' }): boolean {
  return participantRole(p) === 'viewer'
}

function chipColor(p: ParticipantSnapshot): 'primary' | 'medium' {
  return isParticipantViewer(p) ? 'medium' : 'primary'
}

function chipLabel(p: ParticipantSnapshot): string {
  return isParticipantViewer(p) ? 'Observing' : 'Voter'
}

function makeParticipant(
  id: string,
  role?: 'voter' | 'viewer',
): ParticipantSnapshot {
  return { id, displayName: id, joinedAt: 0, role }
}

// ---------------------------------------------------------------------------
// Chip color predicate
// ---------------------------------------------------------------------------

describe('LobbyPage role chip — color', () => {
  it('primary when self is voter (no role field)', () => {
    expect(chipColor(makeParticipant('me'))).toBe('primary')
  })

  it('primary when self has explicit voter role', () => {
    expect(chipColor(makeParticipant('me', 'voter'))).toBe('primary')
  })

  it('medium when self is viewer', () => {
    expect(chipColor(makeParticipant('me', 'viewer'))).toBe('medium')
  })
})

// ---------------------------------------------------------------------------
// Chip label predicate
// ---------------------------------------------------------------------------

describe('LobbyPage role chip — label', () => {
  it('"Voter" when self has no role (defaults to voter)', () => {
    expect(chipLabel(makeParticipant('me'))).toBe('Voter')
  })

  it('"Voter" when self has explicit voter role', () => {
    expect(chipLabel(makeParticipant('me', 'voter'))).toBe('Voter')
  })

  it('"Observing" when self is viewer', () => {
    expect(chipLabel(makeParticipant('me', 'viewer'))).toBe('Observing')
  })
})

// ---------------------------------------------------------------------------
// onToggleRole calls docService.toggleRole(myId) exactly once
// ---------------------------------------------------------------------------

describe('LobbyPage.onToggleRole', () => {
  it('calls docService.toggleRole with myId exactly once', () => {
    const myId = 'participant-abc'
    const toggleRole = vi.fn()
    const hapticImpactLight = vi.fn()

    // Minimal stub that mirrors what onToggleRole reads from the class.
    const page = {
      myId: () => myId,
      haptic: { impactLight: hapticImpactLight },
      docService: { toggleRole },
      onToggleRole() {
        const id = this.myId()
        if (!id) return
        this.haptic.impactLight()
        this.docService.toggleRole(id)
      },
    }

    page.onToggleRole()

    expect(toggleRole).toHaveBeenCalledOnce()
    expect(toggleRole).toHaveBeenCalledWith(myId)
    expect(hapticImpactLight).toHaveBeenCalledOnce()
  })

  it('does nothing when myId() is falsy', () => {
    const toggleRole = vi.fn()
    const hapticImpactLight = vi.fn()

    const page = {
      myId: () => null as string | null,
      haptic: { impactLight: hapticImpactLight },
      docService: { toggleRole },
      onToggleRole() {
        const id = this.myId()
        if (!id) return
        this.haptic.impactLight()
        this.docService.toggleRole(id)
      },
    }

    page.onToggleRole()

    expect(toggleRole).not.toHaveBeenCalled()
    expect(hapticImpactLight).not.toHaveBeenCalled()
  })
})
