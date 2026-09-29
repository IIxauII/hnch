/**
 * Tests for ConnectionStatusBannerComponent — the pure label rule and
 * TestBed rendering.
 *
 * Exercises the reconnecting() signal guard, the delayed "Connecting…" state,
 * and the accessibility attributes rendered by the real component in JSDOM. The prior version read source text
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
 */

// Exercises: connection-status-banner.component:ConnectionStatusBannerComponent

import { computed, NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ syncOutline: '' }));
vi.mock('@ionic/angular/standalone', () => ({ IonIcon: {}, IonToast: {} }));

import { DocService } from '../core/doc/doc.service';
import {
  CONNECTING_BANNER_DELAY_MS,
  ConnectionStatusBannerComponent,
  computeBannerLabel,
  type BannerSyncStatus,
} from './connection-status-banner.component';

function makeMockDocService(initial = false, initialStatus: BannerSyncStatus = 'connected') {
  const reconnecting = signal(initial);
  const syncStatus = signal<BannerSyncStatus>(initialStatus);
  const lastRejection = signal<string | null>(null);
  // As in DocService: the socket is up and the relay's state has applied.
  const relaySynced = signal(initialStatus === 'connected');
  return {
    stub: {
      reconnecting: reconnecting.asReadonly(),
      syncStatus: syncStatus.asReadonly(),
      lastRejection: lastRejection.asReadonly(),
      joined: computed(() => syncStatus() === 'connected' && relaySynced()),
    },
    setReconnecting: (v: boolean) => reconnecting.set(v),
    setStatus: (v: BannerSyncStatus) => syncStatus.set(v),
    setRejection: (v: string | null) => lastRejection.set(v),
    setSynced: (v: boolean) => relaySynced.set(v),
  };
}

function mount(initial = false, initialStatus: BannerSyncStatus = 'connected') {
  const { stub, setReconnecting, setStatus, setRejection, setSynced } = makeMockDocService(
    initial,
    initialStatus,
  );
  TestBed.configureTestingModule({
    schemas: [NO_ERRORS_SCHEMA],
    providers: [{ provide: DocService, useValue: stub }],
  });
  TestBed.overrideComponent(ConnectionStatusBannerComponent, { set: { imports: [] } });
  const fixture = TestBed.createComponent(ConnectionStatusBannerComponent);
  fixture.detectChanges();
  return { fixture, setReconnecting, setStatus, setRejection, setSynced };
}

function getBanner(fixture: ReturnType<typeof mount>['fixture']): Element | null {
  return fixture.nativeElement.querySelector('[data-testid="connection-status-banner"]');
}

/** Whether the "Reconnected" toast is asked to be open. */
function toastIsOpen(fixture: ReturnType<typeof mount>['fixture']): boolean {
  const toast = fixture.nativeElement.querySelector('ion-toast') as { isOpen?: boolean } | null;
  return toast?.isOpen === true;
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.clearAllMocks();
  vi.useRealTimers();
});

