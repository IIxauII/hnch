import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import type { ParticipantSnapshot } from '@hnch/shared';
import { AvatarVoteRowComponent } from './avatar-vote-row.component';

function makeParticipant(id: string, displayName?: string): ParticipantSnapshot {
  return { id, displayName: displayName ?? id, joinedAt: 0, role: 'voter' };
}

function mount(participants: readonly ParticipantSnapshot[], votedIds: ReadonlySet<string>) {
  const fixture = TestBed.createComponent(AvatarVoteRowComponent);
  fixture.componentRef.setInput('participants', participants);
  fixture.componentRef.setInput('votedIds', votedIds);
  fixture.detectChanges();
  return fixture;
}

describe('AvatarVoteRowComponent', () => {
  // ── Bug 1.1 regression ───────────────────────────────────────────────────
  // Before the fix, EstimatingPage passed ALL online participants (voters +
  // viewers) as the denominator. Auto-reveal fired at "1 of 2 voters" but
  // the display said "1 of 3" (total). The fix: page pre-filters to
  // voter-only before passing in. This test pins that the component renders
  // votedIds.size / participants.length as-is — no internal filtering.
  it('regression bug 1.1: 2 voters all voted → "2 of 2 voted"', () => {
    const p1 = makeParticipant('v1');
    const p2 = makeParticipant('v2');
    const fixture = mount([p1, p2], new Set(['v1', 'v2']));
    expect(fixture.nativeElement.textContent).toContain('2 of 2 voted');
  });

  it('partial vote: 3 voters, 1 voted → "1 of 3 voted"', () => {
    const ps = [makeParticipant('v1'), makeParticipant('v2'), makeParticipant('v3')];
    const fixture = mount(ps, new Set(['v1']));
    expect(fixture.nativeElement.textContent).toContain('1 of 3 voted');
  });

  it('empty room: 0 participants, 0 voted → "0 of 0 voted"', () => {
    const fixture = mount([], new Set());
    expect(fixture.nativeElement.textContent).toContain('0 of 0 voted');
  });

  // The component is intentionally dumb — it renders votedIds.size against
  // participants.length with no cross-filtering. The page (EstimatingPage)
  // is responsible for ensuring votedIds only contains ids present in
  // participants. If a stale/ghost id leaks in, the display will say
  // "2 of 1 voted". This test pins that contract so a future "defensive
  // filter" inside the component is caught as a breaking change.
  it('ghost id in votedIds: component does NOT defensively filter → "2 of 1 voted"', () => {
    const fixture = mount([makeParticipant('v1')], new Set(['v1', 'ghost']));
    expect(fixture.nativeElement.textContent).toContain('2 of 1 voted');
  });

  it('aria-label: 1 voter, 0 voted → aria-label="0 of 1 voted"', () => {
    const fixture = mount([makeParticipant('v1')], new Set());
    const row = fixture.nativeElement.querySelector('[role="group"]');
    expect(row?.getAttribute('aria-label')).toBe('0 of 1 voted');
  });

  // ── Identity rendering (#196) ─────────────────────────────────────────────
  it('renders uppercase first-character initial inside each dot', () => {
    const ps = [makeParticipant('v1', 'alice'), makeParticipant('v2', 'Bob')];
    const fixture = mount(ps, new Set(['v1']));
    const initials = Array.from(fixture.nativeElement.querySelectorAll('.dot .dot-initial')).map(
      (el) => (el as HTMLElement).textContent?.trim(),
    );
    expect(initials).toEqual(['A', 'B']);
  });

  it('renders displayName slice ≤10 chars in dot-label', () => {
    const fixture = mount([makeParticipant('v1', 'Christopher Long')], new Set());
    const label = fixture.nativeElement.querySelector('.dot-label');
    expect(label?.textContent?.trim()).toBe('Christophe');
  });

  it('empty/whitespace displayName: initial renders empty string, label empty', () => {
    const fixture = mount([makeParticipant('v1', '   '), makeParticipant('v2', '')], new Set());
    const initials = Array.from(fixture.nativeElement.querySelectorAll('.dot .dot-initial')).map(
      (el) => (el as HTMLElement).textContent,
    );
    expect(initials).toEqual(['', '']);
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.dot-label')).map(
      (el) => (el as HTMLElement).textContent,
    );
    expect(labels).toEqual(['   ', '']);
  });

  it('voted class applied to dot span (not cell) so e2e .dot.voted selector still resolves', () => {
    const fixture = mount([makeParticipant('v1'), makeParticipant('v2')], new Set(['v1']));
    const votedDots = fixture.nativeElement.querySelectorAll('.dot.voted');
    expect(votedDots.length).toBe(1);
    const allDots = fixture.nativeElement.querySelectorAll('.dot');
    expect(allDots.length).toBe(2);
  });
});
