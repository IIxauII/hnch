/**
 * PROTOTYPE (#643). The overlay layer: every sheet, dialog, menu, confirm and
 * the toast, rendered INSIDE the device frame (no Ionic overlays), one at a
 * time (store.overlay(), R-22).
 *   phone  (<600)   bottom sheets with a drag handle (tap cycles 60 % ↔ 95 %)
 *   tablet (600–1023) side sheets on the right; the menu drops from ⋯
 *   desktop (≥1024) centred dialogs sized to content, max min(80 %, 720 px),
 *                   never clipped (UX-044); the menu drops from ⋯
 * Esc / backdrop close; focus moves into the panel, is trapped there, and goes
 * back to where it came from.
 *
 * Placement: the host is a 0-height sticky strip at the bottom of the scrolling
 * device; the layer hangs above it at the device's height, so it always covers
 * the visible viewport. Put <proto-room-overlays /> last in a min-height:100% column.
 * Safe off the Room: on Home only Profile, "Leave first?" and the toast render.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  untracked,
  viewChild,
} from '@angular/core';

import { FRAME_SIZE, type Overlay, ProtoStore } from '../proto-store';
import { sessionSummary } from '../room-model';
import { ProtoAddStoriesSheetComponent } from './chrome/add-stories-sheet.component';
import { ProtoConfirmComponent } from './chrome/confirm.component';
import { copyText, registerChromeIcons } from './chrome/icons';
import { ProtoInviteSheetComponent } from './chrome/invite-sheet.component';
import { ProtoKeysSheetComponent } from './chrome/keys-sheet.component';
import { ProtoMenuSheetComponent } from './chrome/menu-sheet.component';
import { ProtoPeopleSheetComponent } from './chrome/people-sheet.component';
import { ProtoProfileSheetComponent } from './chrome/profile-sheet.component';
import { ProtoRoomSettingsSheetComponent } from './chrome/room-settings-sheet.component';
import { ProtoStoriesSheetComponent } from './chrome/stories-sheet.component';
import { SheetState } from './chrome/sheet-state';
import { ProtoToastComponent } from './chrome/toast.component';

const OFF_ROOM = new Set<Overlay>(['profile', 'confirm-leave-first']);
const CONFIRMS = new Set<Overlay>([
  'confirm-end',
  'confirm-remove',
  'confirm-leave-host',
  'confirm-leave-first',
]);

@Component({
  selector: 'proto-room-overlays',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SheetState],
  imports: [
    ProtoAddStoriesSheetComponent,
    ProtoConfirmComponent,
    ProtoInviteSheetComponent,
    ProtoKeysSheetComponent,
    ProtoMenuSheetComponent,
    ProtoPeopleSheetComponent,
    ProtoProfileSheetComponent,
    ProtoRoomSettingsSheetComponent,
    ProtoStoriesSheetComponent,
    ProtoToastComponent,
  ],
  template: `
    @let m = store.m();
    <div class="layer" [style.height.px]="frameH()" [class.in-room]="inRoom()">
      @if (endedHere()) {
        <section class="ended" aria-labelledby="ended-h" data-ux="UX-080">
          <div class="ended-card hn-stage">
            <h2 id="ended-h">Session ended · {{ m.state.name }}</h2>
            <p class="ended-meta tnum">
              {{ summary().rows.length }} stories{{ summary().total !== undefined ? ' · ' + summary().total + ' pts' : '' }}
              · {{ summary().minutes }} min
            </p>
            <ul>
              @for (r of summary().rows; track $index) {
                <li>
                  <span class="k tnum">{{ r.key }}</span><span class="t">{{ r.title }}</span
                  ><span class="v tnum">{{ r.value }}</span>
                </li>
              }
            </ul>
            <div class="ended-btns">
              <button type="button" class="hn-btn secondary" (click)="copySummary()">Copy summary</button>
              <button type="button" class="hn-btn primary" (click)="store.screen.set('home')">Done</button>
            </div>
          </div>
        </section>
      }

      @if (current(); as o) {
        <div class="backdrop" aria-hidden="true" (click)="store.close()"></div>
        <div
          #panel
          class="panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ov-title"
          tabindex="-1"
          [attr.aria-describedby]="isConfirm() ? 'ov-desc' : null"
          [class.menu]="o === 'menu'"
          [class.confirm]="isConfirm()"
          [class.expanded]="expanded()"
          [attr.data-kind]="o"
          data-ux="UX-044"
          (keydown)="onKey($event)"
        >
          @switch (o) {
            @case ('invite') {
              <proto-invite-sheet />
            }
            @case ('people') {
              <proto-people-sheet />
            }
            @case ('stories') {
              <proto-stories-sheet />
            }
            @case ('add-stories') {
              <proto-add-stories-sheet />
            }
            @case ('menu') {
              <proto-menu-sheet />
            }
            @case ('room-settings') {
              <proto-room-settings-sheet />
            }
            @case ('profile') {
              <proto-profile-sheet />
            }
            @case ('keys') {
              <proto-keys-sheet />
            }
            @default {
              <proto-confirm />
            }
          }
        </div>
      }

      <proto-toast class="toast" />
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: sticky;
      bottom: 0;
      height: 0;
      z-index: 40;
      flex: none;
      margin-top: auto; /* pin to the bottom of a flex column even when content is short */
    }
    .layer {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .layer > * {
      pointer-events: auto;
    }
    .backdrop {
      position: absolute;
      inset: 0;
      background: rgb(0 0 0 / 0.32);
      animation: fade var(--hn-dur-state) var(--hn-ease-std);
    }
    .panel {
      position: absolute;
      display: flex;
      flex-direction: column;
      background: var(--hn-surface);
      color: var(--hn-text);
      box-shadow: var(--hn-e2);
      border: 1px solid var(--hn-e1-border);
      outline: none;
    }
    .panel > * {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }
    /* phone: bottom sheet */
    .panel {
      left: 0;
      right: 0;
      bottom: 0;
      max-height: 60%;
      border-radius: var(--hn-radius-lg) var(--hn-radius-lg) 0 0;
      animation: up var(--hn-dur-enter) var(--hn-ease-out);
    }
    .panel.expanded {
      max-height: 95%;
    }
    .panel.menu,
    .panel.confirm {
      max-height: 95%;
    }
    /* tablet: side sheet */
    @container device (min-width: 600px) {
      .panel {
        left: auto;
        top: 0;
        right: 0;
        bottom: 0;
        width: 400px;
        max-height: none;
        border-radius: var(--hn-radius-lg) 0 0 var(--hn-radius-lg);
        animation: in-right var(--hn-dur-enter) var(--hn-ease-out);
      }
      .panel.confirm {
        top: 50%;
        left: 50%;
        right: auto;
        bottom: auto;
        width: var(--hn-dialog-w);
        max-width: calc(100% - 2 * var(--hn-space-5));
        transform: translate(-50%, -50%);
        border-radius: var(--hn-radius-lg);
        animation: fade var(--hn-dur-state) var(--hn-ease-std);
      }
      .panel.menu {
        top: calc(var(--hn-header-h) - var(--hn-space-1));
        right: var(--hn-space-2);
        bottom: auto;
        width: 280px;
        max-height: calc(100% - var(--hn-header-h) - var(--hn-space-4));
        border-radius: var(--hn-radius-md);
        animation: fade var(--hn-dur-state) var(--hn-ease-std);
      }
    }
    /* desktop: centred dialog sized to content (UX-044) */
    @container device (min-width: 1024px) {
      .panel:not(.menu) {
        top: 50%;
        left: 50%;
        right: auto;
        bottom: auto;
        width: var(--hn-dialog-w);
        max-width: calc(100% - 2 * var(--hn-space-6));
        height: auto;
        max-height: min(80%, 720px);
        transform: translate(-50%, -50%);
        border-radius: var(--hn-radius-lg);
        animation: fade var(--hn-dur-state) var(--hn-ease-std);
      }
      .panel.menu {
        right: var(--hn-space-6);
      }
    }
    .toast {
      position: absolute;
      left: var(--hn-space-4);
      right: var(--hn-space-4);
      bottom: var(--hn-space-4);
      z-index: 2;
      pointer-events: none;
    }
    .layer.in-room .toast {
      bottom: calc(var(--hn-action-h) + var(--hn-space-5));
    }
    @container device (min-width: 1024px) {
      .layer.in-room .toast {
        bottom: var(--hn-space-5);
      }
    }
    .ended {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: var(--hn-space-4);
      background: var(--hn-bg);
    }
    .ended-card {
      width: min(100%, var(--hn-dialog-w));
      padding: var(--hn-space-5);
      display: grid;
      gap: var(--hn-space-3);
    }
    .ended-card h2 {
      margin: 0;
      font: var(--hn-type-title);
    }
    .ended-meta {
      margin: 0;
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    .ended-card ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .ended-card li {
      display: flex;
      gap: var(--hn-space-2);
      min-height: 32px;
      align-items: center;
      font: var(--hn-type-small);
    }
    .ended-card .k {
      flex: none;
      width: 76px;
      color: var(--hn-text-3);
    }
    .ended-card .t {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ended-card .v {
      font: var(--hn-type-label);
    }
    .ended-btns {
      display: flex;
      justify-content: flex-end;
      gap: var(--hn-space-2);
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @keyframes up {
      from {
        transform: translateY(24px);
        opacity: 0;
      }
    }
    @keyframes in-right {
      from {
        transform: translateX(24px);
        opacity: 0;
      }
    }
  `,
})
export class ProtoRoomOverlaysComponent {
  protected readonly store = inject(ProtoStore);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private returnTo: HTMLElement | null = null;
  private readonly sheet = inject(SheetState);
  protected readonly expanded = this.sheet.expanded;

  protected readonly frameH = computed(() => FRAME_SIZE[this.store.frame()].h);
  protected readonly inRoom = computed(() => this.store.screen() === 'room');
  /** The overlay to render here, or null (off the Room only Profile and Leave-first). */
  protected readonly current = computed<Overlay>(() => {
    const o = this.store.overlay();
    if (!o) return null;
    if (!this.inRoom() && !OFF_ROOM.has(o)) return null;
    return o;
  });
  protected readonly isConfirm = computed(() => CONFIRMS.has(this.current()));
  /** O18 'in-place' (or a peer in an ended room): the ended state renders here. */
  protected readonly endedHere = computed(() => this.inRoom() && this.store.m().state.ended);
  protected readonly summary = computed(() => sessionSummary(this.store.m()));

  constructor() {
    registerChromeIcons();
    // focus in on open, back out on close
    let prev: Overlay = null;
    effect(() => {
      const o = this.current();
      untracked(() => {
        if (o && !prev) {
          const a = document.activeElement;
          this.returnTo = a instanceof HTMLElement ? a : null;
        }
        if (o && o !== prev) {
          this.expanded.set(o === 'people' || o === 'stories');
          setTimeout(() => this.focusIn(), 0);
        }
        if (!o && prev) {
          const r = this.returnTo;
          this.returnTo = null;
          if (r?.isConnected) r.focus();
        }
        prev = o;
      });
    });
  }

  private focusIn() {
    const p = this.panel()?.nativeElement;
    if (!p || p.contains(document.activeElement)) return;
    const auto = p.querySelector<HTMLElement>('[data-autofocus]');
    (auto ?? p).focus();
  }

  protected onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.store.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const p = this.panel()?.nativeElement;
    if (!p) return;
    const items = [
      ...p.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea, select, a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.offsetParent !== null);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === p)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  protected copySummary() {
    copyText(this.summary().text);
    this.store.model.notify('Summary copied', 'success');
    this.store.bump();
  }
}
