/**
 * Render tests for PresetEditor.tsx using ink-testing-library.
 *
 * Tests cover initial display, keyboard navigation, the space-to-toggle
 * behaviour, the last-enabled-card guard, and the close callbacks.
 */

// Exercises: ui/components/PresetEditor:PresetEditor

import React from 'react';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PresetEditor } from './PresetEditor.js';

const CARDS = ['1', '2', '3', '5', '8'];

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('PresetEditor — rendering', () => {
  it('renders all card faces', () => {
    const { lastFrame } = render(
      <PresetEditor
        scaleId="fibonacci"
        cards={CARDS}
        disabledIndices={[]}
        onOverrideChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const frame = lastFrame() ?? '';
    for (const card of CARDS) {
      expect(frame).toContain(card);
    }
  });

  it('shows keyboard hint including "space toggle"', () => {
    const { lastFrame } = render(
      <PresetEditor
        scaleId="fibonacci"
        cards={CARDS}
        disabledIndices={[]}
        onOverrideChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(lastFrame() ?? '').toContain('space toggle');
  });
});

// ---------------------------------------------------------------------------
// Space to toggle
// ---------------------------------------------------------------------------

describe('PresetEditor — space to toggle', () => {
  it('space at cursor=0 disables the first card and reports [0]', async () => {
    const onOverrideChange = vi.fn();
    const { stdin } = render(
      <PresetEditor
        scaleId="fibonacci"
        cards={CARDS}
        disabledIndices={[]}
        onOverrideChange={onOverrideChange}
        onClose={vi.fn()}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write(' ');
      await flush();
    });
    expect(onOverrideChange).toHaveBeenCalledWith('fibonacci', [0]);
  });

  it('space on an already-disabled card re-enables it (reports [])', async () => {
    const onOverrideChange = vi.fn();
    const { stdin } = render(
      <PresetEditor
        scaleId="fibonacci"
        cards={CARDS}
        disabledIndices={[0]}
        onOverrideChange={onOverrideChange}
        onClose={vi.fn()}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write(' ');
      await flush();
    });
    expect(onOverrideChange).toHaveBeenCalledWith('fibonacci', []);
  });

  it('right arrow moves cursor: space disables the second card', async () => {
    const onOverrideChange = vi.fn();
    const { stdin } = render(
      <PresetEditor
        scaleId="fibonacci"
        cards={CARDS}
        disabledIndices={[]}
        onOverrideChange={onOverrideChange}
        onClose={vi.fn()}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x1b[C'); // right arrow → cursor=1
      await flush();
    });
    await act(async () => {
      stdin.write(' ');
      await flush();
    });
    expect(onOverrideChange).toHaveBeenCalledWith('fibonacci', [1]);
  });

  it('guard: cannot disable the last remaining enabled card', async () => {
    const onOverrideChange = vi.fn();
    // Indices 1-4 disabled; only index 0 is enabled. cursor starts at 0.
    // The guard fires because disabledSet.size (4) >= cards.length - 1 (4).
    const { stdin } = render(
      <PresetEditor
        scaleId="fibonacci"
        cards={CARDS}
        disabledIndices={[1, 2, 3, 4]}
        onOverrideChange={onOverrideChange}
        onClose={vi.fn()}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write(' ');
      await flush();
    });
    expect(onOverrideChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Close callbacks
// ---------------------------------------------------------------------------

describe('PresetEditor — close', () => {
  it('enter calls onClose', async () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <PresetEditor
        scaleId="fibonacci"
        cards={CARDS}
        disabledIndices={[]}
        onOverrideChange={vi.fn()}
        onClose={onClose}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('escape calls onClose', async () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <PresetEditor
        scaleId="fibonacci"
        cards={CARDS}
        disabledIndices={[]}
        onOverrideChange={vi.fn()}
        onClose={onClose}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x1b');
      await flush();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
