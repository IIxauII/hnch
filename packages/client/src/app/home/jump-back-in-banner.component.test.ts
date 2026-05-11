/**
 * Unit tests for JumpBackInBannerComponent helpers.
 *
 * screenCopy is module-private, so it is inline-spec'd following the
 * lobby.page.test.ts pattern. onTap is verified via a minimal component
 * stub that mirrors the production guard logic.
 */

import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// screenCopy — inline-spec mirroring jump-back-in-banner.component.ts
// ---------------------------------------------------------------------------

type LastSessionScreen = 'lobby' | 'estimating';

function screenCopy(screen: LastSessionScreen): string {
  switch (screen) {
    case 'lobby':
      return 'In the lobby';
    case 'estimating':
      return 'Estimating now';
  }
}

// ---------------------------------------------------------------------------
// onTap stub — mirrors the guard in JumpBackInBannerComponent.onTap()
// Signal inputs are represented as plain functions in the stub.
// ---------------------------------------------------------------------------

function makeComponent(resuming: boolean, stale: boolean) {
  const resumeRequested = { emit: vi.fn() };
  const component = {
    resuming: () => resuming,
    stale: () => stale,
    resumeRequested,
    onTap() {
      if (this.resuming() && !this.stale()) return;
      this.resumeRequested.emit();
    },
  };
  return { component, emit: resumeRequested.emit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JumpBackInBannerComponent — screenCopy', () => {
  it('lobby → "In the lobby"', () => {
    expect(screenCopy('lobby')).toBe('In the lobby');
  });

  it('estimating → "Estimating now"', () => {
    expect(screenCopy('estimating')).toBe('Estimating now');
  });
});

describe('JumpBackInBannerComponent — onTap guard', () => {
  it('does not emit when resuming and not stale (prevents double-tap)', () => {
    const { component, emit } = makeComponent(true, false);
    component.onTap();
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits when resuming=true but stale=true (tap clears stale banner)', () => {
    const { component, emit } = makeComponent(true, true);
    component.onTap();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('emits when not resuming (normal tap)', () => {
    const { component, emit } = makeComponent(false, false);
    component.onTap();
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
