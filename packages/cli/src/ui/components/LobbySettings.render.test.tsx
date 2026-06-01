/**
 * Render tests for LobbySettings.tsx using ink-testing-library.
 *
 * LobbySettings is the in-session settings panel driven entirely by props —
 * no file I/O at mount time. Tests cover main-menu rendering for host and
 * joiner modes, keyboard interactions (escape → onClose, enter → state
 * transitions), and that the correct callbacks fire when forms are submitted.
 *
 * writeConfig is mocked to avoid side effects when display-name submissions
 * trigger the config-write code path.
 */

// Exercises: ui/components/LobbySettings:LobbySettings

import React from 'react';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Scale } from '@hnch/shared';

vi.mock('../../config.js', () => ({
  readConfig: () => ({}),
  writeConfig: vi.fn(),
  updateConfig: vi.fn(),
}));

import { LobbySettings } from './LobbySettings.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8', '13'] };

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

function makeProps(
  overrides: Partial<{
    sessionName: string | undefined;
    displayName: string;
    currentScale: Scale;
    accessMode: 'open' | 'password' | 'invite';
    isHost: boolean;
    onChangeName: (name: string | undefined) => void;
    onChangeScale: (scale: Scale) => void;
    onChangeDisplayName: (name: string) => void;
    onChangeAccess: (mode: 'open' | 'password', password?: string) => Promise<void>;
    onClose: () => void;
  }> = {},
) {
  return {
    sessionName: 'Sprint 42',
    displayName: 'Alice',
    currentScale: SCALE,
    accessMode: 'open' as const,
    onChangeName: vi.fn(),
    onChangeScale: vi.fn(),
    onChangeDisplayName: vi.fn(),
    onChangeAccess: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Main-menu rendering — host mode (all 4 items visible)
// ---------------------------------------------------------------------------

describe('LobbySettings — main-menu rendering (host)', () => {
  it('renders the "── Settings ──" title', () => {
    const { lastFrame } = render(<LobbySettings {...makeProps()} />);
    expect(lastFrame() ?? '').toContain('── Settings ──');
  });

  it('shows all 4 settings items for a host', () => {
    const { lastFrame } = render(<LobbySettings {...makeProps()} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Room name');
    expect(frame).toContain('Scale');
    expect(frame).toContain('Access');
    expect(frame).toContain('Display name');
  });

  it('shows the session name in the Room name detail', () => {
    const { lastFrame } = render(<LobbySettings {...makeProps({ sessionName: 'My Sprint' })} />);
    expect(lastFrame() ?? '').toContain('My Sprint');
  });

  it('shows "(none)" in the Room name detail when sessionName is undefined', () => {
    const { lastFrame } = render(<LobbySettings {...makeProps({ sessionName: undefined })} />);
    expect(lastFrame() ?? '').toContain('(none)');
  });

  it('shows the Fibonacci scale label in the Scale detail', () => {
    const { lastFrame } = render(<LobbySettings {...makeProps()} />);
    expect(lastFrame() ?? '').toContain('Fibonacci');
  });

  it('shows "Open" access mode in the Access detail', () => {
    const { lastFrame } = render(<LobbySettings {...makeProps({ accessMode: 'open' })} />);
    expect(lastFrame() ?? '').toContain('Open');
  });

  it('shows "Password" access mode in the Access detail', () => {
    const { lastFrame } = render(<LobbySettings {...makeProps({ accessMode: 'password' })} />);
    expect(lastFrame() ?? '').toContain('Password');
  });
});

// ---------------------------------------------------------------------------
// Main-menu rendering — joiner mode (only Display name visible)
// ---------------------------------------------------------------------------

describe('LobbySettings — main-menu rendering (joiner)', () => {
  it('shows only Display name for a non-host participant', () => {
    const { lastFrame } = render(<LobbySettings {...makeProps({ isHost: false })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Display name');
    expect(frame).not.toContain('Room name');
    expect(frame).not.toContain('Scale');
    expect(frame).not.toContain('Access');
  });
});

// ---------------------------------------------------------------------------
// Keyboard interactions — main menu
// ---------------------------------------------------------------------------

describe('LobbySettings — main-menu keyboard interactions', () => {
  it('escape from the main menu calls onClose', async () => {
    const onClose = vi.fn();
    const { stdin } = render(<LobbySettings {...makeProps({ onClose })} />);
    await flush();
    await act(async () => {
      stdin.write('\x1b'); // ESC
      await flush();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('enter on Room name (cursor at index 0) opens the editing-room-name state', async () => {
    const { stdin, lastFrame } = render(<LobbySettings {...makeProps()} />);
    await flush();
    await act(async () => {
      stdin.write('\r'); // Enter — cursor starts at Room name
      await flush();
    });
    // Should show the TextInput hint, not the main-menu hint
    expect(lastFrame() ?? '').toContain('⏎ confirm');
  });
});

// ---------------------------------------------------------------------------
// editing-room-name state — submission
// ---------------------------------------------------------------------------

describe('LobbySettings — editing-room-name submission', () => {
  it('submitting calls onChangeName with the pre-seeded session name', async () => {
    // LobbySettings initialises roomNameInput from the sessionName prop.
    // Pressing Enter without extra typing submits the pre-seeded value.
    const onChangeName = vi.fn();
    const { stdin } = render(
      <LobbySettings {...makeProps({ onChangeName, sessionName: 'My Sprint' })} />,
    );
    await flush();
    await act(async () => {
      stdin.write('\r'); // open room name editor
      await flush();
    });
    await act(async () => {
      stdin.write('\r'); // submit pre-seeded value
      await flush();
    });
    expect(onChangeName).toHaveBeenCalledWith('My Sprint');
  });

  it('submitting an empty room name calls onChangeName with undefined', async () => {
    const onChangeName = vi.fn();
    const { stdin } = render(<LobbySettings {...makeProps({ onChangeName, sessionName: '' })} />);
    await flush();
    await act(async () => {
      stdin.write('\r'); // open room name editor
      await flush();
    });
    await act(async () => {
      stdin.write('\r'); // submit empty value
      await flush();
    });
    expect(onChangeName).toHaveBeenCalledWith(undefined);
  });
});

// ---------------------------------------------------------------------------
// editing-room-name state — navigation
// ---------------------------------------------------------------------------

describe('LobbySettings — editing-room-name navigation', () => {
  it('ESC from editing-room-name returns to main menu', async () => {
    const { stdin, lastFrame } = render(<LobbySettings {...makeProps()} />);
    await flush();
    await act(async () => {
      stdin.write('\r'); // open room name editor
      await flush();
    });
    await act(async () => {
      stdin.write('\x1b'); // ESC back to main menu
      await flush();
    });
    expect(lastFrame() ?? '').toContain('Scale');
    expect(lastFrame() ?? '').toContain('Access');
  });
});

// ---------------------------------------------------------------------------
// editing-display-name state (joiner mode — Display name is at cursor 0)
// ---------------------------------------------------------------------------

describe('LobbySettings — editing-display-name state', () => {
  it('submitting calls onChangeDisplayName with the pre-seeded display name', async () => {
    // LobbySettings initialises displayNameInput from the displayName prop.
    // Pressing Enter without extra typing submits the pre-seeded value.
    const onChangeDisplayName = vi.fn();
    // isHost=false so only Display name is shown at cursor 0
    const { stdin } = render(
      <LobbySettings
        {...makeProps({ isHost: false, displayName: 'Alice', onChangeDisplayName })}
      />,
    );
    await flush();
    // Open display name editor (Display name is the only item → cursor at 0)
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    // Submit the pre-seeded value
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onChangeDisplayName).toHaveBeenCalledWith('Alice');
  });

  it('ESC from editing-display-name returns to main menu', async () => {
    const { stdin, lastFrame } = render(
      <LobbySettings {...makeProps({ isHost: false, displayName: 'Alice' })} />,
    );
    await flush();
    // Open display name editor
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    // ESC back to main menu
    await act(async () => {
      stdin.write('\x1b');
      await flush();
    });
    // Main menu should be visible again
    expect(lastFrame() ?? '').toContain('── Settings ──');
  });
});
