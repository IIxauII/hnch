/**
 * Unit tests for JumpBackInBannerComponent — imports the real component
 * and the real screenCopy helper. Tests fail if either source breaks.
 *
 * Pattern: Ionic component stubs + TestBed, matching round-history.component.test.ts.
 */

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core');

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {}

  const { Input } = await import('@angular/core');
  @Comp({ selector: 'ion-item', template: '<ng-content/>', standalone: true })
  class IonItem {
    @Input() disabled = false;
    @Input() button: string | undefined;
    @Input() detail: string | undefined;
  }

  @Comp({ selector: 'ion-label', template: '<ng-content/>', standalone: true })
  class IonLabel {}

  return { IonIcon, IonItem, IonLabel };
});

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));
vi.mock('ionicons/icons', () => ({ returnUpBackOutline: '' }));

import { screenCopy } from './jump-back-in-banner.helpers';
import type { JumpBackInSummary } from './jump-back-in-banner.component';

const SUMMARY: JumpBackInSummary = { roomCode: 'ABC123', lastScreen: 'lobby' };

async function mount(overrides: { resuming?: boolean; stale?: boolean } = {}) {
  const { JumpBackInBannerComponent } = await import('./jump-back-in-banner.component');
  const fixture = TestBed.createComponent(JumpBackInBannerComponent);
  fixture.componentRef.setInput('summary', SUMMARY);
  fixture.componentRef.setInput('resuming', overrides.resuming ?? false);
  fixture.componentRef.setInput('stale', overrides.stale ?? false);
  fixture.detectChanges();
  return fixture;
}

describe('JumpBackInBannerComponent — screenCopy', () => {
  it('lobby → "In the lobby"', () => {
    expect(screenCopy('lobby')).toBe('In the lobby');
  });

  it('estimating → "Estimating now"', () => {
    expect(screenCopy('estimating')).toBe('Estimating now');
  });
});

describe('JumpBackInBannerComponent — onTap guard', () => {
  it('does not emit when resuming and not stale (prevents double-tap)', async () => {
    const fixture = await mount({ resuming: true, stale: false });
    const emit = vi.fn();
    fixture.componentInstance.resumeRequested.subscribe(emit);
    (fixture.componentInstance as unknown as { onTap: () => void }).onTap();
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits when resuming=true but stale=true (tap clears stale banner)', async () => {
    const fixture = await mount({ resuming: true, stale: true });
    const emit = vi.fn();
    fixture.componentInstance.resumeRequested.subscribe(emit);
    (fixture.componentInstance as unknown as { onTap: () => void }).onTap();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('emits when not resuming (normal tap)', async () => {
    const fixture = await mount({ resuming: false, stale: false });
    const emit = vi.fn();
    fixture.componentInstance.resumeRequested.subscribe(emit);
    (fixture.componentInstance as unknown as { onTap: () => void }).onTap();
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
