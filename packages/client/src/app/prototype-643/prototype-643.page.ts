/**
 * PROTOTYPE (#643), throwaway. What #643 ("one room, one button, one number")
 * would look like, covering all 109 register entries.
 *
 * Route: /prototype-643?scene=<id>&frame=phone|small-phone|tablet|desktop|wide&theme=light|dark
 * (dev builds only; see app.routes.ts). Fake in-memory room, no relay needed.
 *
 *   ← / →          previous / next scene (floating bar; ignored while focus is inside the device)
 *   Lab panel      who you look as, device, theme, decisions O1–O18, trust lab, coverage of all 109
 *   Coverage row   click = open its scene and outline the element (data-ux) that answers it
 *
 * The terminal half lives in packages/cli/src/prototype-643 (`pnpm proto:643:cli`).
 */
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { COVERAGE, type CoverageEntry } from './coverage/coverage';
import { ProtoHomeComponent } from './entry/home.component';
import { ProtoJoinComponent } from './entry/join.component';
import { ProtoSystemComponent } from './entry/system.component';
import { FRAME_SIZE, type Frame, ProtoStore } from './proto-store';
import { REGISTER, type RegisterEntry } from './register';
import { ProtoRoomPage } from './room/room.page';
import { applyScene, SCENES, type Scene } from './scenes';

type CovFilter = 'all' | 'missing' | 'shown' | 'cli' | 'note';

