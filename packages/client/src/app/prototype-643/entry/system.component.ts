/**
 * PROTOTYPE (#643). The "Ink & Dot" design system sheet (§5), rendered live in
 * the frame's theme. Every contrast ratio here is MEASURED in this browser:
 * the token values are read back from the CSS variables of two hidden probes
 * (light, dark; the dark probe follows the lab's O8 fill), resolved through a
 * 1×1 canvas and run through the WCAG 2 formula. The plan's value sits next to
 * each one, so a drift between tokens.css and the plan shows up at once.
 */
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowUndoOutline,
  chevronBackOutline,
  clipboardOutline,
  closeOutline,
  cloudOfflineOutline,
  copyOutline,
  ellipsisHorizontal,
  exitOutline,
  eyeOutline,
  helpCircleOutline,
  peopleOutline,
  personAddOutline,
  personCircleOutline,
  playSkipForwardOutline,
  powerOutline,
  qrCodeOutline,
  refreshOutline,
  shareOutline,
  syncOutline,
} from 'ionicons/icons';

import { ProtoStore } from '../proto-store';
import { AVATAR_VARIANTS, type AvatarKey } from '../room-model';
import { MANIFEST, ProtoBrowserChrome, VIEWPORT_SHIP } from './browser-chrome.service';
import { contrast } from './entry-kit';
import { BEFORE, ICONS, MOTION, PAIRS, RADII, SPACE, TOKENS, TYPE_SCALE } from './system-data';

type Theme = 'light' | 'dark';
type Tok = Record<string, string>;
interface Cell {
  v: number;
  pass: boolean;
}

const need = (kind: 'text' | 'ui') => (kind === 'text' ? 4.5 : 3);
const cell = (fg: string | undefined, bg: string | undefined, min: number): Cell => {
  const v = fg && bg ? contrast(fg, bg) : Number.NaN;
  return { v, pass: v >= min };
};

