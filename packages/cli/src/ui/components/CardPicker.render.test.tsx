/**
 * Render tests for CardPicker.tsx using ink-testing-library.
 *
 * Tests cover initial rendering, cursor navigation (left/right arrows),
 * selection (enter), toggle-clear (enter on already-selected), clear
 * via backspace, and the disabled guard.
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
    const { lastFrame } = render(<CardPicker scale={SCALE} onSelect={vi.fn()} onClear={vi.fn()} />);
    const frame = lastFrame() ?? '';
    for (const card of SCALE.cards) {
      expect(frame).toContain(card);
    }
  });

  it('shows selected card in bracket format', () => {
    const { lastFrame } = render(
      <CardPicker scale={SCALE} selected="3" onSelect={vi.fn()} onClear={vi.fn()} />,
    );
    expect(lastFrame() ?? '').toContain('[3]');
  });

  it('renders navigation hint text', () => {
    const { lastFrame } = render(<CardPicker scale={SCALE} onSelect={vi.fn()} onClear={vi.fn()} />);
    expect(lastFrame() ?? '').toContain('←→ navigate');
  });
});

// ---------------------------------------------------------------------------
// Keyboard interactions
// ---------------------------------------------------------------------------

describe('CardPicker — keyboard interactions', () => {
  it('enter at cursor=0 (default) calls onSelect with the first card', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(<CardPicker scale={SCALE} onSelect={onSelect} onClear={vi.fn()} />);
    await flush();
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('right arrow moves cursor: enter then selects second card', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(<CardPicker scale={SCALE} onSelect={onSelect} onClear={vi.fn()} />);
    await flush();
    await act(async () => {
      stdin.write('\x1b[C'); // right arrow
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onSelect).toHaveBeenCalledWith('3');
  });

  it('left arrow at cursor=0 is clamped: enter still selects first card', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(<CardPicker scale={SCALE} onSelect={onSelect} onClear={vi.fn()} />);
    await flush();
    await act(async () => {
      stdin.write('\x1b[D'); // left arrow — already at 0, clamps
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('multiple right arrows move cursor to third card', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(<CardPicker scale={SCALE} onSelect={onSelect} onClear={vi.fn()} />);
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
    expect(onSelect).toHaveBeenCalledWith('5');
  });

  it('enter on already-selected card at cursor calls onClear (toggle)', async () => {
    const onClear = vi.fn();
    // selected='1' is cards[0]; cursor starts at 0
    const { stdin } = render(
      <CardPicker scale={SCALE} selected="1" onSelect={vi.fn()} onClear={onClear} />,
    );
    await flush();
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('backspace calls onClear', async () => {
    const onClear = vi.fn();
    const { stdin } = render(
      <CardPicker scale={SCALE} selected="3" onSelect={vi.fn()} onClear={onClear} />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x7f'); // backspace
      await flush();
    });
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('disabled=true ignores input: onSelect not called', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <CardPicker scale={SCALE} onSelect={onSelect} onClear={vi.fn()} disabled />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x1b[C'); // right arrow
      stdin.write('\r'); // enter
      await flush();
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disabled=true ignores backspace: onClear not called', async () => {
    const onClear = vi.fn();
    const { stdin } = render(
      <CardPicker scale={SCALE} selected="1" onSelect={vi.fn()} onClear={onClear} disabled />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x7f');
      await flush();
    });
    expect(onClear).not.toHaveBeenCalled();
  });
});