// Exercises: connection-status-banner.component:computeBannerLabel
describe('computeBannerLabel', () => {
  it('says nothing while connected', () => {
    expect(computeBannerLabel(false, 'connected', false)).toBeNull();
    expect(computeBannerLabel(false, 'connected', true)).toBeNull();
  });

  it('says nothing before a session is attached', () => {
    expect(computeBannerLabel(false, 'offline', true)).toBeNull();
  });

  it('"Reconnecting…" as soon as a connection that was up drops', () => {
    expect(computeBannerLabel(true, 'disconnected', false)).toBe('Reconnecting…');
    expect(computeBannerLabel(true, 'connecting', false)).toBe('Reconnecting…');
  });

  it('"Connecting…" only once a first connection is taking a while', () => {
    expect(computeBannerLabel(false, 'connecting', false)).toBeNull();
    expect(computeBannerLabel(false, 'connecting', true)).toBe('Connecting…');
  });

  it('the pause between two attempts is the same wait', () => {
    expect(computeBannerLabel(false, 'disconnected', false)).toBeNull();
    expect(computeBannerLabel(false, 'disconnected', true)).toBe('Connecting…');
  });

  // The relay client stops trying after a refusal; the status stays at
  // `disconnected`. There is no wait to report, and nothing that would end it.
  it('says nothing once the relay has refused the connection for good', () => {
    expect(computeBannerLabel(false, 'disconnected', true, true)).toBeNull();
    expect(computeBannerLabel(false, 'connecting', true, true)).toBeNull();
  });

  it('waits one second before mentioning a first connection', () => {
    expect(CONNECTING_BANNER_DELAY_MS).toBe(1_000);
  });
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

describe('ConnectionStatusBannerComponent — first connection', () => {
  it('stays quiet for a connection that comes up quickly', () => {
    vi.useFakeTimers();
    const { fixture, setStatus } = mount(false, 'connecting');

    vi.advanceTimersByTime(CONNECTING_BANNER_DELAY_MS - 1);
    setStatus('connected');
    fixture.detectChanges();
    vi.advanceTimersByTime(CONNECTING_BANNER_DELAY_MS);
    fixture.detectChanges();

    expect(getBanner(fixture)).toBeNull();
  });

  it('says "Connecting…" once it is taking a while, and stops when it is up', () => {
    vi.useFakeTimers();
    const { fixture, setStatus } = mount(false, 'connecting');
    expect(getBanner(fixture)).toBeNull();

    vi.advanceTimersByTime(CONNECTING_BANNER_DELAY_MS);
    fixture.detectChanges();
    expect(getBanner(fixture)?.textContent?.trim()).toBe('Connecting…');

    setStatus('connected');
    fixture.detectChanges();
    expect(getBanner(fixture)).toBeNull();
  });

  it('marks the host element only while there is something to show', () => {
    const { fixture, setReconnecting } = mount(false);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains('visible')).toBe(false);

    setReconnecting(true);
    fixture.detectChanges();
    expect(host.classList.contains('visible')).toBe(true);
    expect(getBanner(fixture)?.textContent?.trim()).toBe('Reconnecting…');
  });
});

describe('ConnectionStatusBannerComponent — a connection that keeps failing', () => {
  it('does not restart the clock on every retry', () => {
    vi.useFakeTimers();
    const { fixture, setStatus } = mount(false, 'connecting');

    // connecting → disconnected → connecting, each leg shorter than the delay
    vi.advanceTimersByTime(CONNECTING_BANNER_DELAY_MS - 400);
    setStatus('disconnected');
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    setStatus('connecting');
    fixture.detectChanges();
    expect(getBanner(fixture)).toBeNull();

    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(getBanner(fixture)?.textContent?.trim()).toBe('Connecting…');

    // ...and it stays up through the next pause
    setStatus('disconnected');
    fixture.detectChanges();
    expect(getBanner(fixture)?.textContent?.trim()).toBe('Connecting…');
  });

  it('says nothing once the session is gone', () => {
    vi.useFakeTimers();
    const { fixture, setStatus } = mount(false, 'connecting');
    vi.advanceTimersByTime(CONNECTING_BANNER_DELAY_MS);
    fixture.detectChanges();
    expect(getBanner(fixture)).not.toBeNull();

    setStatus('offline');
    fixture.detectChanges();
    expect(getBanner(fixture)).toBeNull();
  });
});

describe('ConnectionStatusBannerComponent — a connection the relay refused', () => {
  // The host changed the password and this socket came back with the old
  // one: refused, and not retried. "Connecting…" would never come down.
  it('takes the banner down, and keeps it down', () => {
    vi.useFakeTimers();
    const { fixture, setStatus, setRejection } = mount(false, 'connecting');
    vi.advanceTimersByTime(CONNECTING_BANNER_DELAY_MS);
    fixture.detectChanges();
    expect(getBanner(fixture)?.textContent?.trim()).toBe('Connecting…');

    setRejection('wrong-password');
    setStatus('disconnected');
    fixture.detectChanges();
    expect(getBanner(fixture)).toBeNull();

    vi.advanceTimersByTime(CONNECTING_BANNER_DELAY_MS * 5);
    fixture.detectChanges();
    expect(getBanner(fixture)).toBeNull();
  });

  it('never puts it up for a refusal that arrives within the first second', () => {
    vi.useFakeTimers();
    const { fixture, setStatus, setRejection } = mount(false, 'connecting');
    vi.advanceTimersByTime(CONNECTING_BANNER_DELAY_MS - 200);

    setRejection('room-full');
    setStatus('disconnected');
    vi.advanceTimersByTime(CONNECTING_BANNER_DELAY_MS * 2);
    fixture.detectChanges();

    expect(getBanner(fixture)).toBeNull();
  });
});

describe('ConnectionStatusBannerComponent — "Reconnected"', () => {
  it('says so once the session has been got back into, for a moment', () => {
    vi.useFakeTimers();
    const { fixture, setReconnecting, setStatus, setSynced } = mount(true, 'disconnected');
    expect(toastIsOpen(fixture)).toBe(false);

    setStatus('connected');
    setReconnecting(false);
    setSynced(true);
    fixture.detectChanges();
    expect(toastIsOpen(fixture)).toBe(true);

    vi.advanceTimersByTime(1500);
    fixture.detectChanges();
    expect(toastIsOpen(fixture)).toBe(false);
  });

  it('waits for the relay to bring the socket in sync', () => {
    const { fixture, setReconnecting, setStatus, setSynced } = mount(true, 'disconnected');

    setStatus('connected');
    setReconnecting(false);
    fixture.detectChanges();
    expect(toastIsOpen(fixture)).toBe(false);

    setSynced(true);
    fixture.detectChanges();
    expect(toastIsOpen(fixture)).toBe(true);
  });

  // The relay takes the socket, and then turns the password away that came
  // with it: up for a moment, and never in sync.
  it('says nothing about a socket the relay takes and then refuses', () => {
    const { fixture, setReconnecting, setStatus, setRejection, setSynced } = mount(
      true,
      'disconnected',
    );

    setStatus('connected');
    setReconnecting(false);
    fixture.detectChanges();
    setRejection('wrong-password');
    setStatus('disconnected');
    fixture.detectChanges();
    expect(toastIsOpen(fixture)).toBe(false);

    // Nor later, about something that was not waited for
    setRejection(null);
    setStatus('connected');
    setSynced(true);
    fixture.detectChanges();
    expect(toastIsOpen(fixture)).toBe(false);
  });

  // The wait is over in both of these, but not because the connection is
  // back: nothing has been reconnected.
  it('says nothing when the wait ended in a refusal', () => {
    const { fixture, setReconnecting, setRejection } = mount(true, 'disconnected');

    setRejection('wrong-password');
    setReconnecting(false);
    fixture.detectChanges();

    expect(toastIsOpen(fixture)).toBe(false);
  });

  it('says nothing when the session was left while it was reconnecting', () => {
    const { fixture, setReconnecting, setStatus } = mount(true, 'connecting');

    setStatus('offline');
    setReconnecting(false);
    fixture.detectChanges();

    expect(toastIsOpen(fixture)).toBe(false);
  });

  it('says nothing about a first connection', () => {
    const { fixture, setStatus, setSynced } = mount(false, 'connecting');

    setStatus('connected');
    setSynced(true);
    fixture.detectChanges();

    expect(toastIsOpen(fixture)).toBe(false);
  });

  it('says it again the next time', () => {
    vi.useFakeTimers();
    const { fixture, setReconnecting, setStatus, setSynced } = mount(true, 'disconnected');
    const comeBack = (): void => {
      setStatus('connected');
      setReconnecting(false);
      setSynced(true);
      fixture.detectChanges();
    };
    comeBack();
    vi.advanceTimersByTime(1500);
    fixture.detectChanges();
    expect(toastIsOpen(fixture)).toBe(false);

    setSynced(false);
    setStatus('disconnected');
    setReconnecting(true);
    fixture.detectChanges();
    comeBack();

    expect(toastIsOpen(fixture)).toBe(true);
  });
});
