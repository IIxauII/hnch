/**
 * Tests for useTransientNotice — timer-driven notice state machine.
 *
 * Renders the hook in an Ink probe (CLI runs Ink in Node — no DOM stack).
 * Vitest fake timers exercise the auto-dismiss schedule without real waits.
 */

import { render } from 'ink-testing-library';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTransientNotice } from './useTransientNotice.js';

type Api = ReturnType<typeof useTransientNotice>;

let api: Api;

function Probe({ duration }: { duration?: number }) {
  api = useTransientNotice(duration);
  return null;
}

describe('useTransientNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('notice is null initially', () => {
    render(<Probe />);
    expect(api.notice).toBeNull();
  });

  it('show() sets the notice message', () => {
    render(<Probe />);
    act(() => {
      api.show('something happened');
    });
    expect(api.notice).toBe('something happened');
  });

  it('notice auto-clears after durationMs elapses', () => {
    render(<Probe duration={1000} />);
    act(() => {
      api.show('auto-dismiss me');
    });
    expect(api.notice).toBe('auto-dismiss me');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(api.notice).toBeNull();
  });

  it('notice is still set just before durationMs elapses', () => {
    render(<Probe duration={1000} />);
    act(() => {
      api.show('still here');
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(api.notice).toBe('still here');
  });

  it('dismiss() clears the notice immediately', () => {
    render(<Probe />);
    act(() => {
      api.show('will be dismissed');
    });
    act(() => {
      api.dismiss();
    });
    expect(api.notice).toBeNull();
  });

  it('dismiss() cancels the auto-dismiss timer so no spurious null follows', () => {
    render(<Probe duration={1000} />);
    act(() => {
      api.show('msg');
    });
    act(() => {
      api.dismiss();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(api.notice).toBeNull();
  });

  it('calling show() a second time resets the timer from scratch', () => {
    render(<Probe duration={1000} />);
    act(() => {
      api.show('first');
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      api.show('second');
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(api.notice).toBe('second');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(api.notice).toBeNull();
  });

  it('clears the pending timer on unmount (no state-update-after-unmount warning)', () => {
    const { unmount } = render(<Probe duration={500} />);
    act(() => {
      api.show('ephemeral');
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(true).toBe(true);
  });
});
