/**
 * Render tests for ParticipantList.tsx using ink-testing-library.
 *
 * ParticipantList is a pure render component (no internal state), so
 * tests only assert output. Covers: participant count header, online/
 * offline dots, host label, viewer label, vote indicators (unrevealed
 * and revealed), and the "self voter" label.
 */

// Exercises: ui/components/ParticipantList:ParticipantList

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { ParticipantSnapshot } from '@hnch/shared';

import { ParticipantList } from './ParticipantList.js';

function makePart(id: string, displayName: string, role?: 'voter' | 'viewer'): ParticipantSnapshot {
  return { id, displayName, joinedAt: 0, role };
}

describe('ParticipantList — participant count header', () => {
  it('shows the correct count for a single participant', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('a', 'Alice')]}
        onlineIds={new Set()}
        votes={{}}
        revealed={false}
      />,
    );
    expect(lastFrame() ?? '').toContain('Participants (1)');
  });

  it('shows the correct count for multiple participants', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('a', 'Alice'), makePart('b', 'Bob')]}
        onlineIds={new Set()}
        votes={{}}
        revealed={false}
      />,
    );
    expect(lastFrame() ?? '').toContain('Participants (2)');
  });
});

describe('ParticipantList — online/offline dots', () => {
  it('shows ● for an online participant', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('a', 'Alice')]}
        onlineIds={new Set(['a'])}
        votes={{}}
        revealed={false}
      />,
    );
    expect(lastFrame() ?? '').toContain('●');
  });

  it('shows ○ for an offline participant', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('a', 'Alice')]}
        onlineIds={new Set()}
        votes={{}}
        revealed={false}
      />,
    );
    expect(lastFrame() ?? '').toContain('○');
  });
});

describe('ParticipantList — role labels', () => {
  it('shows (host) for the host participant', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('host', 'Eve')]}
        onlineIds={new Set()}
        hostId="host"
        votes={{}}
        revealed={false}
      />,
    );
    expect(lastFrame() ?? '').toContain('(host)');
  });

  it('does not show (host) for a non-host participant', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('a', 'Alice')]}
        onlineIds={new Set()}
        hostId="other"
        votes={{}}
        revealed={false}
      />,
    );
    expect(lastFrame() ?? '').not.toContain('(host)');
  });

  it('shows (viewer) indicator for a viewer participant', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('v1', 'Viewer', 'viewer')]}
        onlineIds={new Set()}
        votes={{}}
        revealed={false}
      />,
    );
    expect(lastFrame() ?? '').toContain('(viewer)');
  });
});

// Vote indicators (unrevealed)

describe('ParticipantList — vote indicators (unrevealed)', () => {
  it('shows ✓ for a voter who has voted', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('a', 'Alice')]}
        onlineIds={new Set()}
        votes={{ a: '5' }}
        revealed={false}
      />,
    );
    expect(lastFrame() ?? '').toContain('✓');
  });

  it('shows · for a voter who has not voted', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('a', 'Alice')]}
        onlineIds={new Set()}
        votes={{}}
        revealed={false}
      />,
    );
    expect(lastFrame() ?? '').toContain('·');
  });

  it('does not show ✓ or · for a viewer (shows (viewer) instead)', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('v1', 'Viewer', 'viewer')]}
        onlineIds={new Set()}
        votes={{ v1: '3' }} // vote on viewer is unusual but shouldn't crash
        revealed={false}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('(viewer)');
    expect(frame).not.toContain('✓');
  });
});

// Vote indicators (revealed)

describe('ParticipantList — vote indicators (revealed)', () => {
  it('shows the actual vote value with → prefix when revealed', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('a', 'Alice')]}
        onlineIds={new Set()}
        votes={{ a: '8' }}
        revealed={true}
      />,
    );
    expect(lastFrame() ?? '').toContain('→ 8');
  });

  it('shows no indicator for a revealed round where the participant did not vote', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('a', 'Alice')]}
        onlineIds={new Set()}
        votes={{}}
        revealed={true}
      />,
    );
    const frame = lastFrame() ?? '';
    // No vote value, no ✓, no · (unrevealed marker)
    expect(frame).not.toContain('→');
    expect(frame).not.toContain('✓');
  });
});

describe('ParticipantList — self voter label', () => {
  it('shows (voter) for the local participant when they have not yet voted (unrevealed)', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('me', 'Me', 'voter')]}
        onlineIds={new Set()}
        votes={{}}
        revealed={false}
        participantId="me"
      />,
    );
    expect(lastFrame() ?? '').toContain('(voter)');
  });

  it('hides (voter) label once the round is revealed and a vote exists', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('me', 'Me', 'voter')]}
        onlineIds={new Set()}
        votes={{ me: '3' }}
        revealed={true}
        participantId="me"
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('(voter)');
    expect(frame).toContain('→ 3');
  });

  it('does not show (voter) label for other participants (only for self)', () => {
    const { lastFrame } = render(
      <ParticipantList
        participants={[makePart('other', 'Other', 'voter')]}
        onlineIds={new Set()}
        votes={{}}
        revealed={false}
        participantId="me"
      />,
    );
    // 'me' is not in participants so no (voter) label should appear
    expect(lastFrame() ?? '').not.toContain('(voter)');
  });
});
