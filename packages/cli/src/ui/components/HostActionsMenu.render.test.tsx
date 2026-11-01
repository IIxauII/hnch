/**
 * Render tests for HostActionsMenu.tsx using ink-testing-library.
 *
 * HostActionsMenu renders a MenuList with host-only session actions. Tests
 * assert the title, the "End session" item, and that selecting an item or
 * pressing Escape correctly invokes the callbacks.
 */

// Exercises: ui/components/HostActionsMenu:HostActionsMenu

import React from 'react';
import { render } from 'ink-testing-library';
import { press, renderInk } from '../test-harness.js';
import { describe, expect, it, vi } from 'vitest';

import { HostActionsMenu } from './HostActionsMenu.js';

describe('HostActionsMenu — rendering', () => {
  it('renders the "Host Actions" title', () => {
    const { lastFrame } = render(<HostActionsMenu onPick={vi.fn()} onClose={vi.fn()} />);
    expect(lastFrame() ?? '').toContain('Host Actions');
  });

  it('shows "End session for everyone" item', () => {
    const { lastFrame } = render(<HostActionsMenu onPick={vi.fn()} onClose={vi.fn()} />);
    expect(lastFrame() ?? '').toContain('End session for everyone');
  });

  it('shows the "Cannot be undone" detail text', () => {
    const { lastFrame } = render(<HostActionsMenu onPick={vi.fn()} onClose={vi.fn()} />);
    expect(lastFrame() ?? '').toContain('Cannot be undone');
  });
});

describe('HostActionsMenu — keyboard interactions', () => {
  it('Enter calls onPick with "end-session"', async () => {
    const onPick = vi.fn();
    const { stdin } = await renderInk(<HostActionsMenu onPick={onPick} onClose={vi.fn()} />);
    await press(stdin, '\r'); // Enter on first (only) item
    expect(onPick).toHaveBeenCalledWith('end-session');
  });

  it('Escape calls onClose', async () => {
    const onClose = vi.fn();
    const { stdin } = await renderInk(<HostActionsMenu onPick={vi.fn()} onClose={onClose} />);
    await press(stdin, '\x1b'); // ESC
    expect(onClose).toHaveBeenCalledOnce();
  });
});
