/**
 * Render tests for ConfigSettings.tsx using ink-testing-library.
 *
 * ConfigSettings is the CLI `config` sub-command settings panel. It calls
 * readConfig() at mount time, so ../../config.js is mocked to avoid disk I/O.
 * Tests cover main-menu rendering (title, all 6 items, values from config),
 * state transitions (Enter → editing sub-states, ESC → return to main menu),
 * and the Escape-from-sub-state paths.
 *
 * Typing multi-character values into a controlled TextInput requires per-char
 * flush cycles; tests that verify callback values use props to pre-seed state
 * (the same pattern as CustomScaleEditor.render.test.tsx and TextInput
 * .render.test.tsx in this package).
 */

// Exercises: ui/components/ConfigSettings:ConfigSettings

import React from 'react';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config.js', () => ({
  readConfig: () => ({
    displayName: 'Alice',
    relayUrl: 'wss://relay.example.com',
    defaultSessionName: 'Daily Stand-up',
  }),
  writeConfig: vi.fn(),
  updateConfig: vi.fn(),
}));

// Import after mock declaration (vi.mock is hoisted above imports, but the
// dynamic import ensures the mocked module is in the dependency graph).
const { ConfigSettings } = await import('./ConfigSettings.js');

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Main-menu rendering
// ---------------------------------------------------------------------------

describe('ConfigSettings — main-menu rendering', () => {
  it('renders the "── Config Settings ──" title', () => {
    const { lastFrame } = render(<ConfigSettings />);
    expect(lastFrame() ?? '').toContain('── Config Settings ──');
  });

  it('shows all 6 settings items', () => {
    const { lastFrame } = render(<ConfigSettings />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Display name');
    expect(frame).toContain('Relay URL');
    expect(frame).toContain('Default scale');
    expect(frame).toContain('Default session name');
    expect(frame).toContain('Default password');
    expect(frame).toContain('Avatar color');
  });

  it('shows the display name from config in the Display name detail', () => {
    const { lastFrame } = render(<ConfigSettings />);
    // readConfig mock returns displayName: 'Alice'
    expect(lastFrame() ?? '').toContain('Alice');
  });

  it('shows the relay URL from config in the Relay URL detail', () => {
    const { lastFrame } = render(<ConfigSettings />);
    expect(lastFrame() ?? '').toContain('wss://relay.example.com');
  });

  it('shows the default session name from config in the Default session name detail', () => {
    const { lastFrame } = render(<ConfigSettings />);
    expect(lastFrame() ?? '').toContain('Daily Stand-up');
  });
});

// ---------------------------------------------------------------------------
// Keyboard interactions — main menu → editing states
// ---------------------------------------------------------------------------

describe('ConfigSettings — entering editing states', () => {
  it('enter on Display name (cursor=0) opens the editing-display-name state', async () => {
    const { stdin, lastFrame } = render(<ConfigSettings />);
    await flush();
    await act(async () => {
      stdin.write('\r'); // Enter on cursor=0 → Display name
      await flush();
    });
    // editing-display-name state renders a TextInput with a confirmation hint
    expect(lastFrame() ?? '').toContain('⏎ confirm');
  });

  it('entering Relay URL state shows "Relay URL:" label', async () => {
    const { stdin, lastFrame } = render(<ConfigSettings />);
    await flush();
    // Navigate down to Relay URL (index 1)
    await act(async () => {
      stdin.write('\x1b[B'); // down arrow
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(lastFrame() ?? '').toContain('Relay URL');
    expect(lastFrame() ?? '').toContain('⏎ confirm');
  });

  it('entering Default session name state shows "Default session name:" label', async () => {
    const { stdin, lastFrame } = render(<ConfigSettings />);
    await flush();
    // Navigate down 3 items to Default session name (index 3)
    await act(async () => {
      stdin.write('\x1b[B'); // down → Relay URL
      stdin.write('\x1b[B'); // down → Default scale
      stdin.write('\x1b[B'); // down → Default session name
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(lastFrame() ?? '').toContain('Default session name');
    expect(lastFrame() ?? '').toContain('⏎ confirm');
  });
});

// ---------------------------------------------------------------------------
// ESC from sub-states returns to main menu
// ---------------------------------------------------------------------------

describe('ConfigSettings — ESC from editing states', () => {
  it('ESC from editing-display-name returns to main menu', async () => {
    const { stdin, lastFrame } = render(<ConfigSettings />);
    await flush();
    // Open display name editor
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    // ESC back
    await act(async () => {
      stdin.write('\x1b');
      await flush();
    });
    // Main menu should be visible again
    expect(lastFrame() ?? '').toContain('── Config Settings ──');
    expect(lastFrame() ?? '').toContain('Relay URL');
  });

  it('ESC from editing-relay-url returns to main menu', async () => {
    const { stdin, lastFrame } = render(<ConfigSettings />);
    await flush();
    // Navigate to Relay URL (index 1) and open it
    await act(async () => {
      stdin.write('\x1b[B'); // down
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    // ESC back
    await act(async () => {
      stdin.write('\x1b');
      await flush();
    });
    expect(lastFrame() ?? '').toContain('── Config Settings ──');
    expect(lastFrame() ?? '').toContain('Display name');
  });
});

// ---------------------------------------------------------------------------
// Submitting from editing states (pre-seeded via config mock)
// ---------------------------------------------------------------------------

describe('ConfigSettings — submitting from editing-display-name', () => {
  it('pressing Enter submits the pre-seeded display name value', async () => {
    const { writeConfig } = await import('../../config.js');
    const { stdin } = render(<ConfigSettings />);
    await flush();
    // Open display name editor — TextInput seeded with config.displayName='Alice'
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    // Submit without typing → submits 'Alice'
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    // writeConfig should have been called with the display name
    expect(writeConfig).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Alice' }));
  });
});
