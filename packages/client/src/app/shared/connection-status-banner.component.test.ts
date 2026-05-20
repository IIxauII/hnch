/**
 * Tests for ConnectionStatusBannerComponent — TestBed rendering.
 *
 * Exercises the reconnecting() signal guard and the accessibility attributes
 * rendered by the real component in JSDOM. The prior version read source text
 * via readFileSync (zero production imports); this version mounts the real
 * component through TestBed so renaming or restructuring the template breaks
 * the tests appropriately.
 *
 * Intentionally absent:
 *  - CSS token assertions — JSDOM does not evaluate CSS; source-text scanning
 *    is forbidden per the No-Simulation rule.
 *  - recentlyReconnected() toast timing — requires fake timers; the behavioral
 *    signal contract is captured by the falling-edge test below.
 */

// Exercises: connection-status-banner.component:ConnectionStatusBannerComponent

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {
    @Input() name: string | undefined;
  }

  @Comp({ selector: 'ion-toast', template: '', standalone: true })
  class IonToast {
    @Input() isOpen: boolean | undefined;
    @Input() message: string | undefined;
    @Input() position: string | undefined;
    @Input() color: string | undefined;
    @Input() duration: number | undefined;
  }

  return { IonIcon, IonToast };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ syncOutline: '' }));

import { DocService } from '../core/doc/doc.service';
import { ConnectionStatusBannerComponent } from './connection-status-banner.component';

function makeDocStub(initial = false) {
  const reconnecting = signal(initial);
  return {
    stub: { reconnecting: reconnecting.asReadonly() },
    setReconnecting: (v: boolean) => reconnecting.set(v),
  };
}

function mount(initial = false) {
  const { stub, setReconnecting } = makeDocStub(initial);
  TestBed.configureTestingModule({
    providers: [{ provide: DocService, useValue: stub }],
  });
  const fixture = TestBed.createComponent(ConnectionStatusBannerComponent);
  fixture.detectChanges();
  return { fixture, setReconnecting };
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.clearAllMocks();
});

// Exercises: connection-status-banner.component:ConnectionStatusBannerComponent
describe('ConnectionStatusBannerComponent — banner visibility', () => {
  it('banner div absent when reconnecting is false', () => {
    const { fixture } = mount(false);
    const banner = fixture.nativeElement.querySelector('[data-testid="connection-status-banner"]');
    expect(banner).toBeNull();
  });

  it('banner div present when reconnecting is true', () => {
    const { fixture } = mount(true);
    const banner = fixture.nativeElement.querySelector('[data-testid="connection-status-banner"]');
    expect(banner).not.toBeNull();
  });

  it('banner div has role="status" for screen readers', () => {
    const { fixture } = mount(true);
    const banner = fixture.nativeElement.querySelector('[data-testid="connection-status-banner"]');
    expect(banner?.getAttribute('role')).toBe('status');
  });

  it('banner div has aria-live="polite" for screen readers', () => {
    const { fixture } = mount(true);
    const banner = fixture.nativeElement.querySelector('[data-testid="connection-status-banner"]');
    expect(banner?.getAttribute('aria-live')).toBe('polite');
  });

  it('banner appears when reconnecting transitions from false to true', () => {
    const { fixture, setReconnecting } = mount(false);
    expect(
      fixture.nativeElement.querySelector('[data-testid="connection-status-banner"]'),
    ).toBeNull();

    setReconnecting(true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="connection-status-banner"]'),
    ).not.toBeNull();
  });

  it('banner disappears when reconnecting transitions from true to false', () => {
    const { fixture, setReconnecting } = mount(true);
    expect(
      fixture.nativeElement.querySelector('[data-testid="connection-status-banner"]'),
    ).not.toBeNull();

    setReconnecting(false);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="connection-status-banner"]'),
    ).toBeNull();
  });
});
