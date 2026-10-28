// Exercises: utils/composing-key:isComposingKey

import { describe, expect, it } from 'vitest';

import { isComposingKey } from './composing-key';

describe('isComposingKey', () => {
  it('is false for a plain Enter', () => {
    expect(isComposingKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
  });

  it('is true for the Enter that confirms a composition', () => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true });
    expect(isComposingKey(event)).toBe(true);
  });

  // Safari: the composition has ended by the time the key is reported.
  it('is true for one that is only known by its key code', () => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 });
    expect(isComposingKey(event)).toBe(true);
  });

  it('is false for an event that is no key press', () => {
    expect(isComposingKey(new Event('keydown'))).toBe(false);
  });
});
