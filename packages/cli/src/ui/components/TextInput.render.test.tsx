/**
 * Render tests for TextInput.tsx using ink-testing-library.
 *
 * TextInput is a controlled component — `value` comes from the parent
 * and changes are communicated back via `onChange`. Tests verify both
 * what is rendered and that the correct callbacks are fired for each
 * key event.
 */

// Exercises: ui/components/TextInput:TextInput

import React from 'react';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TextInput } from './TextInput.js';

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('TextInput — display', () => {
  it('shows value when non-empty', () => {
    const { lastFrame } = render(<TextInput value="hello" onChange={vi.fn()} onSubmit={vi.fn()} />);
    expect(lastFrame() ?? '').toContain('hello');
  });

  it('shows placeholder when value is empty and placeholder provided', () => {
    const { lastFrame } = render(
      <TextInput value="" onChange={vi.fn()} onSubmit={vi.fn()} placeholder="Type here" />,
    );
    expect(lastFrame() ?? '').toContain('Type here');
  });

  it('does not show placeholder when value is non-empty', () => {
    const { lastFrame } = render(
      <TextInput value="hi" onChange={vi.fn()} onSubmit={vi.fn()} placeholder="Type here" />,
    );
    expect(lastFrame() ?? '').not.toContain('Type here');
  });

  it('masks non-empty value with asterisks when mask=true', () => {
    const { lastFrame } = render(
      <TextInput value="abc" onChange={vi.fn()} onSubmit={vi.fn()} mask />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('***');
    expect(frame).not.toContain('abc');
  });

  it('shows placeholder (not asterisks) when mask=true and value is empty', () => {
    const { lastFrame } = render(
      <TextInput
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        mask
        placeholder="Enter password"
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Enter password');
    expect(frame).not.toContain('*');
  });
});

// ---------------------------------------------------------------------------
// Keyboard callbacks
// ---------------------------------------------------------------------------

describe('TextInput — keyboard callbacks', () => {
  it('calls onChange with value + typed char on printable input', async () => {
    const onChange = vi.fn();
    const { stdin } = render(<TextInput value="ab" onChange={onChange} onSubmit={vi.fn()} />);
    await flush();
    await act(async () => {
      stdin.write('c');
      await flush();
    });
    expect(onChange).toHaveBeenCalledWith('abc');
  });

  it('calls onChange with value minus last char on backspace', async () => {
    const onChange = vi.fn();
    const { stdin } = render(<TextInput value="hello" onChange={onChange} onSubmit={vi.fn()} />);
    await flush();
    await act(async () => {
      stdin.write('\x7f'); // DEL / backspace code
      await flush();
    });
    expect(onChange).toHaveBeenCalledWith('hell');
  });

  it('calls onSubmit with current value on enter', async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<TextInput value="done" onChange={vi.fn()} onSubmit={onSubmit} />);
    await flush();
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onSubmit).toHaveBeenCalledWith('done');
  });

  it('calls onCancel on escape', async () => {
    const onCancel = vi.fn();
    const { stdin } = render(
      <TextInput value="x" onChange={vi.fn()} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    await flush();
    await act(async () => {
      stdin.write('\x1b'); // ESC
      await flush();
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('ignores printable input when isActive=false', async () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <TextInput value="" onChange={onChange} onSubmit={vi.fn()} isActive={false} />,
    );
    await flush();
    await act(async () => {
      stdin.write('a');
      await flush();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores enter when isActive=false', async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <TextInput value="val" onChange={vi.fn()} onSubmit={onSubmit} isActive={false} />,
    );
    await flush();
    await act(async () => {
      stdin.write('\r');
      await flush();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
