/**
 * Unit tests for RecentRoomsListComponent and formatRelativeTime helper.
 */

import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Ionic stubs
// ---------------------------------------------------------------------------

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');

  @Comp({ selector: 'ion-list', template: '<ng-content/>', standalone: true })
  class IonList {
    @Input() inset: boolean | undefined;
  }

  @Comp({ selector: 'ion-item-sliding', template: '<ng-content/>', standalone: true })
  class IonItemSliding {}

  @Comp({ selector: 'ion-item', template: '<ng-content/>', standalone: true })
  class IonItem {
    @Input() button: string | undefined;
    @Input() detail: string | undefined;
  }

  @Comp({ selector: 'ion-item-options', template: '<ng-content/>', standalone: true })
  class IonItemOptions {
    @Input() side: string | undefined;
  }

  @Comp({ selector: 'ion-item-option', template: '<ng-content/>', standalone: true })
  class IonItemOption {
    @Input() color: string | undefined;
  }

  @Comp({ selector: 'ion-label', template: '<ng-content/>', standalone: true })
  class IonLabel {}

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {
    @Input() name: string | undefined;
  }

  return { IonList, IonItemSliding, IonItem, IonItemOptions, IonItemOption, IonLabel, IonIcon };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ returnUpBackOutline: '', trashOutline: '' }));
vi.mock('@hnch/shared', async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return { ...real, formatRoomCode: (code: string) => code };
});

// ---------------------------------------------------------------------------
// Surface mock — desktop by default for most tests
// ---------------------------------------------------------------------------

vi.mock('../core/surface.service', async () => {
  const { Injectable, signal } = await import('@angular/core');
  @Injectable({ providedIn: 'root' })
  class SurfaceService {
    readonly mode = signal<'mobile' | 'desktop'>('desktop');
  }
  return { SurfaceService };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { TestBed } from '@angular/core/testing';

import { formatRelativeTime } from './recent-rooms-list.component';
import type { ClientLastSessionEntry } from '../core/last-session.service';

// ---------------------------------------------------------------------------
// formatRelativeTime helper
// ---------------------------------------------------------------------------

describe('formatRelativeTime', () => {
  const now = 1_000_000_000; // arbitrary epoch

  it('returns "just now" for sub-minute diff', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('just now');
  });

  it('returns a relative time string for 5-minute diff (contains "5")', () => {
    const result = formatRelativeTime(now - 5 * 60 * 1000, now);
    expect(result).toMatch(/5/);
    expect(result).not.toBe('just now');
  });

  it('returns a relative time string for 2-hour diff (contains "2")', () => {
    const result = formatRelativeTime(now - 2 * 60 * 60 * 1000, now);
    expect(result).toMatch(/2/);
    expect(result).not.toBe('just now');
  });

  it('uses auto-format for day diff (yesterday)', () => {
    const result = formatRelativeTime(now - 24 * 60 * 60 * 1000, now);
    expect(result).toBe('yesterday');
  });

  it('uses day count for 3 days', () => {
    const result = formatRelativeTime(now - 3 * 24 * 60 * 60 * 1000, now);
    expect(result).toMatch(/3 day/);
  });
});

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<ClientLastSessionEntry> = {}): ClientLastSessionEntry {
  return {
    roomCode: 'ABC123',
    roomUuid: 'u1',
    lastSeenAt: Date.now() - 60_000,
    lastScreen: 'lobby',
    ...overrides,
  };
}

async function mountComponent(entries: ClientLastSessionEntry[]) {
  const { RecentRoomsListComponent } = await import('./recent-rooms-list.component');
  const fixture = TestBed.createComponent(RecentRoomsListComponent);
  fixture.componentRef.setInput('entries', entries);
  fixture.detectChanges();
  return fixture;
}

describe('RecentRoomsListComponent', () => {
  it('renders one row per entry', async () => {
    const fixture = await mountComponent([
      makeEntry({ roomUuid: 'u1', roomCode: 'AAA111' }),
      makeEntry({ roomUuid: 'u2', roomCode: 'BBB222' }),
    ]);
    const items = fixture.nativeElement.querySelectorAll('ion-item');
    expect(items.length).toBe(2);
  });

  it('emits joinRequested with entry when row clicked', async () => {
    const entry = makeEntry({ roomUuid: 'u1' });
    const fixture = await mountComponent([entry]);

    const emitted: ClientLastSessionEntry[] = [];
    fixture.componentInstance.joinRequested.subscribe((e: ClientLastSessionEntry) =>
      emitted.push(e),
    );

    const item = fixture.nativeElement.querySelector('ion-item');
    item.click();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.roomUuid).toBe('u1');
  });

  it('emits removeRequested with roomUuid from desktop × button', async () => {
    const entry = makeEntry({ roomUuid: 'u1' });
    const fixture = await mountComponent([entry]);

    const removed: string[] = [];
    fixture.componentInstance.removeRequested.subscribe((id: string) => removed.push(id));

    const btn = fixture.nativeElement.querySelector('.remove-btn');
    expect(btn).toBeTruthy();
    btn.click();
    expect(removed).toHaveLength(1);
    expect(removed[0]).toBe('u1');
  });

  it('emits removeRequested from ion-item-option on mobile', async () => {
    // Switch surface to mobile
    const { SurfaceService } = await import('../core/surface.service');
    const svc = TestBed.inject(SurfaceService) as SurfaceService & {
      mode: ReturnType<typeof import('@angular/core').signal<'mobile' | 'desktop'>>;
    };
    svc.mode.set('mobile');

    const entry = makeEntry({ roomUuid: 'u2' });
    const fixture = await mountComponent([entry]);
    fixture.detectChanges();

    const removed: string[] = [];
    fixture.componentInstance.removeRequested.subscribe((id: string) => removed.push(id));

    const option = fixture.nativeElement.querySelector('ion-item-option');
    expect(option).toBeTruthy();
    option.click();
    expect(removed).toHaveLength(1);
    expect(removed[0]).toBe('u2');
  });

  it('shows no rows for empty entries', async () => {
    const fixture = await mountComponent([]);
    const items = fixture.nativeElement.querySelectorAll('ion-item');
    expect(items.length).toBe(0);
  });
});