@Component({
  selector: 'proto-system',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <!-- probes: never shown; their computed custom properties are the measured tokens -->
    <div #probeLight class="hn-proto probe" aria-hidden="true"></div>
    <div #probeDark class="hn-proto probe" data-theme="dark" aria-hidden="true"></div>

    <main class="sys" aria-labelledby="sys-h">
      <header class="sys-head">
        <h1 id="sys-h"><span class="mark" aria-hidden="true"></span>Ink &amp; Dot</h1>
        <p class="lead">hnch's design system, rendered live in the {{ store.theme() }} theme. Ratios are measured in this browser from the actual CSS variables.</p>
        <div class="seg-row" role="group" aria-label="Theme">
          <button type="button" class="hn-chip" [attr.aria-pressed]="store.theme() === 'light'" (click)="store.theme.set('light')">Light</button>
          <button type="button" class="hn-chip" [attr.aria-pressed]="store.theme() === 'dark'" (click)="store.theme.set('dark')">Dark</button>
          <button type="button" class="hn-btn quiet" (click)="measure()">Re-measure</button>
        </div>
        <p class="meta">
          {{ passCount() }} of {{ rows().length * 2 }} pairs pass ·
          dark fill: {{ fill() === 'mint' ? 'mint (O8)' : '#267A5A' }}
        </p>
      </header>

      <!-- 1 colour tokens -->
      <section aria-labelledby="s-tok">
        <h2 id="s-tok">Colour tokens</h2>
        <div class="scroll">
          <table class="tbl">
            <thead>
              <tr><th scope="col">Token</th><th scope="col">Light</th><th scope="col">Dark</th></tr>
            </thead>
            <tbody>
              @for (t of tokens; track t) {
                <tr>
                  <th scope="row"><code>--hn-{{ t }}</code></th>
                  <td><span class="sw" [style.background]="val('light', t)"></span><code>{{ val('light', t) }}</code></td>
                  <td><span class="sw" [style.background]="val('dark', t)"></span><code>{{ val('dark', t) }}</code></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <!-- 2 measured contrast -->
      <section aria-labelledby="s-con" data-ux="UX-048 UX-051">
        <h2 id="s-con">Measured contrast</h2>
        <p class="hint">Text needs 4.5:1, UI (fills, rings, borders) 3:1. "plan" is §5.1's value. The column for the current theme is marked.</p>
        <div class="scroll">
          <table class="tbl con">
            <thead>
              <tr>
                <th scope="col">Pair</th>
                <th scope="col" [class.cur]="store.theme() === 'light'">Light</th>
                <th scope="col" [class.cur]="store.theme() === 'dark'">Dark</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track $index) {
                <tr [attr.data-ux]="r.p.ux">
                  <th scope="row">
                    <code>{{ r.p.fg }} / {{ r.p.bg }}</code>
                    <span class="kind">{{ r.p.kind === 'text' ? 'text' : 'UI' }}</span>
                    @if (r.p.note) {
                      <span class="note">{{ r.p.note }}</span>
                    }
                  </th>
                  @for (th of themes; track th) {
                    @let c = th === 'light' ? r.light : r.dark;
                    <td [class.cur]="store.theme() === th">
                      <span class="pair" [style.background]="val(th, r.p.bg)" [style.color]="val(th, r.p.fg)" aria-hidden="true">Aa</span>
                      <span class="tnum ratio">{{ r2(c.v) }}</span>
                      <span [class]="c.pass ? 'st-agreed' : 'fail'">{{ c.pass ? '✓ AA' : '✗ fails' }}</span>
                      <span class="plan tnum">plan {{ th === 'light' ? r.p.plan.light : r.p.plan.dark }}</span>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <h3>Today, for comparison</h3>
        <ul class="plain">
          @for (b of before(); track $index) {
            <li [attr.data-ux]="b.ux">
              <span class="pair" [style.background]="b.bg" [style.color]="b.fg" aria-hidden="true">Aa</span>
              {{ b.label }}: <strong class="tnum">{{ r2(b.c.v) }}</strong>
              <span [class]="b.c.pass ? 'st-agreed' : 'fail'">{{ b.c.pass ? '✓ AA' : '✗ fails' }}</span>
            </li>
          }
        </ul>
        <div class="status-row" aria-label="Status words in this theme">
          <span class="st-agreed">✓ Agreed</span>
          <span class="st-close">≈ Close</span>
          <span class="st-split">↔ Split</span>
          <span class="st-none">– No votes</span>
          <span class="t2">Secondary text</span>
          <span class="t3">Meta text · 0:42</span>
        </div>
        <p class="hint">Status is always glyph + word, never colour alone, never red.</p>
      </section>

      <!-- 3 accent policy -->
      <section aria-labelledby="s-acc" data-ux="UX-049">
        <h2 id="s-acc">Accent policy</h2>
        <p>
          One brand accent: <strong>racing green</strong>. The 12-colour accent picker is cut (§3.10 #59); the colours stay as avatar identity only.
          ADR-0043 calls the palette "pre-validated AA". Measured here as text on white, {{ failingAccents() }} of 12 fail, so that premise needs correcting.
        </p>
        <ul class="accents" role="list">
          @for (a of accents(); track a.key) {
            <li [class.offered]="a.key === 'racing-green'" [class.struck]="!a.onWhite.pass">
              <span class="dot" [style.background]="a.base" aria-hidden="true"></span>
              <span class="acc-name">{{ a.key }}</span>
              <span class="tnum">{{ r2(a.onWhite.v) }} on white</span>
              @if (a.key === 'racing-green') {
                <span class="st-agreed">✓ the accent</span>
              } @else if (a.onWhite.pass) {
                <span class="t3">passes, not offered</span>
              } @else {
                <span class="fail">✗ fails as text</span>
              }
            </li>
          }
        </ul>
      </section>

      <!-- 4 selected card + primary in Material-dark -->
      <section aria-labelledby="s-card">
        <h2 id="s-card">Selected card and primary button</h2>
        <div class="duo">
          @for (th of themes; track th) {
            <div class="hn-proto panel" [attr.data-theme]="th" [attr.data-fill]="th === 'dark' ? fill() : null" data-ux="UX-050">
              <p class="panel-h">{{ th }}</p>
              <div class="tiles">
                <span class="tile sel tnum" aria-hidden="true">8</span>
                <span class="tile tnum" aria-hidden="true">13</span>
              </div>
              <p class="meta">
                numeral on fill <strong class="tnum">{{ r2(ratio(th, 'on-accent', 'accent')) }}</strong> · ring vs tile
                <strong class="tnum">{{ r2(ratio(th, 'accent-text', 'surface-2')) }}</strong>
              </p>
            </div>
          }
        </div>
        <div class="hn-proto panel md-dark" data-theme="dark" [attr.data-fill]="fill()" data-ux="UX-052">
          <p class="panel-h">Material-like dark page (#121212)</p>
          <button type="button" class="hn-btn primary block">Continue</button>
          <p class="meta">
            label on fill <strong class="tnum">{{ r2(ratio('dark', 'on-accent', 'accent')) }}</strong> · fill vs page
            <strong class="tnum">{{ r2(mdDark()) }}</strong>. Today: dark ink on green, 2.57:1 (audit VIS-05). Onboarding is cut anyway; the one button kit sets fill and label itself.
          </p>
        </div>
      </section>

      <!-- 5 one visual language -->
      <section aria-labelledby="s-mode" data-ux="UX-055">
        <h2 id="s-mode">One visual language</h2>
        <p>
          <code>provideIonicAngular(&#123; mode: 'ios', rippleEffect: false &#125;)</code> on every platform. Ionic only does the toolbar, sheets and gestures; the stage is plain HTML on these tokens.
          Buttons are sentence case everywhere.
        </p>
        <div class="kit">
          <button type="button" class="hn-btn primary">Primary</button>
          <button type="button" class="hn-btn primary" disabled>Disabled</button>
          <button type="button" class="hn-btn secondary">Secondary</button>
          <button type="button" class="hn-btn quiet">Quiet</button>
          <button type="button" class="hn-btn danger">End for everyone</button>
          <button type="button" class="hn-btn danger-quiet">Remove</button>
          <span class="hn-chip">Chip</span>
          <kbd class="hn-kbd">⏎</kbd>
        </div>
        <p class="hint">Today on Android and desktop: Material, with <s>END SESSION</s> uppercase full-width buttons. Disabled primary is tonal, never grey.</p>
      </section>

      <!-- 6 type -->
      <section aria-labelledby="s-type" data-ux="UX-058 UX-059">
        <h2 id="s-type">Type</h2>
        <p data-ux="UX-058" class="font-state" [class.fallback]="!inter()">
          @if (inter()) {
            Rendering in <strong>Inter</strong> (found on this machine). The real build self-hosts Inter Variable.
          } @else {
            Rendering in a <strong>fallback</strong> (system-ui): Inter isn't installed here and this prototype doesn't bundle it.
            The real build self-hosts Inter Variable (Latin, Latin-Ext, Vietnamese ≤60 kB, font-display: swap), so layout no longer depends on fallback metrics.
          }
        </p>
        <p class="sample-names">Łukasz · Nguyễn · Юлия · 0 1 2 3 5 8 13 21</p>
        <ul class="plain type" data-ux="UX-059">
          @for (t of typeScale; track t.token) {
            <li>
              <span class="type-meta"><code>--hn-type-{{ t.token }}</code> {{ t.spec }} · {{ t.use }}</span>
              <span class="tnum" [style.font]="'var(--hn-type-' + t.token + ')'">{{ t.sample }}</span>
            </li>
          }
        </ul>
        <p class="hint">8 sizes, weights 400 / 600 / 700 (750 for display). No uppercase. Today: 28 sizes, 5 weights.</p>
      </section>

      <!-- 7 space, radius, elevation -->
      <section aria-labelledby="s-space" data-ux="UX-059">
        <h2 id="s-space">Space, radius, elevation</h2>
        <ul class="plain">
          @for (s of space; track s) {
            <li class="space-row">
              <code>--hn-space-{{ s }}</code>
              <span class="bar" [style.width]="'var(--hn-space-' + s + ')'"></span>
            </li>
          }
        </ul>
        <div class="kit">
          @for (r of radii; track r) {
            <span class="radius" [style.border-radius]="'var(--hn-radius-' + r + ')'">{{ r }}</span>
          }
        </div>
        <div class="kit">
          <span class="elev e0">e0 · page</span>
          <span class="elev hn-stage">e1 · stage</span>
          <span class="elev hn-sheet">e2 · sheet</span>
        </div>
        <p class="hint">Radii 8 / 12 / 20 / pill (today: 12 radii). One elevated plane, the stage. Dead and no-op theme tokens deleted.</p>
      </section>

      <!-- 8 icons -->
      <section aria-labelledby="s-ico" data-ux="UX-060">
        <h2 id="s-ico">Icons</h2>
        <p class="hint">Ionicons outline, 20 px in content, 24 px in toolbars. No emoji in chrome: the stopwatch emoji and emoji confetti go.</p>
        <ul class="icons" role="list">
          @for (i of icons; track i.concept) {
            <li>
              @if (i.icon) {
                <ion-icon [name]="i.icon" aria-hidden="true" />
                <span>{{ i.concept }}</span>
                <code>{{ i.icon }}</code>
              } @else {
                <span class="noicon" aria-hidden="true">–</span>
                <span>{{ i.concept }}</span>
                <span class="t3">{{ i.text }}</span>
              }
            </li>
          }
        </ul>
      </section>

      <!-- 9 avatars -->
      <section aria-labelledby="s-av" data-ux="UX-057">
        <h2 id="s-av">Avatar dots</h2>
        <p class="hint">Render-time variants: each dot ≥3:1 against the page and surfaces in its theme, initials ≥4.5:1. "today" is the stored base on the dark surface.</p>
        <div class="scroll">
          <table class="tbl av">
            <thead>
              <tr><th scope="col">Key</th><th scope="col">Light · dot / ink</th><th scope="col">Dark · dot / ink</th><th scope="col">Today, dark</th></tr>
            </thead>
            <tbody>
              @for (a of avatars(); track a.key) {
                <tr>
                  <th scope="row">{{ a.key }}</th>
                  <td>
                    <span class="hn-proto av-cell"><span class="avd" [style.background]="a.v.light" [style.color]="a.v.lightInk">A</span></span>
                    <span class="tnum" [class.fail]="!a.light.pass">{{ r2(a.light.v) }}</span> /
                    <span class="tnum" [class.fail]="!a.lightInk.pass">{{ r2(a.lightInk.v) }}</span>
                  </td>
                  <td>
                    <span class="hn-proto av-cell" data-theme="dark"><span class="avd" [style.background]="a.v.dark" [style.color]="a.v.darkInk">A</span></span>
                    <span class="tnum" [class.fail]="!a.dark.pass">{{ r2(a.dark.v) }}</span> /
                    <span class="tnum" [class.fail]="!a.darkInk.pass">{{ r2(a.darkInk.v) }}</span>
                  </td>
                  <td>
                    <span class="tnum" [class.fail]="!a.today.pass">{{ r2(a.today.v) }}</span>
                    {{ a.today.pass ? '' : '✗' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <!-- 10 focus ring -->
      <section aria-labelledby="s-focus" data-ux="UX-071">
        <h2 id="s-focus">Focus ring</h2>
        <p class="hint">Press Tab into these. 2 px <code>--hn-focus</code>, offset 2 px, in both themes.</p>
        <div class="duo">
          @for (th of themes; track th) {
            <div class="hn-proto panel" [attr.data-theme]="th">
              <p class="panel-h">{{ th }}</p>
              <div class="kit">
                <button type="button" class="hn-btn primary">Reveal</button>
                <button type="button" class="hn-btn secondary">Re-vote</button>
                <button type="button" class="tile tnum" aria-label="Card 5">5</button>
              </div>
              <p class="meta">
                ring vs surface <strong class="tnum">{{ r2(ratio(th, 'focus', 'surface')) }}</strong> · vs page
                <strong class="tnum">{{ r2(ratio(th, 'focus', 'bg')) }}</strong> · vs tile
                <strong class="tnum">{{ r2(ratio(th, 'focus', 'surface-2')) }}</strong>
              </p>
            </div>
          }
        </div>
      </section>

      <!-- 11 motion -->
      <section aria-labelledby="s-mo">
        <h2 id="s-mo">Motion</h2>
        <div class="kit">
          <button type="button" class="hn-btn secondary" (click)="played.set(!played())">{{ played() ? 'Play back' : 'Play' }}</button>
          <button type="button" class="hn-btn quiet" [attr.aria-pressed]="store.reducedMotion()" (click)="store.reducedMotion.set(!store.reducedMotion())">
            Reduced motion: {{ store.reducedMotion() ? 'on' : 'off' }}
          </button>
        </div>
        <ul class="plain">
          @for (mo of motion; track mo.token) {
            <li class="mo">
              <span class="type-meta"><code>--hn-dur-{{ mo.token }}</code> · ease-{{ mo.ease }} · {{ mo.use }}</span>
              <span class="track" [class.go]="played()">
                <span
                  class="mdot"
                  [style.transition]="'inset-inline-start var(--hn-dur-' + mo.token + ') var(--hn-ease-' + mo.ease + '), opacity var(--hn-dur-' + mo.token + ') var(--hn-ease-std)'"
                ></span>
              </span>
            </li>
          }
        </ul>
        <p class="hint">Reduced motion turns every move into a cross-fade (here: instant). The settle ring still fills and the "✓ hnch'd" stamp still shows, because they carry information. No <code>transition: all</code>.</p>
      </section>

      <!-- 12 browser chrome + viewport -->
      <section aria-labelledby="s-chrome" data-ux="UX-053">
        <h2 id="s-chrome">Browser chrome</h2>
        <div class="chrome">
          <svg class="fav" viewBox="0 0 32 32" role="img" aria-label="hnch favicon: a green dot">
            <rect width="32" height="32" rx="8" fill="#F6F6F3" />
            <circle cx="16" cy="16" r="7" fill="#0B3D2E" />
          </svg>
          <dl>
            <dt>Tab title now</dt>
            <dd><code>{{ chrome.title() }}</code> (Home "hnch", Room "Sprint 42 · hnch")</dd>
            <dt>theme-color now</dt>
            <dd><span class="sw" [style.background]="chrome.themeColor()"></span><code>{{ chrome.themeColor() }}</code> = <code>--hn-bg</code>, follows the theme</dd>
            <dt>Manifest</dt>
            <dd><code>name "{{ manifest.name }}" · short_name "{{ manifest.short_name }}" · theme_color {{ manifest.theme_color }}</code></dd>
          </dl>
        </div>
        <p class="hint">The favicon in this tab is the dot mark, set at runtime. Today: "Ionic App", the Ionic logo, no manifest.</p>
      </section>

      <section aria-labelledby="s-vp" data-ux="UX-070">
        <h2 id="s-vp">Pinch-zoom</h2>
        <p>Ship: <code>&lt;meta name="viewport" content="{{ viewportShip }}"&gt;</code></p>
        <p class="hint">
          No <code>maximum-scale</code>, no <code>user-scalable=no</code>; inputs are 16 px so iOS doesn't zoom on focus.
          This page's live viewport: <code>{{ viewportLive() }}</code>
          <span [class]="zoomBlocked() ? 'fail' : 'st-agreed'">{{ zoomBlocked() ? '✗ zoom blocked' : '✓ zoom allowed' }}</span>
        </p>
      </section>
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100%;
      background: var(--hn-bg);
      color: var(--hn-text);
    }
    .probe {
      display: none;
    }
    .sys {
      max-width: var(--hn-frame-max);
      margin: 0 auto;
      padding: var(--hn-space-4) var(--hn-space-4) var(--hn-space-8);
      display: flex;
      flex-direction: column;
      gap: var(--hn-space-6);
    }
    h1 {
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      margin: 0;
      font: var(--hn-type-headline);
    }
    h1 .mark {
      width: 16px;
      height: 16px;
      border-radius: var(--hn-radius-pill);
      background: var(--hn-accent);
    }
    h2 {
      margin: 0 0 var(--hn-space-2);
      font: var(--hn-type-title);
    }
    h3 {
      margin: var(--hn-space-4) 0 var(--hn-space-2);
      font: var(--hn-type-label);
    }
    p {
      margin: 0 0 var(--hn-space-2);
    }
    .lead {
      color: var(--hn-text-2);
    }
    .hint,
    .meta {
      font: var(--hn-type-small);
      color: var(--hn-text-3);
    }
    .t2 {
      color: var(--hn-text-2);
    }
    .t3 {
      color: var(--hn-text-3);
    }
    .fail {
      color: var(--hn-danger);
    }
    code {
      font-family: var(--hn-mono);
      font-size: 13px;
    }
    .seg-row,
    .kit {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--hn-space-2);
      margin-bottom: var(--hn-space-2);
    }
    .hn-chip[aria-pressed='true'] {
      background: var(--hn-accent);
      color: var(--hn-on-accent);
    }
    button.hn-chip {
      cursor: pointer;
    }
    .scroll {
      overflow-x: auto;
    }
    .tbl {
      border-collapse: collapse;
      width: 100%;
      font: var(--hn-type-small);
    }
    .tbl th,
    .tbl td {
      text-align: start;
      padding: var(--hn-space-2);
      border-bottom: 1px solid var(--hn-line);
      vertical-align: middle;
      white-space: nowrap;
    }
    .tbl thead th {
      font: var(--hn-type-caption);
      color: var(--hn-text-2);
    }
    .tbl th[scope='row'] {
      font-weight: 400;
    }
    .tbl .cur {
      background: var(--hn-accent-soft);
    }
    .con th[scope='row'] {
      white-space: normal;
      min-width: 160px;
    }
    .kind,
    .note,
    .plan {
      display: block;
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .ratio {
      font: var(--hn-type-label);
      margin: 0 var(--hn-space-1);
    }
    .sw {
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: var(--hn-radius-sm);
      border: 1px solid var(--hn-line-strong);
      vertical-align: middle;
      margin-inline-end: var(--hn-space-2);
    }
    .pair {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 24px;
      border-radius: var(--hn-radius-sm);
      border: 1px solid var(--hn-line);
      font: var(--hn-type-label);
      vertical-align: middle;
    }
    .plain {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--hn-space-2);
    }
    .status-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--hn-space-4);
      margin: var(--hn-space-3) 0 var(--hn-space-1);
      padding: var(--hn-space-3);
      background: var(--hn-surface);
      border-radius: var(--hn-radius-md);
      font: var(--hn-type-label);
    }
    .accents {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--hn-space-2);
    }
    .accents li {
      display: flex;
      align-items: center;
      gap: var(--hn-space-2);
      font: var(--hn-type-small);
      padding: var(--hn-space-2);
      border-radius: var(--hn-radius-sm);
    }
    .accents li.struck .acc-name,
    .accents li.struck .tnum {
      text-decoration: line-through;
      color: var(--hn-text-3);
    }
    .accents li.offered {
      background: var(--hn-accent-soft);
      font-weight: 600;
    }
    .dot {
      width: 16px;
      height: 16px;
      flex: none;
      border-radius: var(--hn-radius-pill);
    }
    .duo {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--hn-space-3);
      margin-bottom: var(--hn-space-3);
    }
    @container device (min-width: 600px) {
      .duo {
        grid-template-columns: 1fr 1fr;
      }
    }
    .panel {
      padding: var(--hn-space-4);
      border-radius: var(--hn-radius-lg);
      border: 1px solid var(--hn-line);
      background: var(--hn-surface);
    }
    .panel-h {
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .md-dark {
      --md-dark-bg: #121212;
      background: var(--md-dark-bg);
      max-width: var(--hn-dialog-w);
    }
    .tiles {
      display: flex;
      gap: var(--hn-space-2);
      margin-bottom: var(--hn-space-2);
    }
    .tile {
      display: grid;
      place-items: center;
      width: var(--hn-tile-w);
      height: 88px;
      border-radius: var(--hn-radius-md);
      background: var(--hn-surface-2);
      color: var(--hn-text);
      font: var(--hn-type-numeral);
      border: 0;
      cursor: pointer;
    }
    .tile.sel {
      background: var(--hn-accent);
      color: var(--hn-on-accent);
      box-shadow: 0 0 0 2px var(--hn-accent-text);
      transform: translateY(-4px);
    }
    .font-state {
      padding: var(--hn-space-3);
      border-radius: var(--hn-radius-md);
      background: var(--hn-accent-soft);
      color: var(--hn-accent-text);
      font: var(--hn-type-small);
    }
    .font-state.fallback {
      background: var(--hn-surface-2);
      color: var(--hn-text);
    }
    .sample-names {
      font: var(--hn-type-title);
    }
    .type li {
      display: flex;
      flex-direction: column;
      gap: var(--hn-space-1);
      padding-bottom: var(--hn-space-2);
      border-bottom: 1px solid var(--hn-line);
    }
    .type-meta {
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    .space-row {
      display: flex;
      align-items: center;
      gap: var(--hn-space-3);
      font: var(--hn-type-caption);
    }
    .space-row code {
      width: 120px;
    }
    .bar {
      height: 12px;
      background: var(--hn-accent);
      border-radius: 2px;
    }
    .radius {
      display: grid;
      place-items: center;
      width: 64px;
      height: 48px;
      background: var(--hn-accent-soft);
      color: var(--hn-accent-text);
      font: var(--hn-type-caption);
    }
    .elev {
      display: grid;
      place-items: center;
      width: 120px;
      height: 64px;
      border-radius: var(--hn-radius-md);
      font: var(--hn-type-caption);
    }
    .elev.e0 {
      background: var(--hn-bg);
      border: 1px dashed var(--hn-line-strong);
    }
    .icons {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--hn-space-1) var(--hn-space-4);
    }
    .icons li {
      display: grid;
      grid-template-columns: 24px 1fr auto;
      align-items: center;
      gap: var(--hn-space-2);
      min-height: 36px;
      font: var(--hn-type-small);
      border-bottom: 1px solid var(--hn-line);
    }
    .icons ion-icon {
      font-size: 20px;
      color: var(--hn-accent-text);
    }
    .icons code {
      color: var(--hn-text-3);
      font-size: 11px;
    }
    .noicon {
      text-align: center;
      color: var(--hn-text-3);
    }
    .av-cell {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: var(--hn-radius-sm);
      background: var(--hn-surface);
      vertical-align: middle;
      margin-inline-end: var(--hn-space-1);
    }
    .avd {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: var(--hn-radius-pill);
      font: var(--hn-type-caption);
      font-weight: 700;
      box-shadow: 0 0 0 1.5px var(--hn-surface);
    }
    .mo {
      display: flex;
      flex-direction: column;
      gap: var(--hn-space-1);
    }
    .track {
      position: relative;
      display: block;
      height: 16px;
      border-radius: var(--hn-radius-pill);
      background: var(--hn-surface-2);
    }
    .mdot {
      position: absolute;
      top: 0;
      inset-inline-start: 0;
      width: 16px;
      height: 16px;
      border-radius: var(--hn-radius-pill);
      background: var(--hn-accent);
    }
    .track.go .mdot {
      inset-inline-start: calc(100% - 16px);
    }
    .chrome {
      display: flex;
      gap: var(--hn-space-4);
      align-items: flex-start;
    }
    .fav {
      width: 48px;
      height: 48px;
      flex: none;
      border-radius: var(--hn-radius-sm);
      box-shadow: var(--hn-e1);
    }
    dl {
      margin: 0;
      font: var(--hn-type-small);
    }
    dt {
      font: var(--hn-type-caption);
      color: var(--hn-text-3);
    }
    dd {
      margin: 0 0 var(--hn-space-2);
      overflow-wrap: anywhere;
    }
  `,
})
export class ProtoSystemComponent {
  protected readonly store = inject(ProtoStore);
  protected readonly chrome = inject(ProtoBrowserChrome);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly probeLight = viewChild<ElementRef<HTMLElement>>('probeLight');
  private readonly probeDark = viewChild<ElementRef<HTMLElement>>('probeDark');

  protected readonly themes: Theme[] = ['light', 'dark'];
  protected readonly tokens = TOKENS;
  protected readonly typeScale = TYPE_SCALE;
  protected readonly space = SPACE;
  protected readonly radii = RADII;
  protected readonly motion = MOTION;
  protected readonly icons = ICONS;
  protected readonly manifest = MANIFEST;
  protected readonly viewportShip = VIEWPORT_SHIP;

  protected readonly tok = signal<{ light: Tok; dark: Tok }>({ light: {}, dark: {} });
  protected readonly fill = signal<string | null>(null);
  protected readonly inter = signal(false);
  protected readonly viewportLive = signal('');
  protected readonly played = signal(false);

  protected readonly zoomBlocked = computed(() =>
    /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/iu.test(this.viewportLive()),
  );

  protected readonly rows = computed(() => {
    const t = this.tok();
    return PAIRS.map((p) => ({
      p,
      light: cell(t.light[p.fg], t.light[p.bg], need(p.kind)),
      dark: cell(t.dark[p.fg], t.dark[p.bg], need(p.kind)),
    }));
  });
  protected readonly passCount = computed(() =>
    this.rows().reduce((n, r) => n + (r.light.pass ? 1 : 0) + (r.dark.pass ? 1 : 0), 0),
  );
  protected readonly before = computed(() =>
    BEFORE.map((b) => ({
      label: b.label,
      fg: b.fg,
      bg: b.bg,
      ux: b.ux,
      c: cell(b.fg, b.bg, need(b.kind)),
    })),
  );
  protected readonly accents = computed(() =>
    (Object.keys(AVATAR_VARIANTS) as AvatarKey[]).map((key) => {
      const base = AVATAR_VARIANTS[key].base;
      return { key, base, onWhite: cell(base, '#FFFFFF', 4.5) };
    }),
  );
  protected readonly failingAccents = computed(
    () => this.accents().filter((a) => !a.onWhite.pass).length,
  );
  protected readonly avatars = computed(() => {
    const t = this.tok();
    const minOf = (fg: string, bgs: (string | undefined)[]): Cell => {
      const vs = bgs.map((b) => cell(fg, b, 3).v);
      const v = Math.min(...vs);
      return { v, pass: v >= 3 };
    };
    return (Object.keys(AVATAR_VARIANTS) as AvatarKey[]).map((key) => {
      const v = AVATAR_VARIANTS[key];
      return {
        key,
        v,
        light: minOf(v.light, [t.light['bg'], t.light['surface']]),
        lightInk: cell(v.lightInk, v.light, 4.5),
        dark: minOf(v.dark, [t.dark['bg'], t.dark['surface'], t.dark['surface-2']]),
        darkInk: cell(v.darkInk, v.dark, 4.5),
        today: cell(v.base, t.dark['surface'], 3),
      };
    });
  });
  protected readonly mdDark = computed(() => contrast(this.tok().dark['accent'] ?? '', '#121212'));

  constructor() {
    addIcons({
      addOutline,
      arrowUndoOutline,
      chevronBackOutline,
      clipboardOutline,
      closeOutline,
      cloudOfflineOutline,
      copyOutline,
      ellipsisHorizontal,
      exitOutline,
      eyeOutline,
      helpCircleOutline,
      peopleOutline,
      personAddOutline,
      personCircleOutline,
      playSkipForwardOutline,
      powerOutline,
      qrCodeOutline,
      refreshOutline,
      shareOutline,
      syncOutline,
    });
    afterNextRender(() => {
      const device = this.host.nativeElement.closest('.proto-device');
      this.syncFill(device);
      this.measure();
      this.inter.set(fontAvailable('Inter var') || fontAvailable('Inter'));
      this.viewportLive.set(
        document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content ?? '(none)',
      );
      if (!device) return;
      // the lab's theme and O8 dark-fill toggles change attributes on the frame
      const mo = new MutationObserver(() => {
        this.syncFill(device);
        this.measure();
      });
      mo.observe(device, { attributes: true, attributeFilter: ['data-theme', 'data-fill'] });
      this.destroyRef.onDestroy(() => mo.disconnect());
    });
  }
  private readonly destroyRef = inject(DestroyRef);

  private syncFill(device: Element | null) {
    const f = device?.getAttribute('data-fill') ?? null;
    this.fill.set(f);
    const dark = this.probeDark()?.nativeElement;
    if (!dark) return;
    if (f) dark.setAttribute('data-fill', f);
    else dark.removeAttribute('data-fill');
  }

  protected measure() {
    const read = (el: HTMLElement | undefined): Tok => {
      if (!el) return {};
      const cs = getComputedStyle(el);
      const out: Tok = {};
      for (const t of TOKENS) out[t] = cs.getPropertyValue(`--hn-${t}`).trim();
      return out;
    };
    this.tok.set({
      light: read(this.probeLight()?.nativeElement),
      dark: read(this.probeDark()?.nativeElement),
    });
  }

  protected r2(v: number): string {
    return Number.isFinite(v) ? v.toFixed(2) : '–';
  }
  protected val(theme: Theme, token: string): string {
    return this.tok()[theme][token] ?? '';
  }
  protected ratio(theme: Theme, fg: string, bg: string): number {
    const t = this.tok()[theme];
    return contrast(t[fg] ?? '', t[bg] ?? '');
  }
}

/** Is a font installed / loaded? Compare text widths against generic fallbacks. */
function fontAvailable(name: string): boolean {
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return false;
  const text = 'mmmmmmmmmmlli1WQ@#08';
  for (const base of ['monospace', 'serif']) {
    c.font = `72px ${base}`;
    const w0 = c.measureText(text).width;
    c.font = `72px "${name}", ${base}`;
    if (c.measureText(text).width !== w0) return true;
  }
  return false;
}
