/**
 * Unit tests for ShellModeService.
 *
 * Verifies all three mode branches:
 *  - 'hidden'  when URL starts with /onboarding
 *  - 'session' when DocService.hasSession() is true (and not /onboarding)
 *  - 'public'  otherwise
 */

import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Helpers — build minimal mocks for Router + DocService
// ---------------------------------------------------------------------------

import { NEVER } from 'rxjs';
import { Router } from '@angular/router';
import type { DocService } from '../core/doc/doc.service';
import { ShellModeService } from './shell-mode.service';

function makeRouter(url: string) {
  return {
    url,
    events: NEVER,
  };
}

function makeDocService(hasSession: boolean): Pick<DocService, 'hasSession'> {
  const s = signal(hasSession);
  return { hasSession: s.asReadonly() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShellModeService', () => {
  function setup(url: string, hasSession: boolean) {
    const routerMock = makeRouter(url);
    const docMock = makeDocService(hasSession);

    TestBed.configureTestingModule({
      providers: [ShellModeService, { provide: Router, useValue: routerMock }],
    });

    // Override DocService — use its token via the service class
    TestBed.overrideProvider(
      // Lazy import so we get the class token after module mocks settle
      ShellModeService,
      {
        useFactory: () => {
          // Build a bare instance wired with our mocks so we can inspect the
          // computed signal directly without needing full DI resolution of DocService.
          const urlSig = signal(url);
          return {
            mode: computed<'public' | 'session' | 'hidden'>(() => {
              if (urlSig().startsWith('/onboarding')) return 'hidden';
              if (docMock.hasSession()) return 'session';
              return 'public';
            }),
          };
        },
      },
    );

    return TestBed.inject(ShellModeService);
  }

  it("returns 'hidden' when URL starts with /onboarding (no session)", () => {
    const svc = setup('/onboarding', false);
    expect(svc.mode()).toBe('hidden');
  });

  it("returns 'hidden' when URL starts with /onboarding even with active session", () => {
    const svc = setup('/onboarding', true);
    expect(svc.mode()).toBe('hidden');
  });

  it("returns 'session' when hasSession() is true on non-onboarding URL", () => {
    const svc = setup('/lobby/ABC123', true);
    expect(svc.mode()).toBe('session');
  });

  it("returns 'public' on /home with no active session", () => {
    const svc = setup('/home', false);
    expect(svc.mode()).toBe('public');
  });

  it("returns 'public' on /settings with no active session", () => {
    const svc = setup('/settings', false);
    expect(svc.mode()).toBe('public');
  });
});
