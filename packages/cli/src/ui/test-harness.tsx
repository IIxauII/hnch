/**
 * Shared mounting helpers for ink render tests.
 *
 * ink's `App` attaches its stdin `readable` listener in `componentDidMount`
 * (synchronous with the commit), but `useInput` registers its handler on the
 * internal event emitter from a `useEffect` — a passive effect React flushes
 * on a scheduler task. A bare `render()` therefore returns before any
 * `useInput` handler exists, and a keypress written in that window is read by
 * `App`, dispatched to zero listeners, and silently dropped.
 *
 * `renderInk` closes that window by mounting inside `act`, so every passive
 * effect has run before the first `stdin.write`. `press` keeps subsequent
 * writes inside `act` as well, so state updates they trigger are committed
 * before the next assertion.
 */

import type React from 'react';
import { render } from 'ink-testing-library';
import { act } from 'react';

export type InkRenderResult = ReturnType<typeof render>;

/** Resolve after the current macrotask, letting ink repaint. */
export async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

/** Mount an ink element with its `useInput` handlers already registered. */
export async function renderInk(element: React.ReactElement): Promise<InkRenderResult> {
  let result: InkRenderResult | undefined;
  await act(async () => {
    result = render(element);
    await flush();
  });
  if (!result) throw new Error('renderInk: render produced no result');
  return result;
}

/** Write a key sequence to a mounted app and settle the resulting render. */
export async function press(stdin: InkRenderResult['stdin'], sequence: string): Promise<void> {
  await act(async () => {
    stdin.write(sequence);
    await flush();
  });
}
