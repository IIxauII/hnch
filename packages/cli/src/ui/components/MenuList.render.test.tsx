/**
 * Render tests for MenuList.tsx using ink-testing-library.
 *
 * Tests cover: empty-list rendering, cursor navigation (up/down arrows
 * with disabled-item skipping), enter-to-select, escape-to-close, and
 * the title prop.
 */

// Exercises: ui/components/MenuList:MenuList, MenuItem

import React from 'react';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MenuList } from './MenuList.js';
import type { MenuItem } from './MenuList.js';

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

const ITEMS: MenuItem[] = [
  { label: 'Alpha', value: 'a' },
  { label: 'Beta', value: 'b' },
  { label: 'Gamma', value: 'c', disabled: true },
  { label: 'Delta', value: 'd' },
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('MenuList — rendering', () => {
  it('shows "(no items)" when the list is empty', () => {
    const { lastFrame } = render(<MenuList items={[]} onSelect={vi.fn()} />);
    expect(lastFrame() ?? '').toContain('(no items)');
  });

  it('renders all item labels', () => {
    const { lastFrame } = render(<MenuList items={ITEMS} onSelect={vi.fn()} />);
    const frame = lastFrame() ?? '';
    for (const item of ITEMS) {
      expect(frame).toContain(item.label);
    }
  });

  it('renders a title when provided', () => {
    const { lastFrame } = render(<MenuList items={ITEMS} onSelect={vi.fn()} title="Pick one" />);
    expect(lastFrame() ?? '').toContain('Pick one');
  });

  it('renders navigation hint', () => {
    const { lastFrame } = render(<MenuList items={ITEMS} onSelect={vi.fn()} />);
    expect(lastFrame() ?? '').toContain('↑↓ select');
  });
});

// ---------------------------------------------------------------------------
// Keyboard interactions
// ---------------------------------------------------------------------------

describe('MenuList — keyboard interactions', () => {
  it('enter on default cursor calls onSelect with the first non-disabled item', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(<MenuList items={ITEMS} onSelect={onSelect} />);
    await flush();
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('down arrow moves cursor: enter then selects the second item', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(<MenuList items={ITEMS} onSelect={onSelect} />);
    await flush();
    await act(async () => {
      stdin.write('\x1b[B'); // down arrow
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('down arrow skips disabled items', async () => {
    const onSelect = vi.fn();
    // [B(enabled), C(disabled), D(enabled)] — cursor starts at B
    // one down: C is disabled → skip → land on D
    const items: MenuItem[] = [
      { label: 'B', value: 'b' },
      { label: 'C', value: 'c', disabled: true },
      { label: 'D', value: 'd' },
    ];
    const { stdin } = render(<MenuList items={items} onSelect={onSelect} />);
    await flush();
    await act(async () => {
      stdin.write('\x1b[B'); // down
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onSelect).toHaveBeenCalledWith('d');
  });

  it('up arrow skips disabled items', async () => {
    const onSelect = vi.fn();
    // [A(enabled), B(disabled), C(enabled)] — cursor starts at A (index 0)
    // up from 0: wraps to index 2 (C, enabled)
    const items: MenuItem[] = [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b', disabled: true },
      { label: 'C', value: 'c' },
    ];
    const { stdin } = render(<MenuList items={items} onSelect={onSelect} />);
    await flush();
    await act(async () => {
      stdin.write('\x1b[A'); // up
      await flush();
    });
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('cursor positions on first non-disabled item when first item is disabled', async () => {
    const onSelect = vi.fn();
    const items: MenuItem[] = [
      { label: 'First', value: 'f', disabled: true },
      { label: 'Second', value: 's' },
    ];
    const { stdin } = render(<MenuList items={items} onSelect={onSelect} />);
    await flush();
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    // first non-disabled is 'Second'
    expect(onSelect).toHaveBeenCalledWith('s');
  });

  it('escape calls onClose', async () => {
    const onClose = vi.fn();
    const { stdin } = render(<MenuList items={ITEMS} onSelect={vi.fn()} onClose={onClose} />);
    await flush();
    await act(async () => {
      stdin.write('\x1b'); // ESC
      await flush();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
