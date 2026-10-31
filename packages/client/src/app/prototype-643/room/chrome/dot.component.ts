/**
 * PROTOTYPE (#643). hn-dot and hn-avatar-stack (plan §5.6, UX-057).
 * - Fill = the render-time variant for the current theme (AVATAR_VARIANTS), so
 *   graphite and racing green stay visible in dark mode; ink chosen per variant.
 * - 1.5 px surface ring separates overlapping dots.
 * - State is never colour-only: voted adds a check badge, away is dashed + faded.
 * - Collision ring: when two people in the room share a hue, the later one gets a
 *   dashed outer ring so the dots stay tellable apart.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ProtoStore } from '../../proto-store';
import { AVATAR_VARIANTS, type Person } from '../../room-model';

export type DotState = 'voted' | 'waiting' | 'away' | 'watching' | null;

/** Ids of people whose colour an earlier present person already uses. */
export function colourCollisions(people: Person[]): Set<string> {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const p of people) {
    if (seen.has(p.color)) out.add(p.id);
    seen.add(p.color);
  }
  return out;
}

@Component({
  selector: 'proto-dot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="dot"
      aria-hidden="true"
      [class.sm]="size() === 'sm'"
      [class.lg]="size() === 'lg'"
      [class.away]="state() === 'away'"
      [class.watching]="state() === 'watching'"
      [class.collide]="collision()"
      [style.background]="fill().bg"
      [style.color]="fill().ink"
      data-ux="UX-057"
      >{{ initial() }}
      @if (state() === 'voted') {
        <span class="badge">✓</span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    .dot {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: var(--hn-radius-pill);
      font: 700 13px/1 var(--hn-font);
      box-shadow: 0 0 0 1.5px var(--hn-surface);
    }
    .dot.sm {
      width: 28px;
      height: 28px;
      font: 700 12px/1 var(--hn-font);
    }
    .dot.lg {
      width: 40px;
      height: 40px;
      font: 700 16px/1 var(--hn-font);
    }
    .dot.collide {
      outline: 1.5px dashed var(--hn-text-2);
      outline-offset: 2px;
    }
    .dot.away {
      opacity: 0.55;
      outline: 1.5px dashed var(--hn-line-strong);
      outline-offset: 2px;
    }
    .dot.watching {
      opacity: 0.75;
    }
    .badge {
      position: absolute;
      right: -4px;
      bottom: -4px;
      display: grid;
      place-items: center;
      width: 16px;
      height: 16px;
      border-radius: var(--hn-radius-pill);
      background: var(--hn-success);
      color: var(--hn-surface);
      font: 700 10px/1 var(--hn-font);
      box-shadow: 0 0 0 1.5px var(--hn-surface);
    }
  `,
})
export class ProtoDotComponent {
  private readonly store = inject(ProtoStore);
  readonly person = input.required<Person>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly state = input<DotState>(null);
  readonly collision = input(false);

  protected readonly initial = computed(() => this.person().name.slice(0, 1).toUpperCase());
  protected readonly fill = computed(() => {
    const v = AVATAR_VARIANTS[this.person().color];
    return this.store.theme() === 'dark'
      ? { bg: v.dark, ink: v.darkInk }
      : { bg: v.light, ink: v.lightInk };
  });
}
