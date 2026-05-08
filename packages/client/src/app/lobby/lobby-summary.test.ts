/**
 * Unit tests for lobby pure helpers.
 *
 * Full component-mount tests (DI heavy) are deferred to e2e.
 * Tests here cover:
 * - summarizeParticipants: online/offline/viewer summary string
 * - participantsAccordionValueFor: accordion collapse contract
 */

import { describe, expect, it } from 'vitest';
import type { ParticipantSnapshot } from '@hnch/shared';
import { participantsAccordionValueFor, summarizeParticipants } from './lobby-summary';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParticipant(id: string, role?: 'voter' | 'viewer'): ParticipantSnapshot {
  return { id, displayName: id, joinedAt: 0, role };
}

function isViewer(p: ParticipantSnapshot): boolean {
  return p.role === 'viewer';
}

// ---------------------------------------------------------------------------
// summarizeParticipants
// ---------------------------------------------------------------------------

describe('summarizeParticipants', () => {
  it('returns empty string for empty participants', () => {
    expect(summarizeParticipants([], new Set(), isViewer)).toBe('');
  });

  it('all online voters → "N online"', () => {
    const ps = [makeParticipant('a'), makeParticipant('b'), makeParticipant('c')];
    const online = new Set(['a', 'b', 'c']);
    expect(summarizeParticipants(ps, online, isViewer)).toBe('3 online');
  });

  it('online voters + one viewer → singular "viewer"', () => {
    const ps = [makeParticipant('a'), makeParticipant('b'), makeParticipant('v', 'viewer')];
    const online = new Set(['a', 'b', 'v']);
    expect(summarizeParticipants(ps, online, isViewer)).toBe('2 online · 1 viewer');
  });

  it('online voters + multiple viewers → plural "viewers"', () => {
    const ps = [
      makeParticipant('a'),
      makeParticipant('b'),
      makeParticipant('v1', 'viewer'),
      makeParticipant('v2', 'viewer'),
    ];
    const online = new Set(['a', 'b', 'v1', 'v2']);
    expect(summarizeParticipants(ps, online, isViewer)).toBe('2 online · 2 viewers');
  });

  it('mix of online + offline + viewers', () => {
    const ps = [
      makeParticipant('a'),
      makeParticipant('b'),
      makeParticipant('c'),
      makeParticipant('off'),
      makeParticipant('v1', 'viewer'),
      makeParticipant('v2', 'viewer'),
    ];
    const online = new Set(['a', 'b', 'c']);
    expect(summarizeParticipants(ps, online, isViewer)).toBe('3 online · 1 offline · 2 viewers');
  });

  it('all offline → "N offline"', () => {
    const ps = [makeParticipant('a'), makeParticipant('b')];
    expect(summarizeParticipants(ps, new Set(), isViewer)).toBe('2 offline');
  });

  it('order is always online → offline → viewers (regression lock)', () => {
    // offline participant appears first in array, but output order must be fixed
    const ps = [makeParticipant('off'), makeParticipant('v', 'viewer'), makeParticipant('on')];
    const online = new Set(['on']);
    const result = summarizeParticipants(ps, online, isViewer);
    expect(result).toBe('1 online · 1 offline · 1 viewer');
    // verify no reordering
    const parts = result.split(' · ');
    expect(parts[0]).toMatch(/online$/);
    expect(parts[1]).toMatch(/offline$/);
    expect(parts[2]).toMatch(/viewer/);
  });

  it('viewer precedence: viewer counted as viewer regardless of online status', () => {
    // v is NOT in onlineIds — should still count as viewer, not offline
    const ps = [makeParticipant('a'), makeParticipant('v', 'viewer')];
    const online = new Set(['a']); // v is offline but role=viewer
    expect(summarizeParticipants(ps, online, isViewer)).toBe('1 online · 1 viewer');
  });
});

// ---------------------------------------------------------------------------
// participantsAccordionValueFor
// ---------------------------------------------------------------------------

describe('participantsAccordionValueFor', () => {
  it('returns "open" when no revealed round (false)', () => {
    expect(participantsAccordionValueFor(false)).toBe('open');
  });

  it('returns null when a round has been revealed (true)', () => {
    expect(participantsAccordionValueFor(true)).toBeNull();
  });
});
