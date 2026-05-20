/**
 * Tests for ConnectionStatusBannerComponent — TestBed rendering.
 *
 * Exercises the reconnecting() signal guard and the accessibility attributes
 * rendered by the real component in JSDOM. The prior version read source text
 * via readFileSync (zero production imports); this version mounts the real
 * component through TestBed so renaming or restructuring the template breaks
 * the tests appropriately.
 *
 * Uses TestBed.overrideComponent to strip the IonIcon/IonToast Ionic imports
 * (which JIT cannot resolve in JSDOM) while keeping the component template
 * intact so the @if block, ARIA attributes, and data-testid are tested against
 * the real rendered output.
 *
 * Intentionally absent:
 *  - CSS token assertions — JSDOM does not evaluate CSS; source-text scanning
 *    is forbidden per the No-Simulation rule.
 *  - recentlyReconnected() toast timing — requires fake timers; the behavioral
 *    signal contract is captured by the falling-edge tests below.
 */

// Exercises: connection-status-banner.component:ConnectionStatusBannerComponent

import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ syncOutline: '' }));
vi.mock('@ionic/angular/standalone', () => ({ IonIcon: {}, IonToast: {} }));

import { DocService } from '../core/doc/doc.service';
import { ConnectionStatusBannerComponent } from './connection-status-banner.component';

function makeMockDocService(initial = false) {
  const reconnecting = signal(initial);
  return {
    stub: { reconnecting: reconnecting.asReadonly() },
    setReconnecting: (v: boolean) => reconnecting.set(v),
  };
}

function mount(initial = false) {
  const { stub, setReconnecting } = makeMockDocService(initial);
  TestBed.configureTestingModule({
    schemas: [NO_ERRORS_SCHEMA],
    providers: [{ provide: DocService, useValue: stub }],
  });
  TestBed.overrideComponent(ConnectionStatusBannerComponent, { set: { imports: [] } });
  const fixture = TestBed.createComponent(ConnectionStatusBannerComponent);
  fixture.detectChanges();
  return { fixture, setReconnecting };
}

function getBanner(fixture: ReturnType<typeof mount>['fixture']): Element | null {
  return fixture.nativeElement.querySelector('[data-testid="connection-status-banner"]');
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.clearAllMocks();
});

// Exercises: connection-status-banner.component:ConnectionStatusBannerComponent
describe('ConnectionStatusBannerComponent — banner visibility', () => {
  it('banner div absent when reconnecting is false', () => {
    const { fixture } = mount(false);
    expect(getBanner(fixture)).toBeNull();
  });

  it('banner div present when reconnecting is true', () => {
    const { fixture } = mount(true);
    expect(getBanner(fixture)).not.toBeNull();
  });

  it('banner div has role="status" for screen readers', () => {
    const { fixture } = mount(true);
    expect(getBanner(fixture)?.getAttribute('role')).toBe('status');
  });

  it('banner div has aria-live="polite" for screen readers', () => {
    const { fixture } = mount(true);
    expect(getBanner(fixture)?.getAttribute('aria-live')).toBe('polite');
  });
});

describe('ConnectionStatusBannerComponent — signal transitions', () => {
  it('banner appears when reconnecting transitions false → true', () => {
    const { fixture, setReconnecting } = mount(false);
    expect(getBanner(fixture)).toBeNull();
    setReconnecting(true);
    fixture.detectChanges();
    expect(getBanner(fixture)).not.toBeNull();
  });

  it('banner disappears when reconnecting transitions true → false', () => {
    const { fixture, setReconnecting } = mount(true);
    expect(getBanner(fixture)).not.toBeNull();
    setReconnecting(false);
    fixture.detectChanges();
    expect(getBanner(fixture)).toBeNull();
  });
});