@Component({
  selector: 'proto-643-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [ProtoRoomPage, ProtoHomeComponent, ProtoJoinComponent, ProtoSystemComponent],
  host: { class: 'ion-page proto-643-host' },
  styleUrl: './proto-tokens.css',
  template: `
    @let m = store.m();
    @let d = m.state.decisions;
    <div class="proto-canvas" #canvas>
      <div
        #device
        class="proto-device hn-proto"
        [attr.data-kind]="store.frame()"
        [attr.data-theme]="store.theme()"
        [attr.data-pointer]="store.pointer()"
        [attr.data-wide]="store.frame() === 'wide'"
        [attr.data-fill]="darkFill()"
        [attr.data-reduced-motion]="store.reducedMotion()"
        [style.width.px]="frameSize().w"
        [style.height.px]="frameSize().h"
        [style.zoom]="zoom()"
      >
        @switch (store.screen()) {
          @case ('home') {
            <proto-home />
          }
          @case ('join') {
            <proto-join />
          }
          @case ('system') {
            <proto-system />
          }
          @default {
            <proto-room />
          }
        }
      </div>
    </div>

    <aside class="proto-lab" [hidden]="!labOpen()" aria-label="Prototype lab">
      <h1>#643 prototype · one room, one button, one number</h1>
      <p class="sub">Throwaway. Fake room, no relay. The terminal half: <code>pnpm proto:643:cli</code>.</p>

      <h2>SCENE</h2>
      <div class="row">
        <select [value]="sceneIndex()" (change)="go(+$any($event.target).value)" style="width: 100%">
          @for (g of groups(); track g[0]) {
            <optgroup [label]="g[0]">
              @for (s of g[1]; track s.scene.id) {
                <option [value]="s.i" [selected]="s.i === sceneIndex()">{{ s.scene.label }}</option>
              }
            </optgroup>
          }
        </select>
      </div>

      <h2>LOOK AS (same room, other eyes)</h2>
      <div class="row">
        @for (p of [['hana', 'Hana · host'], ['ana', 'Ana · voter'], ['bob', 'Bob · voter'], ['eve', 'Eve · watching'], ['kai', 'Kai · late joiner']]; track p[0]) {
          <button type="button" [attr.aria-pressed]="m.state.selfId === p[0]" (click)="viewAs(p[0]!)">{{ p[1] }}</button>
        }
      </div>
      <div class="row">
        <label class="k">Screen</label>
        @for (s of ['home', 'join', 'room', 'system']; track s) {
          <button type="button" [attr.aria-pressed]="store.screen() === s" (click)="store.screen.set($any(s))">{{ s }}</button>
        }
      </div>

      <h2>DEVICE</h2>
      <div class="row">
        @for (f of frames; track f[0]) {
          <button type="button" [attr.aria-pressed]="store.frame() === f[0]" (click)="setFrame(f[0])">{{ f[1].label }}</button>
        }
      </div>
      <div class="row">
        <label class="k">Theme</label>
        <button type="button" [attr.aria-pressed]="store.theme() === 'light'" (click)="setTheme('light')">Light</button>
        <button type="button" [attr.aria-pressed]="store.theme() === 'dark'" (click)="setTheme('dark')">Dark</button>
        <button type="button" [attr.aria-pressed]="store.reducedMotion()" (click)="store.reducedMotion.set(!store.reducedMotion())">Reduced motion</button>
      </div>

      <h2>OPEN OWNER DECISIONS (live)</h2>
      <div class="row">
        <label class="k">O4 Accept</label>
        <button type="button" [attr.aria-pressed]="d.acceptNext === 'one'" (click)="m.setDecision('acceptNext', 'one')">Accept · Next (1 tap)</button>
        <button type="button" [attr.aria-pressed]="d.acceptNext === 'two'" (click)="m.setDecision('acceptNext', 'two')">Accept, then Start</button>
      </div>
      <div class="row">
        <label class="k">O11 Settle</label>
        @for (ms of [0, 300, 500, 700]; track ms) {
          <button type="button" [attr.aria-pressed]="d.settleMs === ms" (click)="m.setDecision('settleMs', ms)">{{ ms ? ms + ' ms' : 'none' }}</button>
        }
      </div>
      <div class="row">
        <label class="k">O13 Rule</label>
        <button type="button" [attr.aria-pressed]="d.rule === 'step-distance'" (click)="m.setDecision('rule', 'step-distance')">Step distance + mode</button>
        <button type="button" [attr.aria-pressed]="d.rule === 'today'" (click)="m.setDecision('rule', 'today')">Today's rule</button>
      </div>
      <div class="row">
        <label class="k">O14 Late</label>
        <button type="button" [attr.aria-pressed]="d.lateJoiners === 'once-they-vote'" (click)="m.setDecision('lateJoiners', 'once-they-vote')">Count once they vote</button>
        <button type="button" [attr.aria-pressed]="d.lateJoiners === 'everyone-online'" (click)="m.setDecision('lateJoiners', 'everyone-online')">Everyone online</button>
      </div>
      <div class="row">
        <label class="k">O3 Back</label>
        <button type="button" [attr.aria-pressed]="d.back === 'step-out'" (click)="m.setDecision('back', 'step-out')">Step out</button>
        <button type="button" [attr.aria-pressed]="d.back === 'leave'" (click)="m.setDecision('back', 'leave')">Back = Leave</button>
      </div>
      <div class="row">
        <label class="k">O8 Dark fill</label>
        <button type="button" [attr.aria-pressed]="darkFill() === 'green'" (click)="darkFill.set('green')">#267A5A</button>
        <button type="button" [attr.aria-pressed]="darkFill() === 'mint'" (click)="darkFill.set('mint')">Mint</button>
      </div>
      <div class="row">
        <label class="k">O1 Password</label>
        <button type="button" [attr.aria-pressed]="d.passwordRooms" (click)="m.setDecision('passwordRooms', true)">Keep</button>
        <button type="button" [attr.aria-pressed]="!d.passwordRooms" (click)="m.setDecision('passwordRooms', false)">Cut</button>
      </div>
      <div class="row">
        <label class="k">O18 End</label>
        <button type="button" [attr.aria-pressed]="d.sessionEnd === 'home'" (click)="m.setDecision('sessionEnd', 'home')">Everyone Home</button>
        <button type="button" [attr.aria-pressed]="d.sessionEnd === 'in-place'" (click)="m.setDecision('sessionEnd', 'in-place')">"Ended" in place</button>
      </div>

      <h2>PEERS &amp; TRUST LAB</h2>
      <div class="row">
        <button type="button" [attr.aria-pressed]="m.state.peersAutoVote" (click)="m.setPeersAutoVote(!m.state.peersAutoVote)">Peers vote on their own</button>
        <button type="button" (click)="m.everyoneVotes()">Everyone votes now</button>
      </div>
      <div class="row">
        @for (p of m.present; track p.id) {
          @if (p.id !== m.state.selfId && p.role === 'voter') {
            <button type="button" (click)="m.peerVotes(p.id)">{{ p.name }} votes</button>
          }
        }
      </div>
      <div class="row">
        <button type="button" (click)="m.simulateReload('sam')">Sam reloads (UX-001)</button>
        <button type="button" (click)="m.simulateDoubleStart()">Second Start (UX-003)</button>
        <button type="button" (click)="m.simulatePeerBack('sam')">Sam presses Back (UX-002)</button>
        <button type="button" (click)="m.simulateHostOffline()">Host drops</button>
        <button type="button" (click)="m.simulateSelfOffline()">You go offline</button>
        <button type="button" (click)="m.simulateKick()">Host removes you</button>
      </div>
      <div class="log" aria-label="Event log">
        @for (e of m.state.lab; track $index) {
          <p>
            @if (e.ux) {
              <button type="button" class="tag" (click)="showTag(e.ux)">{{ e.ux }}</button>
            }
            {{ e.text }}
          </p>
        } @empty {
          <p>Events show up here.</p>
        }
      </div>

      <h2>COVERAGE · {{ coveredCount() }} / 109 REGISTER ENTRIES</h2>
      <div class="bar"><i [style.width.%]="(coveredCount() / 109) * 100"></i></div>
      <div class="row">
        @for (f of ['all', 'missing', 'shown', 'cli', 'note']; track f) {
          <button type="button" [attr.aria-pressed]="covFilter() === f" (click)="covFilter.set($any(f))">{{ f }}</button>
        }
        <input type="search" placeholder="UX-034, contrast…" [value]="covQuery()" (input)="covQuery.set($any($event.target).value)" style="flex: 1; min-width: 100px" />
      </div>
      @for (r of register(); track r.ux) {
        @let cov = coverageByUx().get(r.ux) ?? [];
        <div class="cov">
          <button type="button" class="t" (click)="showEntry(r)">
            <span class="sev" [class]="'sev ' + r.severity">{{ r.severity }}</span><span class="id">{{ r.ux }}</span>
            <a [href]="'https://github.com/IIxauII/hnch/issues/' + r.issue" target="_blank" rel="noopener" (click)="$event.stopPropagation()">#{{ r.issue }}</a>
            {{ r.title }}
            @for (c of cov; track $index) {
              <span class="kind">{{ c.kind }}</span>
            }
          </button>
          @for (c of cov; track $index) {
            <div class="how">{{ c.how }}</div>
            @if (c.try) {
              <div class="try">Try: {{ c.try }}</div>
            }
          } @empty {
            <div class="missing">Not covered yet</div>
          }
        </div>
      }
    </aside>

    <div class="proto-switcher" role="toolbar" aria-label="Prototype scenes">
      <button type="button" aria-label="Previous scene" (click)="go(sceneIndex() - 1)">←</button>
      <div class="lbl">
        <span class="n">{{ sceneIndex() + 1 }}/{{ scenes.length }}</span>{{ scene()?.label }}
        @if (scene()?.note) {
          <small>{{ scene()?.note }}</small>
        }
      </div>
      <button type="button" aria-label="Next scene" (click)="go(sceneIndex() + 1)">→</button>
      <button type="button" [attr.aria-label]="labOpen() ? 'Hide lab' : 'Show lab'" (click)="labOpen.set(!labOpen())">{{ labOpen() ? '⇥' : '⇤' }}</button>
    </div>
  `,
  styles: `
    .proto-643-host.ion-page,
    .proto-643-host {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: row;
      contain: none;
      background: #d9d9d4;
      font-family: system-ui, -apple-system, sans-serif;
      color: #1b1b1b;
      z-index: 10;
    }
    .proto-canvas {
      flex: 1;
      min-width: 0;
      overflow: auto;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 24px 24px 96px;
    }
    .proto-device {
      position: relative;
      flex: none;
      overflow: auto;
      container-type: inline-size;
      container-name: device;
      border-radius: 28px;
      box-shadow: 0 0 0 10px #111, 0 20px 60px rgb(0 0 0 / 0.35);
      transform-origin: top center;
    }
    .proto-device[data-kind='desktop'],
    .proto-device[data-kind='wide'] {
      border-radius: 10px;
      box-shadow: 0 0 0 1px #888, 0 20px 60px rgb(0 0 0 / 0.25);
    }
    .proto-lab {
      width: 380px;
      flex: none;
      overflow: auto;
      background: #fbfbf8;
      border-left: 1px solid #c8c8c2;
      font-size: 13px;
      line-height: 1.4;
      padding: 12px 14px 96px;
    }
    .proto-lab[hidden] {
      display: none;
    }
    .proto-lab h2 {
      font-size: 11px;
      letter-spacing: 0.04em;
      color: #6a6a64;
      margin: 18px 0 6px;
      font-weight: 700;
    }
    .proto-lab h1 {
      font-size: 15px;
      margin: 0 0 2px;
    }
    .proto-lab .sub {
      color: #6a6a64;
      margin: 0 0 8px;
    }
    .proto-lab .row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 6px;
      align-items: center;
    }
    .proto-lab button,
    .proto-lab select {
      font: inherit;
      border: 1px solid #b9b9b2;
      background: #fff;
      border-radius: 6px;
      padding: 3px 8px;
      cursor: pointer;
      color: inherit;
    }
    .proto-lab button[aria-pressed='true'] {
      background: #1b1b1b;
      color: #fff;
      border-color: #1b1b1b;
    }
    .proto-lab label.k {
      width: 92px;
      color: #6a6a64;
    }
    .proto-lab .log {
      max-height: 160px;
      overflow: auto;
      border: 1px solid #e0e0da;
      border-radius: 6px;
      padding: 4px 6px;
      background: #fff;
    }
    .proto-lab .log p {
      margin: 2px 0;
    }
    .proto-lab .tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      padding: 0 4px;
      border-radius: 4px;
      background: #e5007a;
      color: #fff;
      margin-right: 4px;
      cursor: pointer;
      border: 0;
    }
    .proto-lab .cov {
      border-top: 1px solid #ecece6;
      padding: 6px 0;
    }
    .proto-lab .cov button.t {
      all: unset;
      cursor: pointer;
      display: block;
      width: 100%;
    }
    .proto-lab .cov .id {
      font-weight: 700;
      margin-right: 4px;
    }
    .proto-lab .cov .how {
      color: #3c3c38;
      margin-top: 2px;
    }
    .proto-lab .cov .try {
      color: #6a6a64;
      font-style: italic;
    }
    .proto-lab .sev {
      font-size: 10px;
      font-weight: 700;
      border-radius: 4px;
      padding: 0 4px;
      margin-right: 4px;
    }
    .proto-lab .sev.critical {
      background: #b42318;
      color: #fff;
    }
    .proto-lab .sev.high {
      background: #8f5a00;
      color: #fff;
    }
    .proto-lab .sev.medium {
      background: #dcdcd6;
    }
    .proto-lab .sev.low {
      background: #eeeee9;
    }
    .proto-lab .kind {
      font-size: 10px;
      border: 1px solid #b9b9b2;
      border-radius: 4px;
      padding: 0 4px;
      margin-left: 4px;
    }
    .proto-lab .missing {
      color: #b42318;
      font-weight: 700;
    }
    .proto-lab .bar {
      height: 6px;
      background: #e0e0da;
      border-radius: 3px;
      overflow: hidden;
      margin: 4px 0 8px;
    }
    .proto-lab .bar > i {
      display: block;
      height: 100%;
      background: #16794a;
    }
    .proto-switcher {
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 6px;
      background: #111;
      color: #fff;
      border-radius: 999px;
      padding: 6px 8px;
      box-shadow: 0 8px 30px rgb(0 0 0 / 0.4);
      font: 600 13px/1.2 system-ui, sans-serif;
      max-width: calc(100vw - 32px);
    }
    .proto-switcher button {
      all: unset;
      cursor: pointer;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #2a2a2a;
    }
    .proto-switcher button:hover {
      background: #444;
    }
    .proto-switcher .lbl {
      padding: 0 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .proto-switcher .lbl small {
      display: block;
      font-weight: 400;
      opacity: 0.7;
      white-space: normal;
      max-width: 520px;
    }
    .proto-switcher .n {
      opacity: 0.6;
      font-weight: 400;
      margin-right: 6px;
    }
  `,
})
export class Prototype643Page {
  protected readonly store = inject(ProtoStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly device = viewChild<ElementRef<HTMLElement>>('device');
  private readonly canvas = viewChild<ElementRef<HTMLElement>>('canvas');

  protected readonly scenes = SCENES;
  protected readonly sceneIndex = signal(0);
  protected readonly scene = computed<Scene | undefined>(() => SCENES[this.sceneIndex()]);
  protected readonly frames = Object.entries(FRAME_SIZE) as [Frame, (typeof FRAME_SIZE)[Frame]][];
  protected readonly frameSize = computed(() => FRAME_SIZE[this.store.frame()]);
  protected readonly labOpen = signal(true);
  protected readonly zoom = signal(1);
  protected readonly darkFill = signal<'green' | 'mint'>('green');
  protected readonly covFilter = signal<CovFilter>('all');
  protected readonly covQuery = signal('');

  protected readonly groups = computed(() => {
    const out = new Map<string, { scene: Scene; i: number }[]>();
    SCENES.forEach((scene, i) => {
      const list = out.get(scene.group) ?? [];
      list.push({ scene, i });
      out.set(scene.group, list);
    });
    return [...out.entries()];
  });

  protected readonly coverageByUx = computed(() => {
    const map = new Map<string, CoverageEntry[]>();
    for (const c of COVERAGE) map.set(c.ux, [...(map.get(c.ux) ?? []), c]);
    return map;
  });
  protected readonly coveredCount = computed(
    () => REGISTER.filter((r) => this.coverageByUx().has(r.ux)).length,
  );
  protected readonly register = computed(() => {
    const f = this.covFilter();
    const q = this.covQuery().trim().toLowerCase();
    return REGISTER.filter((r) => {
      const cov = this.coverageByUx().get(r.ux) ?? [];
      if (f === 'missing' && cov.length) return false;
      if ((f === 'shown' || f === 'cli' || f === 'note') && !cov.some((c) => c.kind === f))
        return false;
      if (q && !`${r.ux} ${r.title} #${r.issue}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  constructor() {
    const qp = this.route.snapshot.queryParamMap;
    const frame = qp.get('frame') as Frame | null;
    const theme = qp.get('theme');
    const sceneId = qp.get('scene');
    const idx = Math.max(
      0,
      SCENES.findIndex((s) => s.id === sceneId),
    );
    if (theme === 'dark' || theme === 'light') this.store.theme.set(theme);
    if (qp.get('lab') === '0') this.labOpen.set(false);
    this.go(idx, false);
    if (frame && frame in FRAME_SIZE) this.store.frame.set(frame);
    document.title = 'hnch · #643 prototype';

    // keep the device zoomed to fit the canvas
    afterNextRender(() => {
      const ro = new ResizeObserver(() => this.fit());
      const c = this.canvas()?.nativeElement;
      if (c) ro.observe(c);
    });
    effect(() => {
      this.store.frame();
      this.labOpen();
      queueMicrotask(() => this.fit());
    });
    // outline the element(s) that answer the highlighted entry
    effect(() => {
      const ux = this.store.highlight();
      this.store.m();
      if (!ux) return;
      setTimeout(() => {
        const root = this.device()?.nativeElement;
        if (!root) return;
        root.querySelectorAll('.ux-hit').forEach((el) => el.classList.remove('ux-hit'));
        const hits = root.querySelectorAll(`[data-ux~="${ux}"]`);
        hits.forEach((el) => el.classList.add('ux-hit'));
        hits[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 350);
    });
  }

  protected go(i: number, syncUrl = true) {
    const n = SCENES.length;
    if (!n) return;
    const idx = ((i % n) + n) % n;
    this.sceneIndex.set(idx);
    const scene = SCENES[idx];
    if (!scene) return;
    applyScene(this.store, scene);
    if (syncUrl) this.syncUrl();
  }

  protected setFrame(f: Frame) {
    this.store.frame.set(f);
    this.syncUrl();
  }
  protected setTheme(t: 'light' | 'dark') {
    this.store.theme.set(t);
    this.syncUrl();
  }
  protected viewAs(id: string) {
    this.store.model.viewAs(id);
  }

  protected showEntry(r: RegisterEntry) {
    const cov = this.coverageByUx()
      .get(r.ux)
      ?.find((c) => c.scene);
    if (cov?.scene) {
      const i = SCENES.findIndex((s) => s.id === cov.scene);
      if (i >= 0) this.go(i);
    }
    this.store.highlight.set(null);
    queueMicrotask(() => this.store.highlight.set(r.ux));
  }
  protected showTag(ux: string) {
    this.store.highlight.set(null);
    queueMicrotask(() => this.store.highlight.set(ux));
  }

  protected severityOf(ux: string): string {
    return REGISTER.find((r) => r.ux === ux)?.severity ?? '';
  }

  private syncUrl() {
    void this.router.navigate([], {
      queryParams: {
        scene: this.scene()?.id,
        frame: this.store.frame(),
        theme: this.store.theme(),
      },
      replaceUrl: true,
    });
  }

  private fit() {
    const c = this.canvas()?.nativeElement;
    if (!c) return;
    const { w } = FRAME_SIZE[this.store.frame()];
    const avail = c.clientWidth - 48;
    this.zoom.set(Math.min(1, avail / (w + 20)));
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable]')) return;
    if (t && this.device()?.nativeElement.contains(t)) return; // arrows belong to the device (deck roving focus)
    e.preventDefault();
    this.go(this.sceneIndex() + (e.key === 'ArrowRight' ? 1 : -1));
  }
}
