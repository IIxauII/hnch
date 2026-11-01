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
  // Bug 1.1 regression
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

  it('nobody to wait for: 0 voters → "No voters yet", not "0 of 0 voted"', () => {
    const fixture = mount([], new Set());
    expect(fixture.nativeElement.textContent).toContain('No voters yet');
    expect(fixture.nativeElement.textContent).not.toContain('0 of 0');
    const row = fixture.nativeElement.querySelector('[role="group"]');
    expect(row?.getAttribute('aria-label')).toBe('No voters yet');
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

  // Identity rendering (#196)
  it('renders uppercase first-character initial inside each dot', () => {
    const ps = [makeParticipant('v1', 'alice'), makeParticipant('v2', 'Bob')];
    const fixture = mount(ps, new Set(['v1']));
    const initials = Array.from(fixture.nativeElement.querySelectorAll('.dot .dot-initial')).map(
      (el) => (el as HTMLElement).textContent?.trim(),
    );
    expect(initials).toEqual(['A', 'B']);
  });

  // As on the avatar: an empty dot reads as a glitch.
  it('empty/whitespace displayName: the initial is a question mark', () => {
    const fixture = mount([makeParticipant('v1', '   '), makeParticipant('v2', '')], new Set());
    const initials = Array.from(fixture.nativeElement.querySelectorAll('.dot .dot-initial')).map(
      (el) => (el as HTMLElement).textContent,
    );
    expect(initials).toEqual(['?', '?']);
  });

  it('voted class applied to dot span so e2e .dot.voted selector still resolves', () => {
    const fixture = mount([makeParticipant('v1'), makeParticipant('v2')], new Set(['v1']));
    const votedDots = fixture.nativeElement.querySelectorAll('.dot.voted');
    expect(votedDots.length).toBe(1);
    const allDots = fixture.nativeElement.querySelectorAll('.dot');
    expect(allDots.length).toBe(2);
  });

  // Pending-line (#196 v3)
  // The "Waiting for …" line surfaces names of unvoted participants once at
  // least 50 % of voters have voted (the decision-time signal for hosts).
  function pendingLineText(fixture: { nativeElement: HTMLElement }): string | null {
    return fixture.nativeElement.querySelector('.pending-line')?.textContent?.trim() ?? null;
  }

  it('pending-line hidden below 50% voted', () => {
    // 1 of 3 voters voted (33%) — line should not render.
    const ps = [
      makeParticipant('v1', 'Alice'),
      makeParticipant('v2', 'Bob'),
      makeParticipant('v3', 'Carol'),
    ];
    const fixture = mount(ps, new Set(['v1']));
    expect(pendingLineText(fixture)).toBeNull();
  });

  it('pending-line shown at >=50% voted with full display names (no JS truncation)', () => {
    // 2 of 4 (50%) voted — line lists pending names in full;
    // overflow handling is delegated to CSS (the line wraps).
    const ps = [
      makeParticipant('v1', 'Alice'),
      makeParticipant('v2', 'Bob'),
      makeParticipant('v3', 'ChristopherLong'),
      makeParticipant('v4', 'Dana'),
    ];
    const fixture = mount(ps, new Set(['v1', 'v2']));
    expect(pendingLineText(fixture)).toBe('Waiting for ChristopherLong, Dana');
  });

  it('pending-line preserves names longer than 10 chars intact (#229)', () => {
    const ps = [makeParticipant('v1', 'Alice'), makeParticipant('v2', 'AlexandrinaXYZ')];
    const fixture = mount(ps, new Set(['v1']));
    expect(pendingLineText(fixture)).toBe('Waiting for AlexandrinaXYZ');
  });

  it('pending-line hidden when all participants voted', () => {
    const ps = [makeParticipant('v1', 'Alice'), makeParticipant('v2', 'Bob')];
    const fixture = mount(ps, new Set(['v1', 'v2']));
    expect(pendingLineText(fixture)).toBeNull();
  });

  it('pending-line hidden for empty room', () => {
    const fixture = mount([], new Set());
    expect(pendingLineText(fixture)).toBeNull();
  });

  it('pending-line hidden for 1 participant with 0 voted (0%)', () => {
    const fixture = mount([makeParticipant('v1', 'Alice')], new Set());
    expect(pendingLineText(fixture)).toBeNull();
  });
});
