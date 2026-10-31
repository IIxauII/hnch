/**
 * PROTOTYPE (#643). Profile sheet: replaces the App Settings page and is
 * reachable from inside a session (⋯ → Profile, desktop header) and from the
 * Home avatar (UX-079). Trimmed to: name, avatar colour (12 + Custom… behind a
 * button, O7), theme, reduced motion, single-key shortcuts (WCAG 2.1.4, fine
 * pointer only), about. Cut: accent colour, default session name, password by
 * default, relay URL, keyboard rows.
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ProtoStore } from '../../proto-store';
import { AVATAR_VARIANTS, type AvatarKey } from '../../room-model';
import { ProtoSheetComponent } from './sheet.component';

type ThemeChoice = 'system' | 'light' | 'dark';

const COLOUR_NAMES: Record<AvatarKey, string> = {
  'racing-green': 'Racing green',
  dijon: 'Dijon',
  blue: 'Blue',
  indigo: 'Indigo',
  violet: 'Violet',
  pink: 'Pink',
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  green: 'Green',
  teal: 'Teal',
  graphite: 'Graphite',
};

@Component({
  selector: 'proto-profile-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProtoSheetComponent],
  template: `
    @let me = store.m().self;
    <proto-sheet heading="Profile" titleId="ov-title">
      <form class="form" (submit)="$event.preventDefault()" data-ux="UX-079">
        <div class="field">
          <label for="pf-name">Name</label>
          <input
            #nm
            id="pf-name"
            type="text"
            maxlength="24"
            autocomplete="nickname"
            [value]="me?.name ?? ''"
            (change)="rename(nm.value)"
            (keydown.enter)="rename(nm.value)"
          />
          <p class="help">Applies everywhere, mid-session too.</p>
        </div>

        <fieldset class="field" data-ux="UX-057">
          <legend>Colour</legend>
          <div class="swatches" role="radiogroup" aria-label="Avatar colour">
            @for (k of colours; track k) {
              <button
                type="button"
                role="radio"
                class="sw"
                [attr.aria-checked]="me?.color === k"
                [attr.aria-label]="names[k]"
                [style.background]="fill(k)"
                (click)="setColour(k)"
              ></button>
            }
          </div>
          @if (!custom()) {
            <button type="button" class="hn-btn quiet start" (click)="custom.set(true)">Custom…</button>
          } @else {
            <div class="custom">
              <label for="pf-hex">Custom colour</label>
              <input id="pf-hex" type="color" />
              <p class="help">Shown with a variant that keeps 3:1 against the page in both themes.</p>
            </div>
          }
        </fieldset>

        <fieldset class="field">
          <legend>Theme</legend>
          <div class="seg" role="radiogroup" aria-label="Theme">
            @for (t of themes; track t.id) {
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="themeChoice() === t.id"
                (click)="setTheme(t.id)"
              >
                {{ t.label }}
              </button>
            }
          </div>
        </fieldset>

        <div class="sw-row">
          <span id="pf-rm" class="lbl">Reduce motion</span>
          <button
            type="button"
            role="switch"
            class="switch"
            aria-labelledby="pf-rm"
            [attr.aria-checked]="store.reducedMotion()"
            (click)="store.reducedMotion.set(!store.reducedMotion())"
          >
            <span aria-hidden="true"></span>
          </button>
        </div>

        @if (store.pointer() === 'fine') {
          <div class="sw-row">
            <span class="lbl-wrap">
              <span id="pf-keys" class="lbl">Single-key shortcuts</span>
              <span id="pf-keys-d" class="help">Off: shortcuts need a modifier, so speech input can't trigger them.</span>
            </span>
            <button
              type="button"
              role="switch"
              class="switch"
              aria-labelledby="pf-keys"
              aria-describedby="pf-keys-d"
              [attr.aria-checked]="singleKeys()"
              (click)="store.setEntry({ singleKeyShortcuts: !singleKeys() })"
            >
              <span aria-hidden="true"></span>
            </button>
          </div>
        }

        <footer class="about">
          hnch 1.47.0 · no accounts, no tracking ·
          <a href="https://github.com/IIxauII/hnch" target="_blank" rel="noopener">Source</a>
        </footer>
      </form>
    </proto-sheet>
  `,
  styles: `
    .form {
      display: grid;
      gap: var(--hn-space-5);
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
    .lbl {
      font: var(--hn-type-label);
      padding: 0;
    }
    input[type='text'] {
      min-height: var(--hn-tap);
      padding: 0 var(--hn-space-3);
      border: 1px solid var(--hn-line-strong);
      border-radius: var(--hn-radius-md);
      background: var(--hn-surface);
      color: var(--hn-text);
      font: var(--hn-type-body);
    }
    .help {
      margin: 0;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .swatches {
      display: grid;
      grid-template-columns: repeat(6, var(--hn-tap));
      gap: var(--hn-space-2);
    }
    .sw {
      width: var(--hn-tap);
      height: var(--hn-tap);
      border-radius: var(--hn-radius-pill);
      border: 0;
      box-shadow: 0 0 0 1.5px var(--hn-surface);
      cursor: pointer;
    }
    .sw[aria-checked='true'] {
      box-shadow:
        0 0 0 2px var(--hn-surface),
        0 0 0 4px var(--hn-text);
    }
    .start {
      justify-self: start;
    }
    .custom {
      display: grid;
      gap: var(--hn-space-1);
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
    .sw-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--hn-space-4);
    }
    .lbl-wrap {
      display: grid;
      gap: var(--hn-space-1);
    }
    .switch {
      position: relative;
      flex: none;
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
    .about {
      padding-top: var(--hn-space-4);
      border-top: 1px solid var(--hn-line);
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .about a {
      color: var(--hn-accent-text);
    }
  `,
})
export class ProtoProfileSheetComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly colours = Object.keys(AVATAR_VARIANTS) as AvatarKey[];
  protected readonly names = COLOUR_NAMES;
  protected readonly themes: { id: ThemeChoice; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];
  protected readonly custom = signal(false);
  protected readonly themeChoice = computed<ThemeChoice>(() => {
    const c = this.store.entry()['themeChoice'];
    return c === 'system' || c === 'light' || c === 'dark' ? c : this.store.theme();
  });
  protected readonly singleKeys = computed(
    () => this.store.entry()['singleKeyShortcuts'] !== false,
  );

  protected fill(k: AvatarKey): string {
    const v = AVATAR_VARIANTS[k];
    return this.store.theme() === 'dark' ? v.dark : v.light;
  }
  protected setColour(k: AvatarKey) {
    const me = this.store.model.self;
    if (!me) return;
    me.color = k;
    this.store.bump();
  }
  protected rename(v: string) {
    const name = v.trim();
    if (name) this.store.model.renameSelf(name);
  }
  protected setTheme(t: ThemeChoice) {
    this.store.setEntry({ themeChoice: t });
    const dark =
      t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    this.store.theme.set(dark ? 'dark' : 'light');
  }
}
