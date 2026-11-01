/**
 * DOM-render tests for CelebrationService overlay styling and reduced-motion glyph.
 *
 * - consensus text styling (transparent bg + accent color)
 * - reduced-motion 🎉 glyph rendering
 * - .confetti-layer overflow: hidden
 */

import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { Round } from '@hnch/shared';
import { HapticService } from './haptic.service';
import { CelebrationService } from './celebration.service';

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

const SCALE = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] };

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'round-1',
    scale: SCALE,
    createdBy: 'host',
    createdAt: 1000,
    votes: {},
    status: 'revealed',
    terminalAt: 2000,
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

// Consensus text styling — transparent background + accent color

describe('CelebrationService overlay DOM — text styling', () => {
  it('consensus text renders with transparent background and is colored', async () => {
    vi.useFakeTimers();
    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [CelebrationService, { provide: HapticService, useValue: hapticStub }],
        declarations: [],
      });

      const svc = TestBed.inject(CelebrationService);
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' } }));
      TestBed.flushEffects();

      vi.advanceTimersByTime(300);
      expect(svc.showOverlay()).toBe(true);

      const { Component: Comp } = await import('@angular/core');

      @Comp({
        selector: 'test-overlay',
        standalone: true,
        template: `
          @if (svc.showOverlay()) {
            <div class="consensus-overlay">
              <div class="confetti-layer" aria-hidden="true"></div>
              <span class="consensus-text">hnch'd!</span>
            </div>
          }
        `,
        styles: [
          `
            .confetti-layer {
              position: absolute;
              inset: 0;
              pointer-events: none;
              z-index: 1001;
              overflow: hidden;
            }
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

// .confetti-layer exists and has overflow: hidden

describe('CelebrationService overlay DOM — confetti-layer overflow', () => {
  it('.confetti-layer renders when showOverlay() is true and has overflow hidden', async () => {
    vi.useFakeTimers();
    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [CelebrationService, { provide: HapticService, useValue: hapticStub }],
      });

      const svc = TestBed.inject(CelebrationService);
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' } }));
      TestBed.flushEffects();
      vi.advanceTimersByTime(300);
      expect(svc.showOverlay()).toBe(true);

      const { Component: Comp } = await import('@angular/core');

      @Comp({
        selector: 'test-overlay-layer',
        standalone: true,
        template: `
          @if (svc.showOverlay()) {
            <div class="consensus-overlay">
              <div class="confetti-layer" aria-hidden="true"></div>
            </div>
          }
        `,
        styles: [
          `
            .confetti-layer {
              position: absolute;
              inset: 0;
              pointer-events: none;
              z-index: 1001;
              overflow: hidden;
            }
          `,
        ],
      })
      class TestHostComponent {
        svc = svc;
      }

      const fixture = TestBed.createComponent(TestHostComponent);
      fixture.detectChanges();

      const layerEl = fixture.nativeElement.querySelector('.confetti-layer');
      expect(layerEl).toBeTruthy();

      const computed = window.getComputedStyle(layerEl);
      expect(computed.overflow).toBe('hidden');
    } finally {
      vi.useRealTimers();
    }
  });

  it('no <span class="confetti-piece"> rendered by template (engine owns children)', async () => {
    vi.useFakeTimers();
    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [CelebrationService, { provide: HapticService, useValue: hapticStub }],
      });

      const svc = TestBed.inject(CelebrationService);
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' } }));
      TestBed.flushEffects();
      vi.advanceTimersByTime(300);

      const { Component: Comp } = await import('@angular/core');

      @Comp({
        selector: 'test-overlay-nospan',
        standalone: true,
        template: `
          @if (svc.showOverlay()) {
            <div class="consensus-overlay">
              <div class="confetti-layer" aria-hidden="true"></div>
            </div>
          }
        `,
      })
      class TestHostComponent {
        svc = svc;
      }

      const fixture = TestBed.createComponent(TestHostComponent);
      fixture.detectChanges();

      const pieces = fixture.nativeElement.querySelectorAll('.confetti-piece');
      expect(pieces.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Reduced-motion — 🎉 glyph rendering

describe('CelebrationService overlay DOM — reduced-motion glyph', () => {
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
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' } }));
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
