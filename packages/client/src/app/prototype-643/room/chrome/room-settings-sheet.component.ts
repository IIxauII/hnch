/**
 * PROTOTYPE (#643). Room settings, host only, one level (plan §6.4, §3.3 #22).
 * - Non-hosts never get here from the menu; if they do, they see a read-only
 *   summary, not controls (UX-006).
 * - Scale: Fibonacci · T-shirt · More… inline; custom scales go by their name
 *   ("Team hours") for everyone, never a UUID (UX-081). Applies from the next story.
 * - Password: the switch shows the access state as the relay reports it, and
 *   "Password" can't be committed empty (UX-013). Hidden entirely when O1 = no
 *   password rooms.
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ProtoStore } from '../../proto-store';
import { SCALES } from '../../room-model';
import { ProtoSheetComponent } from './sheet.component';

const MAIN = ['fibonacci', 't-shirt'];
const MORE = ['powers-of-2', 'linear', 'risk', 'custom-team'];

@Component({
  selector: 'proto-room-settings-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProtoSheetComponent],
  template: `
    @let m = store.m();
    @let s = m.state;
    @let pw = s.decisions.passwordRooms;
    <proto-sheet heading="Room settings" titleId="ov-title">
      @if (!m.isHost) {
        <div class="ro" data-ux="UX-006" role="note">
          <p class="lead">Only {{ m.host?.name ?? 'the host' }} (host) can change these.</p>
          <dl>
            <div><dt>Name</dt><dd>{{ s.name }}</dd></div>
            <div><dt>Scale</dt><dd>{{ scaleLabel() }}</dd></div>
            @if (pw) {
              <div><dt>Access</dt><dd>{{ s.password ? 'Password on' : 'Open: anyone with the code' }}</dd></div>
            }
          </dl>
        </div>
      } @else {
        <form class="form" (submit)="$event.preventDefault()" data-ux="UX-006">
          <div class="field" data-ux="UX-080">
            <label for="rs-name">Session name</label>
            <input
              #nm
              id="rs-name"
              type="text"
              maxlength="40"
              [value]="s.name"
              (change)="rename(nm.value)"
              (keydown.enter)="rename(nm.value)"
            />
            <p class="help">Shown in the header, Recent and the summary.</p>
          </div>

          <fieldset class="field" data-ux="UX-081" [disabled]="m.phase === 'voting'">
            <legend>Scale</legend>
            <div class="seg" role="radiogroup" aria-label="Scale">
              @for (id of main; track id) {
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="s.scaleId === id"
                  (click)="m.setScale(id)"
                >
                  {{ label(id) }}
                </button>
              }
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="isMore()"
                [attr.aria-expanded]="showMore()"
                (click)="showMore.set(!showMore())"
              >
                {{ isMore() ? label(s.scaleId) : 'More…' }}
              </button>
            </div>
            @if (showMore()) {
              <div class="more" role="radiogroup" aria-label="More scales">
                @for (id of more; track id) {
                  <button
                    type="button"
                    role="radio"
                    class="opt"
                    [attr.aria-checked]="s.scaleId === id"
                    (click)="m.setScale(id)"
                  >
                    <span class="opt-name">{{ label(id) }}{{ id === 'custom-team' ? ' · custom' : '' }}</span>
                    <span class="opt-cards tnum">{{ cards(id) }}</span>
                  </button>
                }
              </div>
            }
            <p class="help tnum">
              {{ cards(s.scaleId) }} ·
              @if (m.phase === 'voting') {
                change it between stories
              } @else {
                applies from the next story; everyone sees "{{ label(s.scaleId) }}"
              }
            </p>
          </fieldset>

          @if (pw) {
            <div class="field" data-ux="UX-013">
              <div class="sw-row">
                <span id="rs-pw-l" class="sw-label">Password</span>
                <button
                  type="button"
                  role="switch"
                  class="switch"
                  aria-labelledby="rs-pw-l"
                  [attr.aria-checked]="s.password || pwOpen()"
                  (click)="togglePw()"
                >
                  <span aria-hidden="true"></span>
                </button>
              </div>
              <p class="state" role="status">
                @if (s.password) {
                  ✓ Password on · checked by the server
                } @else {
                  ○ Open · anyone with the code can join
                }
              </p>
              @if (pwOpen() && !s.password) {
                <div class="pw">
                  <label for="rs-pw" class="visually-hidden">New password</label>
                  <input
                    #pwIn
                    id="rs-pw"
                    type="password"
                    autocomplete="new-password"
                    placeholder="New password"
                    (input)="pwText.set(pwIn.value)"
                    (keydown.enter)="setPw()"
                  />
                  <button type="button" class="hn-btn secondary" [disabled]="!pwText().trim()" (click)="setPw()">
                    Set password
                  </button>
                </div>
              }
              <p class="help">Changing it later keeps out anyone you removed.</p>
            </div>
          }
        </form>
      }
    </proto-sheet>
  `,
  styles: `
    .form,
    .ro {
      display: grid;
      gap: var(--hn-space-5);
    }
    .lead {
      margin: 0;
      font: var(--hn-type-body);
    }
    dl {
      margin: 0;
      display: grid;
      gap: var(--hn-space-2);
    }
    dl div {
      display: flex;
      justify-content: space-between;
      gap: var(--hn-space-4);
      font: var(--hn-type-small);
    }
    dt {
      color: var(--hn-text-2);
    }
    dd {
      margin: 0;
    }
    .field {
      display: grid;
      gap: var(--hn-space-2);
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    label,
    legend,
    .sw-label {
      font: var(--hn-type-label);
      padding: 0;
    }
    input[type='text'],
    input[type='password'] {
      min-height: var(--hn-tap);
      padding: 0 var(--hn-space-3);
      border: 1px solid var(--hn-line-strong);
      border-radius: var(--hn-radius-md);
      background: var(--hn-surface);
      color: var(--hn-text);
      font: var(--hn-type-body);
      min-width: 0;
    }
    .help,
    .state {
      margin: 0;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .state {
      font: var(--hn-type-small);
      color: var(--hn-text-2);
    }
    .seg {
      display: flex;
      border: 1px solid var(--hn-line-strong);
      border-radius: var(--hn-radius-md);
      overflow: hidden;
    }
    .seg button {
      flex: 1;
      min-height: var(--hn-tap);
      border: 0;
      background: transparent;
      color: var(--hn-text);
      font: var(--hn-type-label);
      cursor: pointer;
    }
    .seg button + button {
      border-left: 1px solid var(--hn-line-strong);
    }
    .seg button[aria-checked='true'] {
      background: var(--hn-accent-soft);
      color: var(--hn-accent-text);
    }
    fieldset:disabled button {
      cursor: default;
      opacity: 0.6;
    }
    .more {
      display: grid;
    }
    .opt {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--hn-space-3);
      min-height: var(--hn-tap);
      padding: 0 var(--hn-space-2);
      border: 0;
      border-radius: var(--hn-radius-sm);
      background: transparent;
      color: var(--hn-text);
      font: var(--hn-type-body);
      text-align: left;
      cursor: pointer;
    }
    .opt[aria-checked='true'] {
      background: var(--hn-accent-soft);
      color: var(--hn-accent-text);
    }
    .opt-cards {
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
      white-space: nowrap;
    }
    .sw-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .switch {
      position: relative;
      width: 52px;
      height: 32px;
      border-radius: var(--hn-radius-pill);
      border: 1px solid var(--hn-line-strong);
      background: var(--hn-surface-2);
      cursor: pointer;
    }
    .switch span {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 24px;
      height: 24px;
      border-radius: var(--hn-radius-pill);
      background: var(--hn-text-2);
      transition: transform var(--hn-dur-state) var(--hn-ease-std);
    }
    .switch[aria-checked='true'] {
      background: var(--hn-accent);
      border-color: var(--hn-accent);
    }
    .switch[aria-checked='true'] span {
      transform: translateX(20px);
      background: var(--hn-on-accent);
    }
    .pw {
      display: flex;
      gap: var(--hn-space-2);
    }
    .pw input {
      flex: 1;
    }
  `,
})
export class ProtoRoomSettingsSheetComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly main = MAIN;
  protected readonly more = MORE;
  protected readonly showMore = signal(MORE.includes(this.store.model.state.scaleId));
  protected readonly pwOpen = signal(false);
  protected readonly pwText = signal('');

  protected readonly isMore = computed(() => MORE.includes(this.store.m().state.scaleId));
  protected readonly scaleLabel = computed(() => this.label(this.store.m().state.scaleId));

  protected label(id: string): string {
    return SCALES[id]?.label ?? id;
  }
  protected cards(id: string): string {
    return (SCALES[id]?.cards ?? []).join(' · ');
  }
  protected rename(v: string) {
    const name = v.trim();
    if (name && name !== this.store.model.state.name) this.store.model.rename(name);
  }
  protected togglePw() {
    const m = this.store.model;
    if (m.state.password) {
      m.setPassword(false);
      this.pwOpen.set(false);
    } else {
      this.pwOpen.update((v) => !v);
    }
  }
  protected setPw() {
    if (!this.pwText().trim()) return;
    this.store.model.setPassword(true);
    this.pwOpen.set(false);
    this.pwText.set('');
  }
}
