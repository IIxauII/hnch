import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  BUILTIN_SCALES,
  FIBONACCI_SCALE,
  TSHIRT_SCALE,
  type AwarenessPayload,
  type Meta,
  type Participant,
  type RevealMode,
  type Round,
  type Scale,
  type Settings,
} from './doc.js'

describe('builtin scales', () => {
  it('FIBONACCI_SCALE matches the card faces documented in schema.md', () => {
    expect(FIBONACCI_SCALE.id).toBe('fibonacci')
    expect(FIBONACCI_SCALE.cards).toEqual([
      '0',
      '1',
      '2',
      '3',
      '5',
      '8',
      '13',
      '21',
      '?',
      '☕',
    ])
  })

  it('TSHIRT_SCALE matches the documented sizes', () => {
    expect(TSHIRT_SCALE.id).toBe('t-shirt')
    expect(TSHIRT_SCALE.cards).toEqual(['XS', 'S', 'M', 'L', 'XL', '?', '☕'])
  })

  it('BUILTIN_SCALES indexes each scale by its id', () => {
    expect(BUILTIN_SCALES['fibonacci']).toBe(FIBONACCI_SCALE)
    expect(BUILTIN_SCALES['t-shirt']).toBe(TSHIRT_SCALE)
    expect(Object.keys(BUILTIN_SCALES).sort()).toEqual(['fibonacci', 't-shirt'])
  })

  it('each builtin includes the standard sentinels', () => {
    for (const scale of Object.values(BUILTIN_SCALES)) {
      expect(scale.cards).toContain('?')
      expect(scale.cards).toContain('☕')
    }
  })
})

describe('shape types', () => {
  // These are compile-time checks; the assertions just force evaluation.

  it('RevealMode is the documented literal union', () => {
    expectTypeOf<RevealMode>().toEqualTypeOf<'manual' | 'timer'>()
  })

  it('Settings accepts a revealMode + optional timerDurationMs', () => {
    const manual: Settings = {
      defaultScale: FIBONACCI_SCALE,
      revealMode: 'manual',
      hostParticipantId: 'device-abc',
    }
    const timer: Settings = {
      defaultScale: TSHIRT_SCALE,
      revealMode: 'timer',
      timerDurationMs: 90_000,
      hostParticipantId: 'device-abc',
      name: 'Sprint 42 planning',
    }
    expect(manual.revealMode).toBe('manual')
    expect(timer.timerDurationMs).toBe(90_000)
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
