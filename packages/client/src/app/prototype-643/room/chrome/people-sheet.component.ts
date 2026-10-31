/**
 * PROTOTYPE (#643). People sheet (plan §6.1 overlays): dot · name · badges
 * (`you`, `host`) · state (glyph + word) · ⋮. Single-line names with ellipsis
 * (UX-045), theme-aware dots with a collision ring (UX-057), a "host" text
 * badge instead of a crown (UX-062). "Just watching" lives on your own row,
 * not in the toolbar (UX-069). A visible ⋮ replaces swipe-only actions.
 * The overlay argument (if any) is the person whose ⋮ starts open.
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { ProtoStore } from '../../proto-store';
import { colourCollisions, ProtoDotComponent } from './dot.component';
import { orderedPeople, peopleSummary, personRow } from './people';
import { ProtoSheetComponent } from './sheet.component';

@Component({
  selector: 'proto-people-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ProtoDotComponent, ProtoSheetComponent],
  template: `
    @let m = store.m();
    <proto-sheet [heading]="'People · ' + m.present.length" titleId="ov-title">
      <button sheet-actions type="button" class="hn-btn quiet" (click)="store.open('invite')">
        <ion-icon name="person-add-outline" aria-hidden="true" />Invite
      </button>
      <p class="sum">{{ summary() }}</p>
      <ul class="list" data-ux="UX-045 UX-057 UX-062">
        @for (r of rows(); track r.p.id) {
          <li>
            <div class="row">
              <proto-dot [person]="r.p" [state]="r.dot" [collision]="collide().has(r.p.id)" />
              <span class="name">{{ r.p.name }}</span>
              @if (r.you) {
                <span class="badge">you</span>
              }
              @if (r.host) {
                <span class="badge host" data-ux="UX-062">host</span>
              }
              <span class="fill"></span>
              <span class="state">{{ r.state }}</span>
              @if (canAct(r.p.id)) {
                <button
                  type="button"
                  class="more"
                  [attr.aria-label]="'Actions for ' + (r.you ? 'you' : r.p.name)"
                  [attr.aria-expanded]="openRow() === r.p.id"
                  [attr.aria-controls]="'pa-' + r.p.id"
                  (click)="toggle(r.p.id)"
                >
                  <ion-icon name="ellipsis-vertical" aria-hidden="true" />
                </button>
              }
            </div>
            @if (openRow() === r.p.id) {
              <div class="acts" [id]="'pa-' + r.p.id">
                @if (r.you) {
                  @if (editing()) {
                    <label class="edit">
                      <span class="visually-hidden">Your name</span>
                      <input
                        #nameIn
                        type="text"
                        [value]="r.p.name"
                        maxlength="24"
                        (keydown.enter)="saveName(nameIn.value)"
                        (keydown.escape)="$event.stopPropagation(); editing.set(false)"
                      />
                    </label>
                    <button type="button" class="hn-btn secondary" (click)="saveName(nameIn.value)">
                      Save
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="hn-btn quiet"
                      data-ux="UX-069"
                      [attr.aria-pressed]="r.p.role === 'viewer'"
                      (click)="m.setRole(r.p.role === 'viewer' ? 'voter' : 'viewer')"
                    >
                      <ion-icon name="eye-outline" aria-hidden="true" />{{
                        r.p.role === 'viewer' ? 'Vote instead' : 'Just watching'
                      }}
                    </button>
                    <button type="button" class="hn-btn quiet" (click)="editing.set(true)">
                      <ion-icon name="create-outline" aria-hidden="true" />Edit name
                    </button>
                  }
                } @else {
                  <button type="button" class="hn-btn quiet" (click)="makeHost(r.p.id)">
                    Make host
                  </button>
                  <button
                    type="button"
                    class="hn-btn danger-quiet"
                    (click)="store.open('confirm-remove', r.p.id)"
                  >
                    Remove…
                  </button>
                }
              </div>
            }
          </li>
        }
      </ul>
    </proto-sheet>
  `,
  styles: `
    .sum {
      margin: 0;
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li + li {
      border-top: 1px solid var(--hn-line);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      min-height: 56px;
    }
    .name {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font: var(--hn-type-label);
    }
    .fill {
      flex: 1;
    }
    .badge {
      flex: none;
      padding: 0 var(--hn-space-2);
      border-radius: var(--hn-radius-pill);
      border: 1px solid var(--hn-line-strong);
      color: var(--hn-text-2);
      font: var(--hn-type-caption);
    }
    .state {
      flex: none;
      font: var(--hn-type-small);
      color: var(--hn-text-2);
      white-space: nowrap;
    }
    .more {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: var(--hn-tap);
      height: var(--hn-tap);
      border: 0;
      border-radius: var(--hn-radius-md);
      background: transparent;
      color: var(--hn-text);
      font-size: 20px;
      cursor: pointer;
    }
    .acts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--hn-space-2);
      padding: 0 0 var(--hn-space-3) 40px;
    }
    .edit input {
      min-height: var(--hn-tap);
      padding: 0 var(--hn-space-3);
      border: 1px solid var(--hn-line-strong);
      border-radius: var(--hn-radius-md);
      background: var(--hn-surface);
      color: var(--hn-text);
      font: var(--hn-type-body);
    }
  `,
})
export class ProtoPeopleSheetComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly openRow = signal<string | null>(this.store.overlayArg());
  protected readonly editing = signal(false);

  protected readonly rows = computed(() => {
    const m = this.store.m();
    return orderedPeople(m).map((p) => personRow(m, p));
  });
  protected readonly collide = computed(() => colourCollisions(this.store.m().present));
  protected readonly summary = computed(() => peopleSummary(this.store.m()));

  protected canAct(id: string): boolean {
    const m = this.store.m();
    return id === m.state.selfId || m.isHost;
  }
  protected toggle(id: string) {
    this.editing.set(false);
    this.openRow.update((v) => (v === id ? null : id));
  }
  protected makeHost(id: string) {
    this.openRow.set(null);
    this.store.model.makeHost(id);
  }
  protected saveName(v: string) {
    const name = v.trim();
    if (name) this.store.model.renameSelf(name);
    this.editing.set(false);
  }
}
