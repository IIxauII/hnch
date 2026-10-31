/**
 * PROTOTYPE (#643). Home (§6.3, §6.1 "Ended"): brand mark, inline name on first
 * run, `Start a room` with an inline password option (nothing to dismiss, so
 * nothing orphans a room), one code-or-link input that auto-submits at 6,
 * one Recent list (single-button rows), the stepped-out "Return" row and the
 * session summary card. The avatar opens Profile directly (no one-item ⋯).
 *
 * Entry knobs (store.entry()): name, recent (0–4), relay ('down'),
 * createPassword (inline password open), cachedHash.
 */
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  closeOutline,
  copyOutline,
  downloadOutline,
  lockClosedOutline,
  pencilOutline,
  personCircleOutline,
  refreshOutline,
} from 'ionicons/icons';

import { ProtoStore } from '../proto-store';
import { AVATAR_VARIANTS, sessionSummary } from '../room-model';
import { ProtoRoomOverlaysComponent } from '../room/room-overlays.component';
import { ProtoBrowserChrome } from './browser-chrome.service';
import {
  ENTRY_STYLES,
  enterRoom,
  FAKE_ROOMS,
  type FakeRoom,
  formatCode,
  knob,
  knobOn,
  parseInvite,
  roomFor,
} from './entry-kit';

type Pending = { what: string; run: () => void };

