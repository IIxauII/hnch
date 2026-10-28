// Exercises: shared/avatar.component:AvatarComponent

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { resolveAvatarColor, resolveAvatarInkColor } from '@hnch/shared';

import { AvatarComponent } from './avatar.component';

function mount(inputs: {
  participantId: string;
  name: string;
  color?: string;
  size?: number;
  dimmed?: boolean;
}) {
  const fixture = TestBed.createComponent(AvatarComponent);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AvatarComponent', () => {
  it('shows the uppercased first letter of the name', () => {
    expect(mount({ participantId: 'p1', name: 'priya' }).textContent).toBe('P');
  });

  it('ignores leading whitespace in the name', () => {
    expect(mount({ participantId: 'p1', name: '  sam' }).textContent).toBe('S');
  });

  it('keeps an emoji whole rather than showing half of it', () => {
    expect(mount({ participantId: 'p1', name: '😀 Sam' }).textContent).toBe('😀');
  });

  it('falls back to "?" for an empty name', () => {
    expect(mount({ participantId: 'p1', name: '   ' }).textContent).toBe('?');
  });

  it('paints the participant color with its matching ink', () => {
    const el = mount({ participantId: 'p1', name: 'Alex', color: 'amber' });
    // jsdom normalizes hex to rgb(); compare through a scratch element.
    const probe = document.createElement('span');
    probe.style.background = resolveAvatarColor('amber', 'p1');
    probe.style.color = resolveAvatarInkColor('amber', 'p1');
    expect(el.style.background).toBe(probe.style.background);
    expect(el.style.color).toBe(probe.style.color);
  });

  // The edge ring is mixed from the fill in the stylesheet.
  it('hands its fill to the stylesheet', () => {
    const el = mount({ participantId: 'p1', name: 'Ada', color: 'amber' });
    expect(el.style.getPropertyValue('--avatar-fill')).toBe(resolveAvatarColor('amber', 'p1'));
  });

  it('derives a stable color from the id when none is set', () => {
    const a = mount({ participantId: 'device-1', name: 'Alex' });
    const b = mount({ participantId: 'device-1', name: 'Someone else' });
    expect(a.style.background).toBe(b.style.background);
    expect(a.style.background).not.toBe('');
  });

  it('sizes itself and scales the initial with it', () => {
    const el = mount({ participantId: 'p1', name: 'Alex', size: 40 });
    expect(el.style.width).toBe('40px');
    expect(el.style.height).toBe('40px');
    expect(el.style.fontSize).toBe('18px');
  });

  it('fades when dimmed', () => {
    expect(mount({ participantId: 'p1', name: 'Alex', dimmed: true }).classList).toContain(
      'dimmed',
    );
    expect(mount({ participantId: 'p1', name: 'Alex' }).classList).not.toContain('dimmed');
  });

  it('is hidden from assistive tech — the name is rendered beside it', () => {
    expect(mount({ participantId: 'p1', name: 'Alex' }).getAttribute('aria-hidden')).toBe('true');
  });
});
