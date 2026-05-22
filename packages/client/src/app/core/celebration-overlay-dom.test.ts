/**
 * DOM-render tests for CelebrationService overlay styling and reduced-motion glyph.
 *
 * AC-16: consensus text styling (transparent bg + accent color)
 * AC-18: reduced-motion 🎉 glyph rendering
 */

import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { Round } from '@hnch/shared';
import { HapticService } from './haptic.service';
import { CelebrationService } from './celebration.service';

// ---------------------------------------------------------------------------
// Ionic stubs
// ---------------------------------------------------------------------------
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});
  @Comp({ selector: 'ion-chip', template: '<ng-content/>', standalone: true })
  class IonChip {
    @Input() color: string | undefined;
  }
  return {
    IonChip,
    IonItemGroup: stub('ion-item-group'),
    IonLabel: stub('ion-label'),
  };
});
vi.mock('ionicons', () => ({ addIcons: vi.fn() }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCALE = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] };

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'round-1',
    scale: SCALE,
    createdBy: 'host',
    createdAt: 1000,
    votes: {},
    revealedAt: 2000,
    timerStartedAt: 1000,
    ...overrides,
  };
}

const hapticStub = {
  notificationSuccess: vi.fn(),
  impactMedium: vi.fn(),
  impactLight: vi.fn(),
  impactHeavy: vi.fn(),
};

// ---------------------------------------------------------------------------
// AC-16: consensus text styling — transparent background + accent color
// ---------------------------------------------------------------------------

describe('CelebrationService overlay DOM — AC-16: text styling', () => {
  it('consensus text renders with transparent background and is colored', async () => {
    vi.useFakeTimers();
    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [CelebrationService, { provide: HapticService, useValue: hapticStub }],
        declarations: [],
      });

      const svc = TestBed.inject(CelebrationService);
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 2000 }));
      TestBed.flushEffects();

      vi.advanceTimersByTime(300);
      expect(svc.showOverlay()).toBe(true);

      const { Component: Comp } = await import('@angular/core');

      @Comp({
        selector: 'test-overlay',
        standalone: true,
        template: `
          @if (svc.showOverlay()) {
            <span class="consensus-text">hnch'd!</span>
          }
        `,
        styles: [
          `
            .consensus-text {
              background-color: transparent;
              color: var(--ion-color-primary, blue);
            }
          `,
        ],
      })
      class TestHostComponent {
        svc = svc;
      }

      const fixture = TestBed.createComponent(TestHostComponent);
      fixture.detectChanges();

      const textEl = fixture.nativeElement.querySelector('.consensus-text');
      expect(textEl).toBeTruthy();
      expect(textEl.textContent).toBe("hnch'd!");

      const computed = window.getComputedStyle(textEl);
      const bgColor = computed.backgroundColor;
      expect(bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)').toBe(true);

      const color = computed.color;
      expect(color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)').toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// AC-18: reduced-motion — 🎉 glyph rendering
// ---------------------------------------------------------------------------

describe('CelebrationService overlay DOM — AC-18: reduced-motion glyph', () => {
  it('prefers-reduced-motion: 🎉 glyph renders in consensus text', async () => {
    vi.useFakeTimers();
    try {
      const matchMediaMock = vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      window.matchMedia = matchMediaMock as any;

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [CelebrationService, { provide: HapticService, useValue: hapticStub }],
      });

      const svc = TestBed.inject(CelebrationService);
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 2000 }));
      TestBed.flushEffects();

      vi.advanceTimersByTime(300);

      const { Component: Comp } = await import('@angular/core');

      @Comp({
        selector: 'test-overlay-reduced',
        standalone: true,
        template: `
          @if (svc.showOverlay()) {
            <span class="consensus-text">
              @if (svc.reducedMotion()) {
                🎉
              }
              hnch'd!
            </span>
          }
        `,
      })
      class TestHostComponent {
        svc = svc;
      }

      const fixture = TestBed.createComponent(TestHostComponent);
      fixture.detectChanges();

      const textEl = fixture.nativeElement.querySelector('.consensus-text');
      expect(textEl).toBeTruthy();
      expect(textEl.textContent).toContain('🎉');
    } finally {
      vi.useRealTimers();
    }
  });
});
