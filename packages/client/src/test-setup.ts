import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { webcrypto } from 'node:crypto';
import { vi } from 'vitest';

// jsdom's `crypto` has no `subtle`, which every browser the app runs in has. Node's is the same
// Web Crypto, so participant keys (ADR-0059) derive here exactly as they do in the app.
if (typeof globalThis.crypto !== 'undefined' && !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: webcrypto.subtle,
  });
}

// jsdom does not implement matchMedia — define a stub so vi.spyOn can replace it
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (_query: string): MediaQueryList =>
      ({
        matches: false,
        media: _query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

// jsdom does not implement Element.animate — define a stub so vi.spyOn can intercept it.
// Assigned as a plain property (not defineProperty) so vi.spyOn can wrap it.
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.animate) {
  const makeFakeAnimation = (): Animation => {
    const fakeAnimation: {
      cancel: ReturnType<typeof vi.fn>;
      finish: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      onfinish: (() => void) | null;
      currentTime: number;
    } = {
      cancel: vi.fn(),
      finish: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      onfinish: null,
      currentTime: 0,
    };
    return fakeAnimation as unknown as Animation;
  };

  // Assign as a regular property so vi.spyOn(HTMLElement.prototype, 'animate') can wrap it.
  HTMLElement.prototype.animate = function (
    _keyframes: Keyframe[] | null,
    _options?: number | KeyframeAnimationOptions,
  ): Animation {
    return makeFakeAnimation();
  };
}

/**
 * Helper exposed for tests that need to simulate animation completion.
 * Call `triggerAnimationFinish(anim)` to invoke `anim.onfinish?.()`.
 */
export function triggerAnimationFinish(anim: Animation): void {
  (anim as unknown as { onfinish: (() => void) | null }).onfinish?.();
}

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
  teardown: { destroyAfterEach: true },
});
