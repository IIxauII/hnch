// Exercises: utils/focus-field:focusField

import type { IonInput } from '@ionic/angular/standalone';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { focusField } from './focus-field';

/** A field whose native input is `input`, there once `ready` resolves. */
function fieldWith(input: HTMLInputElement, ready: Promise<void> = Promise.resolve()): IonInput {
  return {
    getInputElement: async () => {
      await ready;
      return input;
    },
    // What `focusField` must not rely on: a no-op on a field not rendered yet.
    setFocus: async () => {},
  } as unknown as IonInput;
}

function inputIn(parent: HTMLElement): HTMLInputElement {
  const input = document.createElement('input');
  parent.append(input);
  return input;
}

describe('focusField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('puts the cursor in the field', async () => {
    const input = inputIn(document.body);

    await focusField(fieldWith(input));

    expect(document.activeElement).toBe(input);
  });

  // `setFocus()` on a field that has only just been created finds no input
  // to focus, and says nothing about it.
  it('waits for a field that has not rendered its input yet', async () => {
    const input = inputIn(document.body);
    let rendered!: () => void;
    const ready = new Promise<void>((resolve) => {
      rendered = resolve;
    });

    const focused = focusField(fieldWith(input, ready));
    await vi.advanceTimersByTimeAsync(50);
    expect(document.activeElement).not.toBe(input);

    rendered();
    await focused;
    expect(document.activeElement).toBe(input);
  });

  it('waits for the sheet the field is in to have opened', async () => {
    const sheet = document.createElement('ion-modal');
    document.body.append(sheet);
    const input = inputIn(sheet);

    const focused = focusField(fieldWith(input));
    await vi.advanceTimersByTimeAsync(100);
    expect(document.activeElement).not.toBe(input);

    sheet.dispatchEvent(new CustomEvent('didPresent'));
    await focused;
    expect(document.activeElement).toBe(input);
  });

  it('does not wait for ever on a sheet that was open already', async () => {
    const sheet = document.createElement('ion-modal');
    document.body.append(sheet);
    const input = inputIn(sheet);

    const focused = focusField(fieldWith(input));
    await vi.advanceTimersByTimeAsync(600);
    await focused;

    expect(document.activeElement).toBe(input);
  });

  it('leaves a field alone that went away while it waited', async () => {
    const sheet = document.createElement('ion-modal');
    document.body.append(sheet);
    const input = inputIn(sheet);
    const focus = vi.spyOn(input, 'focus');

    const focused = focusField(fieldWith(input));
    sheet.remove();
    await vi.advanceTimersByTimeAsync(600);
    await focused;

    expect(focus).not.toHaveBeenCalled();
  });

  it('does nothing without a field', async () => {
    await expect(focusField(undefined)).resolves.toBeUndefined();
  });

  it('is silent about a field that cannot be focused', async () => {
    const broken = {
      getInputElement: () => Promise.reject(new Error('no input')),
    } as unknown as IonInput;

    await expect(focusField(broken)).resolves.toBeUndefined();
    await expect(focusField({} as unknown as IonInput)).resolves.toBeUndefined();
  });
});
