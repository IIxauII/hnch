/**
 * Unit tests for OnboardingPage pure logic.
 *
 * No TestBed, no Ionic rendering — inline predicates mirror the
 * production logic, following the pattern in lobby.page.test.ts.
 *
 * Covers:
 * - canContinue: trim-based non-empty predicate
 * - submit() guard: no-op when canContinue is false or isSubmitting is true
 * - pending URL redirect: navigates to stashed URL instead of /home when present
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: {},
  IonContent: {},
  IonFooter: {},
  IonHeader: {},
  IonInput: {},
  IonItem: {},
  IonList: {},
  IonNote: {},
  IonToolbar: {},
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

// ---------------------------------------------------------------------------
// Inline helpers mirroring OnboardingPage predicates
// ---------------------------------------------------------------------------

/** Mirror of canContinue = computed(() => rawValue().trim().length > 0). */
function canContinue(rawValue: string): boolean {
  return rawValue.trim().length > 0;
}

// ---------------------------------------------------------------------------
// canContinue
// ---------------------------------------------------------------------------

describe('OnboardingPage canContinue', () => {
  it('returns false for an empty string', () => {
    expect(canContinue('')).toBe(false);
  });

  it('returns false for a whitespace-only string', () => {
    expect(canContinue('   ')).toBe(false);
    expect(canContinue('\t')).toBe(false);
    expect(canContinue('\n')).toBe(false);
  });

  it('returns true for a single character', () => {
    expect(canContinue('A')).toBe(true);
  });

  it('returns true for a name with leading/trailing spaces', () => {
    expect(canContinue('  Alice  ')).toBe(true);
  });

  it('returns true for a typical display name', () => {
    expect(canContinue('Alice')).toBe(true);
  });

  it('returns true for a name with Unicode characters', () => {
    expect(canContinue('张伟')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// submit() guard
// ---------------------------------------------------------------------------

describe('OnboardingPage submit() guard', () => {
  it('does nothing when canContinue is false', async () => {
    const setDisplayName = vi.fn(async () => {});
    const navigate = vi.fn(async () => true);

    let submitting = false;

    async function submit(rawValue: string): Promise<void> {
      if (!canContinue(rawValue) || submitting) return;
      submitting = true;
      try {
        await setDisplayName(rawValue.trim());
        await navigate('/home');
      } finally {
        submitting = false;
      }
    }

    await submit('');
    expect(setDisplayName).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does nothing when isSubmitting is already true (re-entrancy guard)', async () => {
    const setDisplayName = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 100)));
    const navigate = vi.fn(async () => true);
    let submitting = false;

    async function submit(rawValue: string): Promise<void> {
      if (!canContinue(rawValue) || submitting) return;
      submitting = true;
      try {
        await setDisplayName(rawValue.trim());
        await navigate('/home');
      } finally {
        submitting = false;
      }
    }

    // Kick off first submission and immediately try a second.
    const first = submit('Alice');
    // At this point submitting = true; second call should be a no-op.
    await submit('Alice');
    expect(setDisplayName).toHaveBeenCalledOnce();
    await first;
  });

  it('navigates to pending URL when one is stashed, not to /home', async () => {
    const setDisplayName = vi.fn(async () => {});
    const clearPendingUrl = vi.fn(async () => {});
    const navigateByUrl = vi.fn(async () => true);
    const navigate = vi.fn(async () => true);

    const pendingUrl = '/join?code=ABC123';

    async function submit(rawValue: string): Promise<void> {
      if (!canContinue(rawValue)) return;
      await setDisplayName(rawValue.trim());
      const pending = pendingUrl;
      if (pending) {
        await clearPendingUrl();
        await navigateByUrl(pending);
        return;
      }
      await navigate('/home');
    }

    await submit('Bob');

    expect(navigateByUrl).toHaveBeenCalledWith('/join?code=ABC123');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates to /home when no pending URL exists', async () => {
    const setDisplayName = vi.fn(async () => {});
    const navigate = vi.fn(async () => true);
    const navigateByUrl = vi.fn(async () => true);

    async function submit(rawValue: string): Promise<void> {
      if (!canContinue(rawValue)) return;
      await setDisplayName(rawValue.trim());
      const pending: string | null = null;
      if (pending) {
        await navigateByUrl(pending);
        return;
      }
      await navigate('/home');
    }

    await submit('Carol');

    expect(navigate).toHaveBeenCalledWith('/home');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
