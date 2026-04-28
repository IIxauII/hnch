import { describe, it, expect } from 'vitest'
import {
  JOIN_REJECTION_CLOSE_CODES,
  JOIN_REJECTION_REASONS_BY_CODE,
  MAX_ROOM_PARTICIPANTS,
  type JoinRejectionReason,
} from './auth.js'

describe('JOIN_REJECTION_CLOSE_CODES', () => {
  it('has all 7 rejection reasons', () => {
    const reasons: JoinRejectionReason[] = [
      'unknown-room',
      'wrong-password',
      'invalid-invite',
      'expired-invite',
      'invite-already-redeemed',
      'room-full',
      'malformed-credentials',
    ]
    for (const reason of reasons) {
      expect(JOIN_REJECTION_CLOSE_CODES).toHaveProperty(reason)
    }
  })

  it('all codes are in the private-use WS range 4001–4099', () => {
    for (const code of Object.values(JOIN_REJECTION_CLOSE_CODES)) {
      expect(code).toBeGreaterThanOrEqual(4001)
      expect(code).toBeLessThanOrEqual(4099)
    }
  })

  it('all codes are unique integers', () => {
    const codes = Object.values(JOIN_REJECTION_CLOSE_CODES)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
    for (const code of codes) {
      expect(Number.isInteger(code)).toBe(true)
    }
  })
})

describe('JOIN_REJECTION_REASONS_BY_CODE', () => {
  it('has same size as JOIN_REJECTION_CLOSE_CODES', () => {
    expect(JOIN_REJECTION_REASONS_BY_CODE.size).toBe(
      Object.keys(JOIN_REJECTION_CLOSE_CODES).length,
    )
  })

  it('round-trips every reason: reason → code → reason', () => {
    for (const [reason, code] of Object.entries(JOIN_REJECTION_CLOSE_CODES) as [
      JoinRejectionReason,
      number,
    ][]) {
      expect(JOIN_REJECTION_REASONS_BY_CODE.get(code)).toBe(reason)
    }
  })

  it('returns undefined for unmapped code 9999', () => {
    expect(JOIN_REJECTION_REASONS_BY_CODE.get(9999)).toBeUndefined()
  })

  it('returns undefined for unmapped code 4000', () => {
    expect(JOIN_REJECTION_REASONS_BY_CODE.get(4000)).toBeUndefined()
  })

  it('returns undefined for unmapped code 5000', () => {
    expect(JOIN_REJECTION_REASONS_BY_CODE.get(5000)).toBeUndefined()
  })
})

describe('MAX_ROOM_PARTICIPANTS', () => {
  it('equals 20', () => {
    expect(MAX_ROOM_PARTICIPANTS).toBe(20)
  })
})
