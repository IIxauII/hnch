/**
 * Render tests for StatusBar.tsx using ink-testing-library.
 *
 * StatusBar is a pure render component (no internal state). Tests assert
 * the room code, optional session name, connection status text, and host
 * indicator are rendered correctly for every combination of props.
 */

// Exercises: ui/components/StatusBar:StatusBar

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { SyncStatus } from '../../sync.js';

import { StatusBar } from './StatusBar.js';

// ---------------------------------------------------------------------------
// Room code / session name
// ---------------------------------------------------------------------------

describe('StatusBar — room code and session name', () => {
  it('shows room code when no session name provided', () => {
    const { lastFrame } = render(<StatusBar roomCode="ABC123" status="connected" isHost={false} />);
    expect(lastFrame() ?? '').toContain('ABC123');
  });

  it('shows room code and session name separated by · when name provided', () => {
    const { lastFrame } = render(
      <StatusBar roomCode="ABC123" sessionName="Sprint 42" status="connected" isHost={false} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('ABC123');
    expect(frame).toContain('Sprint 42');
    expect(frame).toContain('·');
  });

  it('does not show session name when sessionName is undefined', () => {
    const { lastFrame } = render(
      <StatusBar roomCode="XYZ999" status="connecting" isHost={false} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('XYZ999');
    // The label is just the room code — no extra · from a session name suffix
    expect(frame).not.toContain('XYZ999 ·');
    expect(frame).not.toContain('Sprint');
  });
});

// ---------------------------------------------------------------------------
// Connection status text
// ---------------------------------------------------------------------------

describe('StatusBar — connection status text', () => {
  const cases: SyncStatus[] = ['connecting', 'connected', 'disconnected'];

  for (const status of cases) {
    it(`shows "${status}" text`, () => {
      const { lastFrame } = render(<StatusBar roomCode="ROOM01" status={status} isHost={false} />);
      expect(lastFrame() ?? '').toContain(status);
    });
  }
});

// ---------------------------------------------------------------------------
// Host indicator
// ---------------------------------------------------------------------------

describe('StatusBar — host indicator', () => {
  it('shows [host] when isHost=true', () => {
    const { lastFrame } = render(<StatusBar roomCode="ROOM01" status="connected" isHost={true} />);
    expect(lastFrame() ?? '').toContain('[host]');
  });

  it('does not show [host] when isHost=false', () => {
    const { lastFrame } = render(<StatusBar roomCode="ROOM01" status="connected" isHost={false} />);
    expect(lastFrame() ?? '').not.toContain('[host]');
  });
});
