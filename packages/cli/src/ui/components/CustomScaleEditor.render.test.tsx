/**
 * Render tests for CustomScaleEditor.tsx using ink-testing-library.
 *
 * Tests cover the create-vs-edit title variants, the validation-error
 * paths (empty name, name > 40 chars), and the cancel callback.
 */

// Exercises: ui/components/CustomScaleEditor:CustomScaleEditor

import React from 'react';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CustomScaleEditor } from './CustomScaleEditor.js';

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

// ---------------------------------------------------------------------------
// Title rendering
// ---------------------------------------------------------------------------

describe('CustomScaleEditor — title', () => {
  it('shows "Create Custom Scale" title when no initialName provided', () => {
    const { lastFrame } = render(<CustomScaleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(lastFrame() ?? '').toContain('Create Custom Scale');
  });

  it('shows "Edit Custom Scale" title when initialName is provided', () => {
    const { lastFrame } = render(
      <CustomScaleEditor initialName="My Scale" onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(lastFrame() ?? '').toContain('Edit Custom Scale');
  });

  it('shows "Name:" label in name-editing mode', () => {
    const { lastFrame } = render(<CustomScaleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(lastFrame() ?? '').toContain('Name:');
  });
});

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

describe('CustomScaleEditor — validation', () => {
  it('submitting empty name shows the validation error message', async () => {
    const { lastFrame, stdin } = render(<CustomScaleEditor onSave={vi.fn()} onCancel={vi.fn()} />);
    await flush();
    await act(async () => {
      stdin.write('\r'); // submit with empty name → handleNameSubmit fires
      await flush();
    });
    expect(lastFrame() ?? '').toContain('Name must be 1-40 characters');
  });

  it('submitting a name longer than 40 chars shows the validation error', async () => {
    const { lastFrame, stdin } = render(
      <CustomScaleEditor
        initialName={'x'.repeat(41)} // initialName > 40 chars seeds the state
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await flush();
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(lastFrame() ?? '').toContain('Name must be 1-40 characters');
  });
});

// ---------------------------------------------------------------------------
// Cancel callback
// ---------------------------------------------------------------------------

describe('CustomScaleEditor — cancel', () => {
  it('escape while in name-editing mode calls onCancel', async () => {
    const onCancel = vi.fn();
    const { stdin } = render(<CustomScaleEditor onSave={vi.fn()} onCancel={onCancel} />);
    await flush();
    await act(async () => {
      stdin.write('\x1b');
      await flush();
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
