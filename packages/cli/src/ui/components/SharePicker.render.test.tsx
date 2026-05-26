/**
 * Render tests for SharePicker.tsx using ink-testing-library.
 *
 * SharePicker renders a MenuList with three share options whose `detail`
 * fields are produced by the real shareCode / shareUrl / shareNpxCommand
 * functions. Tests assert the rendered detail values match what those
 * functions return and that selecting an item fires the onPick callback.
 */

// Exercises: ui/components/SharePicker:SharePicker
// Also exercises: share:shareCode, share:shareUrl, share:shareNpxCommand

import React from 'react';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { shareCode, shareUrl, shareNpxCommand } from '../../share.js';

import { SharePicker } from './SharePicker.js';

const ROOM_CODE = 'ABC123';

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

// ---------------------------------------------------------------------------
// Rendering — detail values match share helper output
// ---------------------------------------------------------------------------

describe('SharePicker — rendering', () => {
  it('renders the "Share" title', () => {
    const { lastFrame } = render(
      <SharePicker roomCode={ROOM_CODE} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(lastFrame() ?? '').toContain('Share');
  });

  it('shows the formatted room code (shareCode output) as detail', () => {
    const { lastFrame } = render(
      <SharePicker roomCode={ROOM_CODE} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(lastFrame() ?? '').toContain(shareCode(ROOM_CODE));
  });

  it('shows the share URL (shareUrl output) as detail', () => {
    const { lastFrame } = render(
      <SharePicker roomCode={ROOM_CODE} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(lastFrame() ?? '').toContain(shareUrl(ROOM_CODE));
  });

  it('shows the npx command (shareNpxCommand output) as detail', () => {
    const { lastFrame } = render(
      <SharePicker roomCode={ROOM_CODE} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(lastFrame() ?? '').toContain(shareNpxCommand(ROOM_CODE));
  });

  it('shows all three copy-option labels', () => {
    const { lastFrame } = render(
      <SharePicker roomCode={ROOM_CODE} onPick={vi.fn()} onClose={vi.fn()} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Copy code');
    expect(frame).toContain('Copy share link');
    expect(frame).toContain('Copy npx command');
  });
});

// ---------------------------------------------------------------------------
// Keyboard interactions
// ---------------------------------------------------------------------------

describe('SharePicker — keyboard interactions', () => {
  it('Enter on the first item calls onPick with "code"', async () => {
    const onPick = vi.fn();
    const { stdin } = render(
      <SharePicker roomCode={ROOM_CODE} onPick={onPick} onClose={vi.fn()} />,
    );
    await flush();
    await act(async () => {
      stdin.write('\r'); // Enter on first item (Copy code)
      await flush();
    });
    expect(onPick).toHaveBeenCalledWith('code');
  });

  it('Down + Enter calls onPick with "url"', async () => {
    const onPick = vi.fn();
    const { stdin } = render(
      <SharePicker roomCode={ROOM_CODE} onPick={onPick} onClose={vi.fn()} />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x1b[B'); // down arrow → "Copy share link"
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onPick).toHaveBeenCalledWith('url');
  });

  it('Escape calls onClose', async () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <SharePicker roomCode={ROOM_CODE} onPick={vi.fn()} onClose={onClose} />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x1b'); // ESC
      await flush();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
