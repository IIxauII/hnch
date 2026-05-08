import { describe, it, expect } from 'vitest';

import {
  JOIN_REJECTION_CLOSE_CODES,
  JOIN_REJECTION_REASONS_BY_CODE,
  MAX_ROOM_PARTICIPANTS,
  type JoinRejectionReason,
} from './auth.js';

describe('JOIN_REJECTION_CLOSE_CODES', () => {
  it('maps unknown-room to 4001', () => {
    expect(JOIN_REJECTION_CLOSE_CODES['unknown-room']).toBe(4001);
  });

  it('maps wrong-password to 4002', () => {
    expect(JOIN_REJECTION_CLOSE_CODES['wrong-password']).toBe(4002);
  });

  it('maps room-full to 4006', () => {
    expect(JOIN_REJECTION_CLOSE_CODES['room-full']).toBe(4006);
  });

  it('maps malformed-credentials to 4010', () => {
    expect(JOIN_REJECTION_CLOSE_CODES['malformed-credentials']).toBe(4010);
  });

  it('all codes are in the 4000-4099 private-use range', () => {
    for (const code of Object.values(JOIN_REJECTION_CLOSE_CODES)) {
      expect(code).toBeGreaterThanOrEqual(4000);
      expect(code).toBeLessThanOrEqual(4099);
    }
  });

  it('has no duplicate codes', () => {
    const codes = Object.values(JOIN_REJECTION_CLOSE_CODES);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('covers every JoinRejectionReason', () => {
    const reasons: JoinRejectionReason[] = [
      'unknown-room',
      'wrong-password',
      'invalid-invite',
      'expired-invite',
      'invite-already-redeemed',
      'room-full',
      'malformed-credentials',
    ];
    for (const reason of reasons) {
      expect(JOIN_REJECTION_CLOSE_CODES[reason]).toBeDefined();
    }
  });
});

describe('JOIN_REJECTION_REASONS_BY_CODE', () => {
  it('is the exact inverse of JOIN_REJECTION_CLOSE_CODES', () => {
    for (const [reason, code] of Object.entries(JOIN_REJECTION_CLOSE_CODES)) {
      expect(JOIN_REJECTION_REASONS_BY_CODE.get(code)).toBe(reason);
    }
  });

  it('has the same cardinality as JOIN_REJECTION_CLOSE_CODES', () => {
    expect(JOIN_REJECTION_REASONS_BY_CODE.size).toBe(
      Object.keys(JOIN_REJECTION_CLOSE_CODES).length,
    );
  });

  it('returns undefined for unknown codes', () => {
    expect(JOIN_REJECTION_REASONS_BY_CODE.get(4000)).toBeUndefined();
    expect(JOIN_REJECTION_REASONS_BY_CODE.get(1000)).toBeUndefined();
    expect(JOIN_REJECTION_REASONS_BY_CODE.get(4100)).toBeUndefined();
  });

  it('round-trips: code → reason → code', () => {
    for (const [reason, code] of Object.entries(JOIN_REJECTION_CLOSE_CODES)) {
      const lookedUpReason = JOIN_REJECTION_REASONS_BY_CODE.get(code);
      expect(lookedUpReason).toBe(reason);
      expect(JOIN_REJECTION_CLOSE_CODES[lookedUpReason as JoinRejectionReason]).toBe(code);
    }
  });
});

describe('MAX_ROOM_PARTICIPANTS', () => {
  it('equals 20 (ADR-0024)', () => {
    expect(MAX_ROOM_PARTICIPANTS).toBe(20);
  });

  it('is a positive integer', () => {
    expect(Number.isInteger(MAX_ROOM_PARTICIPANTS)).toBe(true);
    expect(MAX_ROOM_PARTICIPANTS).toBeGreaterThan(0);
  });
});
