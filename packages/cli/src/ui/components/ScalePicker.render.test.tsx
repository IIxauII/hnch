/**
 * Render tests for ScalePicker.tsx using ink-testing-library.
 *
 * Tests cover: empty state, initial render (cursor, [current] marker, hint),
 * up/down cursor navigation, space/enter selection, escape-to-close, and
 * the delete-confirm flow (y / n / esc).
 *
 * The custom-scale label-resolution paths (Team Bananas, blank-label fallback,
 * delete-confirm naming) are exercised separately in scale-label-render.test.tsx.
 */

// Exercises: ui/components/ScalePicker:ScalePicker

import React from 'react';
import { render } from 'ink-testing-library';
import { press, renderInk } from '../test-harness.js';
import { describe, expect, it, vi } from 'vitest';
import type { CustomScale, Scale } from '@hnch/shared';

import { ScalePicker } from './ScalePicker.js';

const FIB: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] };
const LINEAR: Scale = { id: 'linear', cards: ['1', '2', '3', '4', '5'] };
const CUSTOM: CustomScale = { id: 'custom-team', label: 'Team Points', cards: ['S', 'M', 'L'] };
const CUSTOM_SCALE: Scale = { id: CUSTOM.id, cards: CUSTOM.cards };

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

// Exercises: ui/components/ScalePicker:ScalePicker (empty branch)
describe('ScalePicker — empty state', () => {
  it('renders "no scales available" when scales list is empty', () => {
    const { lastFrame } = render(
      <ScalePicker
        scales={[]}
        selectedScaleId=""
        onSelect={vi.fn()}
        onOverrideChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(lastFrame() ?? '').toContain('no scales available');
  });
});

// ---------------------------------------------------------------------------
// Browsing — rendering
// ---------------------------------------------------------------------------

// Exercises: ui/components/ScalePicker:ScalePicker (browsing render)
describe('ScalePicker — browsing render', () => {
  it('shows all scale display labels', () => {
    const { lastFrame } = render(
      <ScalePicker
        scales={[FIB, LINEAR]}
        selectedScaleId=""
        onSelect={vi.fn()}
        onOverrideChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const frame = lastFrame() ?? '';
    // getScaleLabel capitalises builtin names: 'fibonacci' → 'Fibonacci'
    expect(frame).toContain('Fibonacci');
    expect(frame).toContain('Linear');
  });

  it('marks the currently-selected scale with [current]', () => {
    const { lastFrame } = render(
      <ScalePicker
        scales={[FIB, CUSTOM_SCALE]}
        selectedScaleId={FIB.id}
        customScales={[CUSTOM]}
        onSelect={vi.fn()}
        onOverrideChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(lastFrame() ?? '').toContain('[current]');
  });

  it('shows esc back hint text', () => {
    const { lastFrame } = render(
      <ScalePicker
        scales={[FIB]}
        selectedScaleId=""
        onSelect={vi.fn()}
        onOverrideChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(lastFrame() ?? '').toContain('esc back');
  });
});

// ---------------------------------------------------------------------------
// Browsing — keyboard navigation
// ---------------------------------------------------------------------------

// Exercises: ui/components/ScalePicker:ScalePicker (cursor movement)
describe('ScalePicker — navigation', () => {
  it('down arrow moves cursor to the second scale: space then selects it', async () => {
    const onSelect = vi.fn();
    const { stdin } = await renderInk(
      <ScalePicker
        scales={[FIB, CUSTOM_SCALE]}
        selectedScaleId=""
        customScales={[CUSTOM]}
        onSelect={onSelect}
        onOverrideChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await press(stdin, '\x1b[B'); // down arrow
    await press(stdin, ' '); // space — selects cursor item
    expect(onSelect).toHaveBeenCalledWith(CUSTOM.id);
  });

  it('up arrow at cursor=0 wraps to the last scale', async () => {
    const onSelect = vi.fn();
    const { stdin } = await renderInk(
      <ScalePicker
        scales={[FIB, LINEAR, CUSTOM_SCALE]}
        selectedScaleId=""
        customScales={[CUSTOM]}
        onSelect={onSelect}
        onOverrideChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await press(stdin, '\x1b[A'); // up arrow from index 0 → wraps to last (CUSTOM_SCALE)
    await press(stdin, ' ');
    expect(onSelect).toHaveBeenCalledWith(CUSTOM.id);
  });
});

// ---------------------------------------------------------------------------
// Browsing — selection
// ---------------------------------------------------------------------------

// Exercises: ui/components/ScalePicker:ScalePicker (onSelect dispatch)
describe('ScalePicker — selection', () => {
  it('space key calls onSelect with the cursor scale id', async () => {
    const onSelect = vi.fn();
    const { stdin } = await renderInk(
      <ScalePicker
        scales={[FIB]}
        selectedScaleId=""
        onSelect={onSelect}
        onOverrideChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await press(stdin, ' ');
    expect(onSelect).toHaveBeenCalledWith(FIB.id);
  });

  it('enter on a custom (non-builtin) scale calls onSelect', async () => {
    const onSelect = vi.fn();
    const { stdin } = await renderInk(
      <ScalePicker
        scales={[CUSTOM_SCALE]}
        selectedScaleId=""
        customScales={[CUSTOM]}
        onSelect={onSelect}
        onOverrideChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await press(stdin, '\r');
    expect(onSelect).toHaveBeenCalledWith(CUSTOM.id);
  });

  it('escape calls onClose', async () => {
    const onClose = vi.fn();
    const { stdin } = await renderInk(
      <ScalePicker
        scales={[FIB]}
        selectedScaleId=""
        onSelect={vi.fn()}
        onOverrideChange={vi.fn()}
        onClose={onClose}
      />,
    );
    await press(stdin, '\x1b');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Delete-confirm flow
// ---------------------------------------------------------------------------

// Exercises: ui/components/ScalePicker:ScalePicker (confirming-delete state)
describe('ScalePicker — delete-confirm flow', () => {
  it('"y" confirms the delete and calls onCustomScaleDelete with the scale id', async () => {
    const onDelete = vi.fn();
    const { stdin } = await renderInk(
      <ScalePicker
        scales={[CUSTOM_SCALE]}
        selectedScaleId=""
        customScales={[CUSTOM]}
        onSelect={vi.fn()}
        onOverrideChange={vi.fn()}
        onCustomScaleDelete={onDelete}
        onClose={vi.fn()}
      />,
    );
    await press(stdin, 'd'); // trigger confirming-delete
    await press(stdin, 'y');
    expect(onDelete).toHaveBeenCalledWith(CUSTOM.id);
  });

  it('"n" cancels the delete without calling onCustomScaleDelete', async () => {
    const onDelete = vi.fn();
    const { stdin } = await renderInk(
      <ScalePicker
        scales={[CUSTOM_SCALE]}
        selectedScaleId=""
        customScales={[CUSTOM]}
        onSelect={vi.fn()}
        onOverrideChange={vi.fn()}
        onCustomScaleDelete={onDelete}
        onClose={vi.fn()}
      />,
    );
    await press(stdin, 'd');
    await press(stdin, 'n');
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('escape in delete-confirm returns to browsing without deleting', async () => {
    const onDelete = vi.fn();
    const { lastFrame, stdin } = await renderInk(
      <ScalePicker
        scales={[CUSTOM_SCALE]}
        selectedScaleId=""
        customScales={[CUSTOM]}
        onSelect={vi.fn()}
        onOverrideChange={vi.fn()}
        onCustomScaleDelete={onDelete}
        onClose={vi.fn()}
      />,
    );
    await press(stdin, 'd');
    await press(stdin, '\x1b');
    expect(onDelete).not.toHaveBeenCalled();
    // browsing UI is restored — scale name is visible again
    expect(lastFrame() ?? '').toContain('Team Points');
  });
});
