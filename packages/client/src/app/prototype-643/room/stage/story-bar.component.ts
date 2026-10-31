/**
 * PROTOTYPE (#643). hn-story-bar: meta row + H1 (§5.6).
 *   waiting   "Up next · Story 1 of 5 · PROJ-101"   H1 = next story (or room name)
 *   voting    "Story 3 of 12 · PROJ-101    0:42"    live stopwatch, tabular digits
 *             "Previous: PROJ-101 → 8"             first round after an Accept (UX-033)
 *   revealed  "Story 3 of 12 · PROJ-101 took 1:12"
 * The H1 is always a story title, never "Round N" (UX-077).
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProtoStore } from '../../proto-store';
import { mmss, ordinal, previousAccepted, StageUi, voteNumber } from './stage-ui';

@Component({
  selector: 'proto-stage-story-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = store.m();
    @let r = m.activeRound;
    @let prev = previousAccepted(m);
    <div class="meta" data-ux="UX-077">
      @if (m.phase === 'waiting') {
        @let next = m.nextStory;
        @if (next) {
          @let pos = m.storyPosition(next.id);
          <span class="lead">Up next · Story {{ pos.n }} of {{ pos.of }}{{ next.key ? ' · ' + next.key : '' }}</span>
        } @else {
          <span class="lead">{{ m.done.length ? 'Queue done' : 'No stories queued' }}</span>
        }
      } @else if (r) {
        @if (prev && m.phase === 'voting') {
          <span class="lead prev" data-ux="UX-033 UX-016">Previous: {{ prev.label }} → {{ prev.value }}</span>
        } @else {
          @let pos = m.storyPosition(r.storyId);
          @let n = voteNumber(m, r);
          <span class="lead">
            Story {{ pos.n }} of {{ pos.of }}{{ m.currentStory?.key ? ' · ' + m.currentStory?.key : '' }}{{ n > 1 ? ' · ' + ordinal(n) + ' vote' : '' }}
          </span>
        }
        @if (m.phase === 'voting') {
          <span class="clock tnum" aria-label="Time on this story">{{ elapsed(r.startedAt) }}</span>
        } @else if (r.revealedAt) {
          <span class="clock tnum">took {{ took(r.startedAt, r.revealedAt) }}</span>
        }
      }
    </div>
    <h1 id="stage-h1" class="h1" tabindex="-1" data-ux="UX-077 UX-066">{{ title() }}</h1>
  `,
  styles: `
    :host {
      display: block;
    }
    .meta {
      display: flex;
      gap: var(--hn-space-2);
      align-items: baseline;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
      min-height: 16px;
    }
    .lead {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .prev {
      color: var(--hn-accent-text);
    }
    .clock {
      flex: none;
    }
    .h1 {
      margin: var(--hn-space-1) 0 0;
      font: var(--hn-type-title);
      color: var(--hn-text);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: break-word;
    }
    .h1:focus {
      outline: none;
    }
    .h1:focus-visible {
      outline: 2px solid var(--hn-focus);
    }
    @container device (min-width: 1024px) {
      .h1 {
        font: var(--hn-type-headline);
        letter-spacing: -0.01em;
        /* reserve 2 H1 lines so the footer row never jumps between stories (R-20, D17) */
        min-height: calc(2 * 34px);
      }
    }
  `,
})
export class ProtoStageStoryBarComponent {
  protected readonly store = inject(ProtoStore);
  private readonly ui = inject(StageUi);
  protected readonly previousAccepted = previousAccepted;
  protected readonly voteNumber = voteNumber;
  protected readonly ordinal = ordinal;

  protected elapsed(startedAt: number): string {
    return mmss(this.ui.now() - startedAt);
  }
  protected took(startedAt: number, revealedAt: number): string {
    return mmss(revealedAt - startedAt);
  }

  protected title(): string {
    const m = this.store.m();
    if (m.phase === 'waiting') return m.nextStory?.title ?? m.state.name;
    return m.currentStory?.title ?? m.activeRound?.title ?? m.state.name;
  }
}
