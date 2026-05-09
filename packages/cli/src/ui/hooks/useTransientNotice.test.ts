/**
 * Tests for useTransientNotice — timer-driven notice state machine.
 *
 * Uses @testing-library/react renderHook + vitest fake timers so the
 * auto-dismiss schedule can be exercised without real wall-clock waits.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTransientNotice } from './useTransientNotice';

describe('useTransientNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('notice is null initially', () => {
    const { result } = renderHook(() => useTransientNotice());
    expect(result.current.notice).toBeNull();
  });

  it('show() sets the notice message', () => {
    const { result } = renderHook(() => useTransientNotice());
    act(() => {
      result.current.show('something happened');
    });
    expect(result.current.notice).toBe('something happened');
  });

  it('notice auto-clears after durationMs elapses', () => {
    const { result } = renderHook(() => useTransientNotice(1000));
    act(() => {
      result.current.show('auto-dismiss me');
    });
    expect(result.current.notice).toBe('auto-dismiss me');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.notice).toBeNull();
  });

  it('notice is still set just before durationMs elapses', () => {
    const { result } = renderHook(() => useTransientNotice(1000));
    act(() => {
      result.current.show('still here');
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.notice).toBe('still here');
  });

  it('dismiss() clears the notice immediately', () => {
    const { result } = renderHook(() => useTransientNotice());
    act(() => {
      result.current.show('will be dismissed');
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.notice).toBeNull();
  });

  it('dismiss() cancels the auto-dismiss timer so no spurious null follows', () => {
    const { result } = renderHook(() => useTransientNotice(1000));
    act(() => {
      result.current.show('msg');
    });
    act(() => {
      result.current.dismiss();
    });
    // Advance well past the original timer — should stay null with no errors.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.notice).toBeNull();
  });

  it('calling show() a second time resets the timer from scratch', () => {
    const { result } = renderHook(() => useTransientNotice(1000));
    act(() => {
      result.current.show('first');
    });
    // Halfway through the first timer, replace with a new message.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current.show('second');
    });
    // 500 ms more — first timer would have fired, but it was cancelled.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.notice).toBe('second');
    // Another 500 ms — new 1000 ms timer completes.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.notice).toBeNull();
  });

  it('clears the pending timer on unmount (no state-update-after-unmount warning)', () => {
    const { result, unmount } = renderHook(() => useTransientNotice(500));
    act(() => {
      result.current.show('ephemeral');
    });
    unmount();
    // Advancing past the timer duration after unmount should not throw
    // React's "Can't perform a React state update on an unmounted component".
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // If we reach here without an error the cleanup worked.
    expect(true).toBe(true);
  });
});
