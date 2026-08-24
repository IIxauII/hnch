/**
 * Render tests for AccessPicker.tsx using ink-testing-library.
 *
 * AccessPicker lets the user choose between "Open" and "Password" access
 * modes and edit the password value. Tests assert the initial display for
 * each mode and that keyboard navigation correctly invokes the callbacks.
 */

// Exercises: ui/components/AccessPicker:AccessPicker

import React from 'react';
import { render } from 'ink-testing-library';
import { press, renderInk } from '../test-harness.js';
import { describe, expect, it, vi } from 'vitest';

import { AccessPicker } from './AccessPicker.js';

// ---------------------------------------------------------------------------
// Initial rendering by mode
// ---------------------------------------------------------------------------

describe('AccessPicker — initial rendering', () => {
  it('shows [Open] active label in open mode', () => {
    const { lastFrame } = render(
      <AccessPicker mode="open" password="" onModeChange={vi.fn()} onPasswordChange={vi.fn()} />,
    );
    // isActive = (m === mode), mode='open' → 'Open' gets bracket wrapper
    expect(lastFrame() ?? '').toContain('[Open]');
  });

  it('shows [Password] active label in password mode', () => {
    const { lastFrame } = render(
      <AccessPicker
        mode="password"
        password=""
        onModeChange={vi.fn()}
        onPasswordChange={vi.fn()}
      />,
    );
    expect(lastFrame() ?? '').toContain('[Password]');
  });

  it('shows both mode labels in open mode', () => {
    const { lastFrame } = render(
      <AccessPicker mode="open" password="" onModeChange={vi.fn()} onPasswordChange={vi.fn()} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Open');
    expect(frame).toContain('Password');
  });

  it('shows password text input when mode is "password"', () => {
    const { lastFrame } = render(
      <AccessPicker
        mode="password"
        password="secret"
        onModeChange={vi.fn()}
        onPasswordChange={vi.fn()}
      />,
    );
    // TextInput renders masked value as asterisks
    expect(lastFrame() ?? '').toContain('*');
  });

  it('does not show text input when mode is "open"', () => {
    const { lastFrame } = render(
      <AccessPicker mode="open" password="" onModeChange={vi.fn()} onPasswordChange={vi.fn()} />,
    );
    // In open mode, no password sub-section is shown
    expect(lastFrame() ?? '').not.toContain('Password:');
  });

  it('shows the open-mode navigation hint', () => {
    const { lastFrame } = render(
      <AccessPicker mode="open" password="" onModeChange={vi.fn()} onPasswordChange={vi.fn()} />,
    );
    expect(lastFrame() ?? '').toContain('←→ toggle');
  });
});

// ---------------------------------------------------------------------------
// Keyboard interactions
// ---------------------------------------------------------------------------

describe('AccessPicker — keyboard interactions', () => {
  it('right arrow + Enter from "open" mode calls onModeChange("password")', async () => {
    const onModeChange = vi.fn();
    const { stdin } = await renderInk(
      <AccessPicker
        mode="open"
        password=""
        onModeChange={onModeChange}
        onPasswordChange={vi.fn()}
      />,
    );
    await press(stdin, '\x1b[C'); // right arrow → cursor moves to password (index 1)
    await press(stdin, '\r'); // Enter — confirms new mode
    expect(onModeChange).toHaveBeenCalledWith('password');
  });

  it('left arrow + Enter from "password" mode calls onModeChange("open")', async () => {
    const onModeChange = vi.fn();
    const { stdin } = await renderInk(
      <AccessPicker
        mode="password"
        password=""
        onModeChange={onModeChange}
        onPasswordChange={vi.fn()}
      />,
    );
    await press(stdin, '\x1b[D'); // left arrow → cursor moves to open (index 0)
    await press(stdin, '\r'); // Enter — confirms new mode
    expect(onModeChange).toHaveBeenCalledWith('open');
  });

  it('Enter without moving cursor in "open" mode does not call onModeChange', async () => {
    const onModeChange = vi.fn();
    const { stdin } = await renderInk(
      <AccessPicker
        mode="open"
        password=""
        onModeChange={onModeChange}
        onPasswordChange={vi.fn()}
      />,
    );
    await press(stdin, '\r'); // Enter on cursor=0, mode='open' → newMode === mode → no call
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('Escape calls onClose', async () => {
    const onClose = vi.fn();
    const { stdin } = await renderInk(
      <AccessPicker
        mode="open"
        password=""
        onModeChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onClose={onClose}
      />,
    );
    await press(stdin, '\x1b'); // ESC
    expect(onClose).toHaveBeenCalledOnce();
  });
});
