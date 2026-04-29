import { describe, it, expect } from 'vitest'
import {
  BUILTIN_SCALES,
  FIBONACCI_SCALE,
  TSHIRT_SCALE,
  POWERS_OF_2_SCALE,
  LINEAR_SCALE,
  RISK_SCALE,
  SCALE_DISPLAY_NAMES,
  formatScaleId,
  type AwarenessPayload,
  type Meta,
  type Participant,
  type Round,
  type Scale,
  type Settings,
} from './doc.js'

describe('builtin scales', () => {
  it('FIBONACCI_SCALE has the correct id and cards (no sentinels)', () => {
    expect(FIBONACCI_SCALE.id).toBe('fibonacci')
    expect(FIBONACCI_SCALE.cards).toEqual(['0', '1', '2', '3', '5', '8', '13', '21'])
    expect(FIBONACCI_SCALE.cards).not.toContain('?')
    expect(FIBONACCI_SCALE.cards).not.toContain('☕')
  })

  it('TSHIRT_SCALE has the correct id and cards (no sentinels)', () => {
    expect(TSHIRT_SCALE.id).toBe('t-shirt')
    expect(TSHIRT_SCALE.cards).toEqual(['XS', 'S', 'M', 'L', 'XL'])
    expect(TSHIRT_SCALE.cards).not.toContain('?')
    expect(TSHIRT_SCALE.cards).not.toContain('☕')
  })

  it('POWERS_OF_2_SCALE has the correct id and cards', () => {
    expect(POWERS_OF_2_SCALE.id).toBe('powers-of-2')
    expect(POWERS_OF_2_SCALE.cards).toEqual(['1', '2', '4', '8', '16', '32', '64'])
  })

  it('LINEAR_SCALE has the correct id and cards', () => {
    expect(LINEAR_SCALE.id).toBe('linear')
    expect(LINEAR_SCALE.cards).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  })

  it('RISK_SCALE has the correct id and cards', () => {
    expect(RISK_SCALE.id).toBe('risk')
    expect(RISK_SCALE.cards).toEqual(['Low', 'Medium', 'High', 'Critical'])
  })

  it('BUILTIN_SCALES indexes all five scales by id', () => {
    expect(BUILTIN_SCALES['fibonacci']).toBe(FIBONACCI_SCALE)
    expect(BUILTIN_SCALES['t-shirt']).toBe(TSHIRT_SCALE)
    expect(BUILTIN_SCALES['powers-of-2']).toBe(POWERS_OF_2_SCALE)
    expect(BUILTIN_SCALES['linear']).toBe(LINEAR_SCALE)
    expect(BUILTIN_SCALES['risk']).toBe(RISK_SCALE)
    expect(Object.keys(BUILTIN_SCALES)).toHaveLength(5)
  })

  it('no builtin scale contains sentinel cards', () => {
    for (const scale of Object.values(BUILTIN_SCALES)) {
      expect(scale.cards).not.toContain('?')
      expect(scale.cards).not.toContain('☕')
    }
  })
})

describe('SCALE_DISPLAY_NAMES', () => {
  it('has an entry for every key in BUILTIN_SCALES', () => {
    for (const id of Object.keys(BUILTIN_SCALES)) {
      expect(SCALE_DISPLAY_NAMES).toHaveProperty(id)
      expect(typeof SCALE_DISPLAY_NAMES[id]).toBe('string')
    }
  })

  it('returns expected labels for each builtin', () => {
    expect(SCALE_DISPLAY_NAMES['fibonacci']).toBe('Fibonacci')
    expect(SCALE_DISPLAY_NAMES['t-shirt']).toBe('T-shirt')
    expect(SCALE_DISPLAY_NAMES['powers-of-2']).toBe('Powers of 2')
    expect(SCALE_DISPLAY_NAMES['linear']).toBe('Linear (1–10)')
    expect(SCALE_DISPLAY_NAMES['risk']).toBe('Risk')
  })
})

describe('formatScaleId', () => {
  it('returns the display name for known builtin IDs', () => {
    expect(formatScaleId('fibonacci')).toBe('Fibonacci')
    expect(formatScaleId('t-shirt')).toBe('T-shirt')
    expect(formatScaleId('powers-of-2')).toBe('Powers of 2')
    expect(formatScaleId('linear')).toBe('Linear (1–10)')
    expect(formatScaleId('risk')).toBe('Risk')
  })

  it('strips the custom- prefix and title-cases for custom IDs', () => {
    expect(formatScaleId('custom-my-scale')).toBe('My Scale')
    expect(formatScaleId('custom-team-estimates')).toBe('Team Estimates')
  })

  it('title-cases hyphenated unknown IDs as fallback', () => {
    expect(formatScaleId('some-unknown-scale')).toBe('Some Unknown Scale')
  })

  it('returns empty string for empty input', () => {
    expect(formatScaleId('')).toBe('')
  })

  it('strips custom- prefix from a single-word custom ID', () => {
    expect(formatScaleId('custom-alpha')).toBe('Alpha')
  })

  it('returns empty string for bare custom- prefix with no suffix', () => {
    // 'custom-' → stripped = '' → split → [''] → map (length 0, passthrough) → ''
    expect(formatScaleId('custom-')).toBe('')
  })

  it('title-cases a single-word unknown ID with no hyphens', () => {
    expect(formatScaleId('velocity')).toBe('Velocity')
  })
})

describe('shape types', () => {
  // These are compile-time checks; the assertions just force evaluation.

  it('Settings has required and optional fields', () => {
    const settings: Settings = {
      defaultScale: FIBONACCI_SCALE,
      hostParticipantId: 'device-abc',
    }
    const named: Settings = {
      defaultScale: TSHIRT_SCALE,
      hostParticipantId: 'device-abc',
      name: 'Sprint 42 planning',
    }
    expect(settings.hostParticipantId).toBe('device-abc')
    expect(named.name).toBe('Sprint 42 planning')
  })

  it('Round.votes is keyed by participantId', () => {
    const round: Round = {
      id: 'r1',
      scale: FIBONACCI_SCALE,
      createdBy: 'device-abc',
      createdAt: Date.now(),
      votes: { 'device-abc': '5', 'device-def': '?' },
    }
    expect(round.votes['device-abc']).toBe('5')
  })

  it('Meta, Participant, and AwarenessPayload expose the documented fields', () => {
    const meta: Meta = {
      roomUuid: 'uuid-1',
      createdAt: 0,
      createdBy: 'device-abc',
    }
    const participant: Participant = { displayName: 'Alice', joinedAt: 0 }
    const awareness: AwarenessPayload = { participantId: 'device-abc' }
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    const scale: Scale = FIBONACCI_SCALE

    expect(meta.createdBy).toBe('device-abc')
    expect(participant.displayName).toBe('Alice')
    expect(awareness.participantId).toBe('device-abc')
    expect(scale.cards.length).toBeGreaterThan(0)
  })
})
