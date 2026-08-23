/**
 * Render tests for CardPicker.tsx using ink-testing-library.
 *
 * Tests cover initial rendering, cursor navigation (left/right arrows),
 * toggle intent on Enter (cast or clear decided by the shared vote
 * command, not by this component), explicit clear via backspace, and the
 * disabled guard.
 */

// Exercises: ui/components/CardPicker:CardPicker

import React from 'react';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Scale } from '@hnch/shared';

import { CardPicker } from './CardPicker.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '3', '5', '8'] };

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('CardPicker — rendering', () => {
  it('renders all cards from the scale', () => {
    const { lastFrame } = render(
      <CardPicker scale={SCALE} onToggleCurrentVote={vi.fn()} onClearCurrentVote={vi.fn()} />,
    );
    const frame = lastFrame() ?? '';
    for (const card of SCALE.cards) {
      expect(frame).toContain(card);
    }
  });

  it('shows selected card in bracket format', () => {
    const { lastFrame } = render(
      <CardPicker
        scale={SCALE}
        selected="3"
        onToggleCurrentVote={vi.fn()}
        onClearCurrentVote={vi.fn()}
      />,
    );
    expect(lastFrame() ?? '').toContain('[3]');
  });

  it('renders navigation hint text', () => {
    const { lastFrame } = render(
      <CardPicker scale={SCALE} onToggleCurrentVote={vi.fn()} onClearCurrentVote={vi.fn()} />,
    );
    expect(lastFrame() ?? '').toContain('←→ navigate');
  });
});

// ---------------------------------------------------------------------------
// Keyboard interactions
// ---------------------------------------------------------------------------

describe('CardPicker — keyboard interactions', () => {
  it('enter at cursor=0 (default) calls onToggleCurrentVote with the first card', async () => {
    const onToggleCurrentVote = vi.fn();
    const { stdin } = render(
      <CardPicker
        scale={SCALE}
        onToggleCurrentVote={onToggleCurrentVote}
        onClearCurrentVote={vi.fn()}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onToggleCurrentVote).toHaveBeenCalledWith('1');
  });

  it('right arrow moves cursor: enter then toggles second card', async () => {
    const onToggleCurrentVote = vi.fn();
    const { stdin } = render(
      <CardPicker
        scale={SCALE}
        onToggleCurrentVote={onToggleCurrentVote}
        onClearCurrentVote={vi.fn()}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x1b[C'); // right arrow
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onToggleCurrentVote).toHaveBeenCalledWith('3');
  });

  it('left arrow at cursor=0 is clamped: enter still toggles first card', async () => {
    const onToggleCurrentVote = vi.fn();
    const { stdin } = render(
      <CardPicker
        scale={SCALE}
        onToggleCurrentVote={onToggleCurrentVote}
        onClearCurrentVote={vi.fn()}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x1b[D'); // left arrow — already at 0, clamps
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onToggleCurrentVote).toHaveBeenCalledWith('1');
  });

  it('multiple right arrows move cursor to third card', async () => {
    const onToggleCurrentVote = vi.fn();
    const { stdin } = render(
      <CardPicker
        scale={SCALE}
        onToggleCurrentVote={onToggleCurrentVote}
        onClearCurrentVote={vi.fn()}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x1b[C'); // right
      stdin.write('\x1b[C'); // right → cursor at index 2
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onToggleCurrentVote).toHaveBeenCalledWith('5');
  });

  it('enter on already-selected card at cursor still emits one toggle call (no local branch)', async () => {
    const onToggleCurrentVote = vi.fn();
    const onClearCurrentVote = vi.fn();
    // selected='1' is cards[0]; cursor starts at 0
    const { stdin } = render(
      <CardPicker
        scale={SCALE}
        selected="1"
        onToggleCurrentVote={onToggleCurrentVote}
        onClearCurrentVote={onClearCurrentVote}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    // Enter always emits toggle intent — cast-vs-clear is the shared command's
    // call, not this component's.
    expect(onToggleCurrentVote).toHaveBeenCalledWith('1');
    expect(onClearCurrentVote).not.toHaveBeenCalled();
  });

  it('backspace calls onClearCurrentVote', async () => {
    const onClearCurrentVote = vi.fn();
    const { stdin } = render(
      <CardPicker
        scale={SCALE}
        selected="3"
        onToggleCurrentVote={vi.fn()}
        onClearCurrentVote={onClearCurrentVote}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x7f'); // backspace
      await flush();
    });
    expect(onClearCurrentVote).toHaveBeenCalledOnce();
  });

  it('disabled=true ignores input: onToggleCurrentVote not called', async () => {
    const onToggleCurrentVote = vi.fn();
    const { stdin } = render(
      <CardPicker
        scale={SCALE}
        onToggleCurrentVote={onToggleCurrentVote}
        onClearCurrentVote={vi.fn()}
        disabled
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x1b[C'); // right arrow
      stdin.write('\r'); // enter
      await flush();
    });
    expect(onToggleCurrentVote).not.toHaveBeenCalled();
  });

  it('disabled=true ignores backspace: onClearCurrentVote not called', async () => {
    const onClearCurrentVote = vi.fn();
    const { stdin } = render(
      <CardPicker
        scale={SCALE}
        selected="1"
        onToggleCurrentVote={vi.fn()}
        onClearCurrentVote={onClearCurrentVote}
        disabled
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x7f');
      await flush();
    });
    expect(onClearCurrentVote).not.toHaveBeenCalled();
  });
});
