/**
 * PROTOTYPE (#643). Join preview (`/join?code=`, §6.3): onboarding folded in.
 * Shown only when the name is unknown or a password is needed; a known name
 * with no password goes straight into the Room. A wrong password stays here
 * with the field kept and selected (never flashes the Room). The "resume"
 * knob shows the host reloading a password room and landing back as host,
 * because the hash was cached when the password was set (UX-007).
 *
 * Entry knobs: joinCode, name, wrongPassword, resume ('host').
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
  chevronBackOutline,
  eyeOutline,
  lockClosedOutline,
} from 'ionicons/icons';

import { ProtoStore } from '../proto-store';
import { ProtoBrowserChrome } from './browser-chrome.service';
import { ENTRY_STYLES, enterRoom, formatCode, KIWI_PASSWORD, knob, roomFor } from './entry-kit';

@Component({
  selector: 'proto-join',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    @let r = room();
    <main class="entry" aria-labelledby="join-h">
      <header class="brand-row">
        <p class="brand"><span class="mark" aria-hidden="true"></span>hnch</p>
        @if (!resuming()) {
          <button type="button" class="hn-btn quiet" (click)="store.screen.set('home')">
            <ion-icon name="chevron-back-outline" aria-hidden="true" />Home
          </button>
        }
      </header>

      @if (resuming()) {
        <section class="resume" data-ux="UX-007" aria-live="polite">
          <h1 id="join-h">Reloading {{ r.name }}…</h1>
          <p class="sub"><span class="spinner" aria-hidden="true"></span>Back in as host. No password prompt.</p>
          <p class="explain">
            <ion-icon name="lock-closed-outline" aria-hidden="true" />
            <span>
              Password room. The password key was saved on this device when you set it, so a reload goes straight back in.
              Before: the host's own reload landed on Join and asked for a password, which locked the host out.
            </span>
          </p>
        </section>
      } @else {
        <div class="head" data-ux="UX-027">
          <h1 id="join-h">Join {{ r.password ? fmt(r.code) : r.name }}</h1>
          <p class="sub">
            @if (r.password) {
              <ion-icon name="lock-closed-outline" aria-hidden="true" />Password required
            } @else {
              <span class="tnum">{{ fmt(r.code) }}</span> · <span class="st-agreed">● {{ r.here }} people here</span> · {{ r.host }} hosting
            }
          </p>
        </div>

        <form class="stack" data-ux="UX-027 UX-065" (submit)="$event.preventDefault(); join()" novalidate>
          <div class="field">
            <label for="j-name">Your name</label>
            <input
              #nameInput
              id="j-name"
              type="text"
              autocomplete="nickname"
              enterkeyhint="go"
              maxlength="32"
              [value]="nameDraft()"
              [attr.aria-invalid]="nameError() ? 'true' : null"
              (input)="nameDraft.set($any($event.target).value); nameError.set('')"
            />
            @if (nameError()) {
              <p class="err" role="alert"><ion-icon name="alert-circle-outline" aria-hidden="true" />{{ nameError() }}</p>
            }
          </div>
          @if (r.password) {
            <div class="field" data-ux="UX-030">
              <label for="j-pw">Password</label>
              <input
                #pwInput
                id="j-pw"
                type="password"
                autocomplete="current-password"
                enterkeyhint="go"
                [value]="pw()"
                [attr.aria-invalid]="pwError() ? 'true' : null"
                [attr.aria-describedby]="pwError() ? 'j-pw-err' : 'j-pw-hint'"
                (input)="pw.set($any($event.target).value); pwError.set('')"
              />
              @if (pwError()) {
                <p class="err" id="j-pw-err" role="alert"><ion-icon name="alert-circle-outline" aria-hidden="true" />{{ pwError() }}</p>
              } @else {
                <p class="hint" id="j-pw-hint">Prototype: the password is "{{ kiwi }}".</p>
              }
            </div>
          }
          <label class="switch-row">
            <input type="checkbox" role="switch" [checked]="watching()" (change)="watching.set($any($event.target).checked)" />
            <ion-icon name="eye-outline" aria-hidden="true" />Just watching
          </label>
          <button type="submit" class="hn-btn primary block" [disabled]="busy()" [attr.aria-busy]="busy()">
            @if (busy()) {
              <span class="spinner" aria-hidden="true"></span>Checking…
            } @else {
              Join <kbd class="hn-kbd">⏎</kbd>
            }
          </button>
        </form>
      }
    </main>
  `,
  styles: [
    ENTRY_STYLES,
    `
      .head h1,
      .resume h1 {
        margin: 0;
        font: var(--hn-type-headline);
      }
      .sub {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--hn-space-1);
        margin: var(--hn-space-1) 0 0;
        font: var(--hn-type-small);
        color: var(--hn-text-2);
      }
      .stack {
        display: flex;
        flex-direction: column;
        gap: var(--hn-space-3);
      }
      .resume {
        display: flex;
        flex-direction: column;
        gap: var(--hn-space-3);
      }
      .explain {
        display: flex;
        gap: var(--hn-space-2);
        margin: 0;
        padding: var(--hn-space-3);
        border-radius: var(--hn-radius-md);
        background: var(--hn-accent-soft);
        color: var(--hn-accent-text);
        font: var(--hn-type-small);
      }
    `,
  ],
})
export class ProtoJoinComponent {
  protected readonly store = inject(ProtoStore);
  private readonly chrome = inject(ProtoBrowserChrome);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly pwInput = viewChild<ElementRef<HTMLInputElement>>('pwInput');

  protected readonly fmt = formatCode;
  protected readonly kiwi = KIWI_PASSWORD;
  protected readonly room = computed(() => roomFor(knob(this.store, 'joinCode') || 'K7P9MR'));
  protected readonly resuming = computed(() => knob(this.store, 'resume') === 'host');
  protected readonly nameDraft = signal('');
  protected readonly nameError = signal('');
  protected readonly pw = signal('');
  protected readonly pwError = signal('');
  protected readonly watching = signal(false);
  protected readonly busy = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    addIcons({ alertCircleOutline, chevronBackOutline, eyeOutline, lockClosedOutline });
    effect(() => {
      const e = this.store.entry();
      untracked(() => {
        clearTimeout(this.timer);
        this.busy.set(false);
        this.nameDraft.set(String(e['name'] ?? ''));
        this.nameError.set('');
        this.watching.set(false);
        const wrong = e['wrongPassword'] === true;
        this.pw.set(wrong ? 'kiwii' : '');
        this.pwError.set(wrong ? "That password didn't work." : '');
      });
    });
    // host reload of a password room: back in as host, no prompt
    effect((onCleanup) => {
      if (!this.resuming()) return;
      const t = setTimeout(() => untracked(() => this.finishResume()), 1800);
      onCleanup(() => clearTimeout(t));
    });
    afterNextRender(() => {
      if (this.store.pointer() !== 'fine') return;
      const pw = this.pwInput()?.nativeElement;
      if (pw && (this.nameDraft() || this.pwError())) {
        pw.focus();
        pw.select();
      } else this.nameInput()?.nativeElement.focus();
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    void this.chrome;
  }

  protected join() {
    if (this.busy()) return;
    const name = this.nameDraft().trim();
    if (!name) {
      this.nameError.set('Add your name to join');
      this.nameInput()?.nativeElement.focus();
      return;
    }
    const r = this.room();
    if (r.password && !this.pw()) {
      this.pwError.set('Type the room password');
      this.pwInput()?.nativeElement.focus();
      return;
    }
    // the outcome is awaited here: nothing navigates until the relay says yes
    this.busy.set(true);
    this.timer = setTimeout(
      () => {
        this.busy.set(false);
        if (r.password && this.pw() !== KIWI_PASSWORD) {
          this.pwError.set("That password didn't work.");
          const el = this.pwInput()?.nativeElement;
          el?.focus();
          el?.select();
          return;
        }
        enterRoom(this.store, {
          code: r.code,
          fixture: 'voting-partial',
          role: 'joiner',
          name,
          watching: this.watching(),
        });
      },
      r.password ? 700 : 300,
    );
  }

  private finishResume() {
    const r = this.room();
    this.store.setEntry({ resume: false });
    enterRoom(this.store, {
      code: r.code,
      fixture: 'waiting',
      role: 'host',
      notice: `Back in ${r.name} as host · saved password key, no prompt`,
    });
  }
}