@Component({
  selector: 'proto-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ProtoRoomOverlaysComponent],
  template: `
    @let m = store.m();
    <main class="entry" aria-labelledby="home-h">
      <header class="brand-row">
        <h1 class="brand" id="home-h"><span class="mark" aria-hidden="true"></span>hnch</h1>
        <button
          type="button"
          class="avatar"
          data-ux="UX-084"
          aria-label="Profile"
          title="Profile"
          [style.background]="knownName() ? avatar().fill : null"
          [style.color]="knownName() ? avatar().ink : null"
          (click)="store.open('profile')"
        >
          @if (knownName()) {
            <span aria-hidden="true">{{ knownName().slice(0, 1).toUpperCase() }}</span>
          } @else {
            <ion-icon name="person-circle-outline" aria-hidden="true" />
          }
        </button>
      </header>

      @if (!knownName()) {
        <div class="intro">
          <p>Quick story pointing. No accounts.</p>
          <p class="hint">The relay never looks inside a room.</p>
        </div>
      } @else {
        <p class="hi">
          Hi {{ knownName() }}
          <button type="button" class="hn-btn quiet icon" aria-label="Edit your name in Profile" (click)="store.open('profile')">
            <ion-icon name="pencil-outline" aria-hidden="true" />
          </button>
        </p>
      }

      <!-- session ended: the summary card (ADR-0023: everyone lands on Home) -->
      @if (m.state.ended && !summaryDismissed()) {
        @let s = summary();
        <section class="summary hn-stage" data-ux="UX-040" aria-labelledby="sum-h">
          <div class="sum-head">
            <h2 id="sum-h">Session ended · {{ s.name }}</h2>
            <button type="button" class="hn-btn quiet icon" aria-label="Dismiss summary" (click)="summaryDismissed.set(true)">
              <ion-icon name="close-outline" aria-hidden="true" />
            </button>
          </div>
          <p class="sum-meta tnum">
            {{ s.rows.length }} {{ s.rows.length === 1 ? 'story' : 'stories' }}@if (s.total !== undefined) { · {{ s.total }} pts} · {{ s.minutes }} min@if (s.hnchd) { · {{ s.hnchd }} hnch'd}
          </p>
          <table class="sum-table">
            <caption class="visually-hidden">Agreed estimates</caption>
            <thead class="visually-hidden">
              <tr><th scope="col">Story</th><th scope="col">Points</th></tr>
            </thead>
            <tbody>
              @for (r of showAllRows() ? s.rows : s.rows.slice(0, 3); track $index) {
                <tr>
                  <th scope="row"><span class="key">{{ r.key }}</span> {{ r.title }}</th>
                  <td class="tnum">{{ r.value }}</td>
                </tr>
              }
            </tbody>
          </table>
          @if (s.rows.length > 3 && !showAllRows()) {
            <button type="button" class="hn-btn quiet more" (click)="showAllRows.set(true)">+{{ s.rows.length - 3 }} more</button>
          }
          <div class="sum-actions">
            <button type="button" class="hn-btn secondary" (click)="copySummary()">
              <ion-icon name="copy-outline" aria-hidden="true" />Copy summary
            </button>
            <button type="button" class="hn-btn quiet" (click)="downloadCsv()">
              <ion-icon name="download-outline" aria-hidden="true" />CSV
            </button>
            @if (m.isHost && s.leftovers > 0) {
              <button type="button" class="hn-btn quiet" (click)="runItBack()">
                <ion-icon name="refresh-outline" aria-hidden="true" />Run it back
              </button>
            }
          </div>
          @if (m.isHost && s.leftovers > 0) {
            <p class="hint">Run it back: same name and scale, {{ s.leftovers }} unestimated {{ s.leftovers === 1 ? 'story' : 'stories' }} queued. In memory only.</p>
          }
        </section>
      }

      <!-- stepped out: the session is still alive -->
      @if (steppedOut()) {
        <section class="stepped" data-ux="UX-002" aria-label="Current room">
          <p class="stepped-line">
            <span class="live-dot" aria-hidden="true"></span>
            {{ m.isHost ? "You're still hosting" : "You're still in" }} {{ m.state.name }}
          </p>
          <div class="stepped-actions">
            <button type="button" class="hn-btn primary" (click)="returnToRoom()">Return</button>
            <button type="button" class="hn-btn quiet" (click)="leaveSteppedOut()">Leave</button>
          </div>
        </section>
      }

      <!-- create -->
      <form class="stack" data-ux="UX-065" (submit)="$event.preventDefault(); start()" novalidate>
        @if (!knownName()) {
          <div class="field">
            <label for="h-name">Your name</label>
            <input
              #nameInput
              id="h-name"
              type="text"
              autocomplete="nickname"
              enterkeyhint="go"
              maxlength="32"
              [value]="nameDraft()"
              [attr.aria-invalid]="nameError() ? 'true' : null"
              [attr.aria-describedby]="nameError() ? 'h-name-err' : null"
              (input)="nameDraft.set($any($event.target).value); nameError.set('')"
            />
            @if (nameError()) {
              <p class="err" id="h-name-err"><ion-icon name="alert-circle-outline" aria-hidden="true" />{{ nameError() }}</p>
            }
          </div>
        }
        <div class="create" data-ux="UX-025">
          <label class="switch-row">
            <input type="checkbox" role="switch" [checked]="pwOn()" (change)="pwOn.set($any($event.target).checked); pwError.set('')" />
            Password
          </label>
          @if (pwOn()) {
            <div class="field">
              <label for="h-pw">Room password</label>
              <input
                id="h-pw"
                type="password"
                autocomplete="new-password"
                [value]="pwValue()"
                [attr.aria-invalid]="pwError() ? 'true' : null"
                aria-describedby="h-pw-hint"
                (input)="pwValue.set($any($event.target).value); pwError.set('')"
              />
              @if (pwError()) {
                <p class="err"><ion-icon name="alert-circle-outline" aria-hidden="true" />{{ pwError() }}</p>
              }
              <p class="hint" id="h-pw-hint">Part of Start: nothing to dismiss, no half-made room. Change it or turn it off later in Room settings.</p>
            </div>
          }
        </div>
        <button
          type="submit"
          class="hn-btn primary block"
          data-ux="UX-024"
          [disabled]="createState() === 'busy'"
          [attr.aria-busy]="createState() === 'busy'"
        >
          @if (createState() === 'busy') {
            <span class="spinner" aria-hidden="true"></span>Starting…
          } @else {
            Start a room
            @if (!knownName()) {
              <kbd class="hn-kbd">⏎</kbd>
            }
          }
        </button>
        @if (createState() === 'error') {
          <div class="create-err" role="alert" data-ux="UX-024">
            <p class="err"><ion-icon name="alert-circle-outline" aria-hidden="true" />Couldn't reach hnch. Check your connection and try again.</p>
            <button type="button" class="hn-btn secondary" (click)="start()">
              <ion-icon name="refresh-outline" aria-hidden="true" />Retry
            </button>
          </div>
        }
      </form>

      <!-- join by code or link: one native input styled as 6 segments -->
      <form class="field" data-ux="UX-026 UX-065" (submit)="$event.preventDefault(); submitCode()" novalidate>
        <label for="h-code">Code or link</label>
        <div class="code" [class.focused]="codeFocused()" [class.invalid]="!!codeError()">
          <input
            #codeInput
            id="h-code"
            class="code-input"
            type="text"
            inputmode="text"
            autocomplete="one-time-code"
            autocapitalize="characters"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="go"
            [value]="code()"
            [attr.aria-invalid]="codeError() ? 'true' : null"
            aria-describedby="h-code-hint"
            (input)="onCode($event)"
            (focus)="codeFocused.set(true)"
            (blur)="codeFocused.set(false)"
          />
          <div class="segs" aria-hidden="true">
            @for (i of segIdx; track i) {
              <span class="seg tnum" [class.active]="codeFocused() && i === activeSeg()">{{ code()[i] ?? '' }}</span>
              @if (i === 2) {
                <span class="dash">-</span>
              }
            }
          </div>
        </div>
        @if (codeError()) {
          <p class="err" role="alert"><ion-icon name="alert-circle-outline" aria-hidden="true" />{{ codeError() }}</p>
        } @else {
          <p class="hint" id="h-code-hint">Type 6 characters or paste an invite link. Joins at the 6th.</p>
        }
      </form>

      <!-- recent: one list, one button per row, no nested buttons -->
      @if (recent().length) {
        <section aria-labelledby="rec-h" data-ux="UX-028 UX-076">
          <h2 id="rec-h" class="section-h">Recent</h2>
          <ul class="recent" role="list">
            @for (r of recent(); track r.code) {
              <li class="row" [class.dead]="r.status !== 'live'">
                @if (r.status === 'live') {
                  <button
                    type="button"
                    class="row-main"
                    [attr.data-ux]="r.password ? 'UX-031' : null"
                    [attr.aria-label]="'Rejoin ' + r.name + ', ' + fmt(r.code) + ', ' + r.here + ' here' + (r.password ? ', password room' : '')"
                    (click)="rejoin(r)"
                  >
                    <span class="row-title">
                      {{ r.name }}
                      @if (r.password) {
                        <ion-icon name="lock-closed-outline" class="lock" aria-hidden="true" />
                      }
                    </span>
                    <span class="row-meta tnum">
                      {{ fmt(r.code) }} · <span class="st-agreed">● {{ r.here }} here</span> · {{ r.lastSeen }}
                    </span>
                    @if (r.password) {
                      <span class="row-meta">{{ cachedHash() ? 'Password saved on this device · 1 tap' : 'Asks for the password' }}</span>
                    }
                  </button>
                } @else {
                  <div class="row-main static">
                    <span class="row-title">{{ r.name }}</span>
                    <span class="row-meta tnum">{{ fmt(r.code) }} · {{ r.status === 'ended' ? '– Ended' : '– Expired' }} · {{ r.lastSeen }}</span>
                  </div>
                }
                <button type="button" class="hn-btn quiet icon" [attr.aria-label]="'Remove ' + r.name + ' from Recent'" (click)="remove(r)">
                  <ion-icon name="close-outline" aria-hidden="true" />
                </button>
              </li>
            }
          </ul>
        </section>
      }

      <p class="visually-hidden" aria-live="polite">{{ status() }}</p>
    </main>
    <proto-room-overlays />
  `,
  styles: [
    ENTRY_STYLES,
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100%;
      }
      .entry {
        width: 100%;
        flex: 1 0 auto;
      }
      .intro p {
        margin: 0;
        font: var(--hn-type-body);
      }
      .intro .hint {
        font: var(--hn-type-small);
        color: var(--hn-text-3);
      }
      .hi {
        display: flex;
        align-items: center;
        gap: var(--hn-space-1);
        margin: 0;
        font: var(--hn-type-title);
      }
      .avatar {
        width: var(--hn-tap);
        height: var(--hn-tap);
        border-radius: var(--hn-radius-pill);
        border: 2px solid var(--hn-surface);
        background: transparent;
        color: var(--hn-accent-text);
        font: var(--hn-type-label);
        display: grid;
        place-items: center;
        cursor: pointer;
      }
      .avatar ion-icon {
        font-size: 28px;
      }
      .hn-btn.icon {
        min-width: var(--hn-tap);
        padding: 0;
      }
      .stack {
        display: flex;
        flex-direction: column;
        gap: var(--hn-space-3);
      }
      .create {
        display: flex;
        flex-direction: column;
        gap: var(--hn-space-2);
      }
      .create-err {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--hn-space-2);
      }
      /* code input: native input over 6 painted segments */
      .code {
        position: relative;
        min-height: 52px;
      }
      .code input.code-input {
        min-height: 0;
        padding: 0;
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 1;
        color: transparent;
        caret-color: transparent;
        background: transparent;
        border: 0;
        font: var(--hn-type-body);
        z-index: 1;
        border-radius: var(--hn-radius-sm);
      }
      .code-input::selection {
        background: transparent;
      }
      .segs {
        display: flex;
        align-items: center;
        gap: var(--hn-space-1);
        height: 52px;
      }
      .seg {
        flex: 1;
        height: 100%;
        display: grid;
        place-items: center;
        border-radius: var(--hn-radius-sm);
        border: 1px solid var(--hn-line-strong);
        background: var(--hn-surface);
        font: var(--hn-type-title);
        color: var(--hn-text);
      }
      .seg.active {
        border: 2px solid var(--hn-accent-text);
      }
      .code.invalid .seg {
        border-color: var(--hn-danger);
      }
      .dash {
        color: var(--hn-text-3);
        font: var(--hn-type-title);
      }
      .section-h {
        margin: 0 0 var(--hn-space-2);
        font: var(--hn-type-label);
        color: var(--hn-text-2);
      }
      .recent {
        list-style: none;
        margin: 0;
        padding: 0;
        border-top: 1px solid var(--hn-line);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--hn-space-2);
        border-bottom: 1px solid var(--hn-line);
      }
      .row-main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-height: 56px;
        justify-content: center;
        padding: var(--hn-space-2) 0;
        border: 0;
        background: transparent;
        color: var(--hn-text);
        text-align: start;
        cursor: pointer;
        font: inherit;
      }
      .row-main.static {
        cursor: default;
      }
      .row-title {
        display: inline-flex;
        align-items: center;
        gap: var(--hn-space-1);
        font: var(--hn-type-label);
      }
      .row.dead .row-title {
        color: var(--hn-text-2);
      }
      .lock {
        font-size: 16px;
        color: var(--hn-text-3);
      }
      .row-meta {
        font: var(--hn-type-small);
        color: var(--hn-text-3);
      }
      .stepped {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--hn-space-2);
        padding: var(--hn-space-3) var(--hn-space-4);
        border-radius: var(--hn-radius-md);
        background: var(--hn-accent-soft);
        color: var(--hn-accent-text);
      }
      .stepped-line {
        display: flex;
        align-items: center;
        gap: var(--hn-space-2);
        margin: 0;
        font: var(--hn-type-label);
      }
      .live-dot {
        width: 10px;
        height: 10px;
        border-radius: var(--hn-radius-pill);
        background: var(--hn-success);
      }
      .stepped-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--hn-space-2);
      }
      .summary {
        padding: var(--hn-space-4);
        display: flex;
        flex-direction: column;
        gap: var(--hn-space-2);
      }
      .summary h2 {
        margin: 0;
        font: var(--hn-type-title);
      }
      .sum-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--hn-space-2);
      }
      .sum-meta {
        margin: 0;
        font: var(--hn-type-small);
        color: var(--hn-text-2);
      }
      .sum-table {
        width: 100%;
        border-collapse: collapse;
      }
      .sum-table th,
      .sum-table td {
        padding: var(--hn-space-2) 0;
        border-top: 1px solid var(--hn-line);
        font: var(--hn-type-body);
        text-align: start;
      }
      .sum-table th {
        font-weight: 400;
      }
      .sum-table td {
        text-align: end;
        font: var(--hn-type-label);
      }
      .key {
        color: var(--hn-text-3);
        font: var(--hn-type-small);
      }
      .more {
        align-self: flex-start;
      }
      .sum-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--hn-space-2);
      }
    `,
  ],
})
export class ProtoHomeComponent {
  protected readonly store = inject(ProtoStore);
  private readonly chrome = inject(ProtoBrowserChrome);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  protected readonly segIdx = [0, 1, 2, 3, 4, 5];
  protected readonly fmt = formatCode;

  protected readonly knownName = computed(() => knob(this.store, 'name'));
  protected readonly cachedHash = computed(() => knobOn(this.store, 'cachedHash'));
  protected readonly nameDraft = signal('');
  protected readonly nameError = signal('');
  protected readonly code = signal('');
  protected readonly codeError = signal('');
  protected readonly codeFocused = signal(false);
  protected readonly createState = signal<'idle' | 'busy' | 'error'>('idle');
  protected readonly pwOn = signal(false);
  protected readonly pwValue = signal('');
  protected readonly pwError = signal('');
  protected readonly removed = signal<string[]>([]);
  /** Continuation waiting on the overlay's "Leave Sprint 42 first?" confirm. */
  private pending: Pending | null = null;
  protected readonly status = signal('');
  protected readonly summaryDismissed = signal(false);
  protected readonly showAllRows = signal(false);
  private attempts = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  /** Entry knobs a scene sets; afterLeave and Profile's singleKeyShortcuts don't reset Home. */
  private readonly sceneKey = computed(() => {
    const { afterLeave: _a, singleKeyShortcuts: _k, ...rest } = this.store.entry();
    return JSON.stringify(rest);
  });
  protected readonly activeSeg = computed(() => Math.min(this.code().length, 5));
  protected readonly summary = computed(() => sessionSummary(this.store.m()));
  protected readonly steppedOut = computed(() => {
    const m = this.store.m();
    return !!m.self?.steppedOut && !m.self.leftAt && !m.state.ended;
  });
  protected readonly avatar = computed(() => {
    const v = AVATAR_VARIANTS['racing-green'];
    return this.store.theme() === 'dark'
      ? { fill: v.dark, ink: v.darkInk }
      : { fill: v.light, ink: v.lightInk };
  });
  protected readonly recent = computed<FakeRoom[]>(() => {
    const m = this.store.m();
    const n = Number(this.store.entry()['recent'] ?? 0);
    const current = m.state.code.replace(/-/gu, '');
    const hideCurrent = this.steppedOut() || m.state.ended;
    return FAKE_ROOMS.slice(0, n).filter(
      (r) => !this.removed().includes(r.code) && !(hideCurrent && r.code === current),
    );
  });

  constructor() {
    // every scene sets store.entry: reset local state to match it (not on afterLeave / Profile writes)
    effect(() => {
      this.sceneKey();
      const e = untracked(() => this.store.entry());
      untracked(() => {
        this.clearTimers();
        this.attempts = 0;
        this.nameDraft.set(String(e['name'] ?? ''));
        this.nameError.set('');
        this.code.set('');
        this.codeError.set('');
        this.createState.set('idle');
        this.pwOn.set(e['createPassword'] === true);
        this.pwValue.set('');
        this.pwError.set('');
        this.removed.set([]);
        this.pending = null;
        this.summaryDismissed.set(false);
        this.showAllRows.set(false);
      });
    });
    // the overlay's confirm ran m.leave(); continue the flow that asked
    effect(() => {
      const after = this.store.entry()['afterLeave'];
      if (!after) return;
      untracked(() => {
        this.store.setEntry({ afterLeave: false });
        const p = this.pending;
        this.pending = null;
        if (p && p.what === after) p.run();
      });
    });
    // autofocus only on fine pointers (touch OSes don't raise the keyboard anyway)
    afterNextRender(() => {
      if (this.store.pointer() !== 'fine') return;
      (this.nameInput() ?? this.codeInput())?.nativeElement.focus();
    });
    inject(DestroyRef).onDestroy(() => this.clearTimers());
    void this.chrome;
    addIcons({
      alertCircleOutline,
      closeOutline,
      copyOutline,
      downloadOutline,
      lockClosedOutline,
      pencilOutline,
      personCircleOutline,
      refreshOutline,
    });
  }

  // ── create ──
  protected start() {
    if (this.createState() === 'busy') return;
    const name = (this.knownName() || this.nameDraft()).trim();
    if (!name) {
      this.nameError.set('Add your name to start a room');
      this.nameInput()?.nativeElement.focus();
      return;
    }
    if (this.pwOn() && !this.pwValue()) {
      this.pwError.set('Type a password, or turn Password off');
      return;
    }
    this.guard('start', () => this.create(name));
  }

  private create(name: string) {
    this.createState.set('busy');
    this.status.set('Starting a room…');
    const down = this.store.entry()['relay'] === 'down';
    this.attempts++;
    // the scene's relay is down for the first attempt; Retry finds it back up
    const fails = down && this.attempts === 1;
    this.later(fails ? 1400 : 500, () => {
      if (fails) {
        this.createState.set('error');
        this.status.set("Couldn't reach hnch. Retry.");
        return;
      }
      const password = this.pwOn();
      enterRoom(this.store, {
        code: 'H4N7CQ',
        fixture: 'host-alone',
        role: 'host',
        name,
        roomName: `${name}'s room`,
        notice: password ? 'Room started with a password' : undefined,
      });
      this.store.model.state.password = password;
      this.store.bump();
    });
  }

  // ── join by code ──
  protected onCode(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const raw = input.value;
    const code = parseInvite(raw);
    if (code !== raw) input.value = code;
    if (raw.length > 8 && code) this.status.set(`Link pasted · code ${formatCode(code)}`);
    this.code.set(code);
    this.codeError.set('');
    if (code.length === 6) this.submitCode();
  }

  protected submitCode() {
    const code = this.code();
    if (code.length < 6) {
      this.codeError.set('A code has 6 characters, like K7P-9MR');
      return;
    }
    const room = roomFor(code);
    if (room.status !== 'live') {
      this.codeError.set('This room has ended or expired.');
      return;
    }
    const m = this.store.m();
    if (this.steppedOut() && m.state.code.replace(/-/gu, '') === code) return this.returnToRoom();
    this.guard(`join:${room.code}`, () => this.join(room, false));
  }

  private join(room: FakeRoom, fromRecent: boolean) {
    const name = (this.knownName() || this.nameDraft()).trim();
    const cached = fromRecent && room.password && this.cachedHash();
    if (!name || (room.password && !cached)) {
      // preview: name unknown, or a password is needed
      this.store.entry.set({ joinCode: room.code, name });
      this.store.screen.set('join');
      return;
    }
    enterRoom(this.store, {
      code: room.code,
      fixture: 'voting-partial',
      role: 'joiner',
      name,
      notice: cached ? `Back in ${room.name} · password saved on this device` : undefined,
    });
  }

  // ── recent ──
  protected rejoin(r: FakeRoom) {
    this.guard(`rejoin:${r.code}`, () => this.join(r, true));
  }
  protected remove(r: FakeRoom) {
    this.removed.update((x) => [...x, r.code]);
    this.status.set(`Removed ${r.name} from Recent`);
  }

  // ── stepped out ──
  protected returnToRoom() {
    this.store.m().returnToRoom();
    this.store.screen.set('room');
  }
  protected leaveSteppedOut() {
    const m = this.store.m();
    const name = m.state.name;
    m.leave();
    this.status.set(`Left ${name}`);
  }
  /** Start / join while stepped out asks "Leave Sprint 42 first?" (CP-15). */
  private guard(what: string, run: () => void) {
    if (!this.steppedOut()) return run();
    this.pending = { what, run };
    this.store.open('confirm-leave-first', what);
  }

  // ── summary ──
  protected copySummary() {
    const text = this.summary().text;
    void navigator.clipboard?.writeText(text).then(
      () => this.store.m().notify('Summary copied', 'success'),
      () => this.status.set('Copy failed'),
    );
    this.status.set('Summary copied');
  }
  protected downloadCsv() {
    const s = this.summary();
    const q = (v: string) => `"${v.replace(/"/gu, '""')}"`;
    const csv = [
      'key,title,points',
      ...s.rows.map((r) => [q(r.key), q(r.title), q(r.value)].join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.name.toLowerCase().replace(/\s+/gu, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.status.set('CSV downloaded');
  }
  /** Same name and scale, unestimated stories queued; then Start (2 taps, D11). */
  protected runItBack() {
    const m = this.store.m();
    const name = m.state.name;
    const scale = m.state.scaleId;
    const left = [...m.queue, ...m.skipped];
    // the old room's state is discarded by load(), so the stories can be reused in place
    for (const s of left) s.status = 'queued';
    this.store.load('host-alone', 'hana');
    const st = this.store.model.state;
    st.name = name;
    st.scaleId = scale;
    st.code = 'R8N-2BK';
    st.stories = left;
    this.store.model.notify(`${name} again · ${left.length} stories queued`, 'success');
    this.store.bump();
    this.store.screen.set('room');
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }
  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
