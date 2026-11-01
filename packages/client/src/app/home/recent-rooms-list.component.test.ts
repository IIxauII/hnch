/**
 * Unit tests for RecentRoomsListComponent and formatRelativeTime helper.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');

  @Comp({ selector: 'ion-list', template: '<ng-content/>', standalone: true })
  class IonList {
    @Input() inset: boolean | string | undefined;
    @Input() lines: string | undefined;
  }

  @Comp({ selector: 'ion-item', template: '<ng-content/>', standalone: true })
  class IonItem {
    @Input() button: string | undefined;
    @Input() detail: boolean | undefined;
    @Input() disabled: boolean | undefined;
  }

  @Comp({ selector: 'ion-button', template: '<ng-content/>', standalone: true })
  class IonButton {
    @Input() fill: string | undefined;
  }

  @Comp({ selector: 'ion-label', template: '<ng-content/>', standalone: true })
  class IonLabel {}

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {
    @Input() name: string | undefined;
  }

  return { IonList, IonItem, IonButton, IonLabel, IonIcon };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ closeOutline: '', returnUpBackOutline: '' }));

// Imports (after mocks)

import { TestBed } from '@angular/core/testing';

import { formatRelativeTime } from './recent-rooms-list.component';
import type { ClientLastSessionEntry } from '../core/last-session.service';

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

function makeEntry(overrides: Partial<ClientLastSessionEntry> = {}): ClientLastSessionEntry {
  return {
    roomCode: 'ABC123',
    roomUuid: 'u1',
    lastSeenAt: Date.now() - 60_000,
    lastScreen: 'lobby',
    ...overrides,
  };
}

async function mountComponent(entries: ClientLastSessionEntry[], busy = false) {
  const { RecentRoomsListComponent } = await import('./recent-rooms-list.component');
  const fixture = TestBed.createComponent(RecentRoomsListComponent);
  fixture.componentRef.setInput('entries', entries);
  fixture.componentRef.setInput('busy', busy);
  fixture.detectChanges();
  return fixture;
}

describe('RecentRoomsListComponent', () => {
  it('renders one row per entry', async () => {
    const fixture = await mountComponent([
      makeEntry({ roomUuid: 'u1', roomCode: 'AAA111' }),
      makeEntry({ roomUuid: 'u2', roomCode: 'BBB222' }),
    ]);
    const items = fixture.nativeElement.querySelectorAll('ion-item.recent-room-row');
    expect(items.length).toBe(2);
  });

  it('renders a single entry as a one-row list', async () => {
    const fixture = await mountComponent([makeEntry()]);
    expect(fixture.nativeElement.querySelectorAll('ion-item.recent-room-row').length).toBe(1);
  });

  it('shows the dash-formatted code, in the label and in the accessible name', async () => {
    const fixture = await mountComponent([makeEntry({ roomCode: 'K7P9MR' })]);
    const item = fixture.nativeElement.querySelector('ion-item.recent-room-row');
    expect(item.querySelector('h3').textContent).toBe('K7P-9MR');
    expect(item.getAttribute('aria-label')).toBe('Rejoin session K7P-9MR');
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

  it('swallows row taps while a rejoin is in flight', async () => {
    const fixture = await mountComponent([makeEntry()], true);

    const emitted: ClientLastSessionEntry[] = [];
    fixture.componentInstance.joinRequested.subscribe((e: ClientLastSessionEntry) =>
      emitted.push(e),
    );

    fixture.nativeElement.querySelector('ion-item').click();
    expect(emitted).toHaveLength(0);
  });

  it('emits removeRequested with roomUuid from the × button', async () => {
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

  it('keeps the × a sibling of the row, not a control nested inside it', async () => {
    const fixture = await mountComponent([makeEntry()]);
    const row = fixture.nativeElement.querySelector('ion-item.recent-room-row');
    expect(row.querySelector('.remove-btn')).toBeNull();
  });

  it('removing does not also rejoin', async () => {
    const fixture = await mountComponent([makeEntry()]);

    const joined: ClientLastSessionEntry[] = [];
    fixture.componentInstance.joinRequested.subscribe((e: ClientLastSessionEntry) =>
      joined.push(e),
    );

    fixture.nativeElement.querySelector('.remove-btn').click();
    expect(joined).toHaveLength(0);
  });

  it('shows no rows for empty entries', async () => {
    const fixture = await mountComponent([]);
    const items = fixture.nativeElement.querySelectorAll('ion-item');
    expect(items.length).toBe(0);
  });
});
