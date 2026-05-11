/**
 * Unit tests for the LobbyPage role predicate. Imports the real exported
 * helper from lobby-helpers.ts (no inline mirror).
 *
 * The chip-color and chip-label expressions live inline in the LobbyPage
 * template (`isParticipantViewer(p) ? 'medium' : 'primary'` etc.) — they
 * have no exported function to test in isolation. e2e covers the rendered
 * chip; the contract-level guarantee is the predicate below.
 *
 * onToggleRole's behavior (haptic + docService.toggleRole) is covered by
 * the role-toggle e2e flow; mounting LobbyPage in a unit test would
 * require stubbing 8 injected services for 4 lines of code.
 */

import { describe, expect, it } from 'vitest';

import type { ParticipantSnapshot } from '@hnch/shared';

import { isParticipantViewer } from './lobby-helpers';

function makeParticipant(id: string, role?: 'voter' | 'viewer'): ParticipantSnapshot {
  return { id, displayName: id, joinedAt: 0, role };
}

describe('LobbyPage — isParticipantViewer', () => {
  it('false when role field is omitted (default voter)', () => {
    expect(isParticipantViewer(makeParticipant('me'))).toBe(false);
  });

  it('false when role is explicitly voter', () => {
    expect(isParticipantViewer(makeParticipant('me', 'voter'))).toBe(false);
  });

  it('true when role is viewer', () => {
    expect(isParticipantViewer(makeParticipant('me', 'viewer'))).toBe(true);
  });
});
