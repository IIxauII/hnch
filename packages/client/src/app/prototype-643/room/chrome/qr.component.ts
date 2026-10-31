/**
 * PROTOTYPE (#643). A fake QR (not scannable): 25×25 modules, three finder
 * patterns and the 4-module quiet zone the real one needs (plan §3.3 #14).
 * Always dark modules on a light field, in both themes, capped at
 * min(60vh, 320px) so it is never clipped (UX-044).
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const N = 25;
const QUIET = 4;

function finder(x: number, y: number, r: number, c: number): boolean | undefined {
  const dx = c - x;
  const dy = r - y;
  if (dx < -1 || dy < -1 || dx > 7 || dy > 7) return undefined;
  if (dx === -1 || dy === -1 || dx === 7 || dy === 7) return false; // separator
  const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
  return ring !== 2;
}

@Component({
  selector: 'proto-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="qr"
      role="img"
      [attr.aria-label]="'QR code for ' + label()"
      [attr.viewBox]="'0 0 ' + size + ' ' + size"
      shape-rendering="crispEdges"
    >
      <rect class="bg" x="0" y="0" [attr.width]="size" [attr.height]="size" />
      @for (m of modules(); track $index) {
        <rect class="ink" [attr.x]="m.x" [attr.y]="m.y" width="1" height="1" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      --qr-bg: var(--hn-surface);
      --qr-ink: var(--hn-text);
    }
    :host-context([data-theme='dark']) {
      /* keep dark-on-light in dark mode: inverted QRs scan badly */
      --qr-bg: var(--hn-text);
      --qr-ink: var(--hn-bg);
    }
    .qr {
      display: block;
      width: min(60vh, 240px);
      max-width: 100%;
      aspect-ratio: 1;
      margin: 0 auto;
      border-radius: var(--hn-radius-sm);
    }
    .bg {
      fill: var(--qr-bg);
    }
    .ink {
      fill: var(--qr-ink);
    }
  `,
})
export class ProtoQrComponent {
  readonly seed = input.required<string>();
  readonly label = input('the invite link');
  protected readonly size = N + 2 * QUIET;

  protected readonly modules = computed(() => {
    let h = 2166136261;
    for (const ch of this.seed()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rnd = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return ((h >>> 0) % 1000) / 1000;
    };
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const f = finder(0, 0, r, c) ?? finder(N - 7, 0, r, c) ?? finder(0, N - 7, r, c);
        const timing = (r === 6 || c === 6) && f === undefined ? (r + c) % 2 === 0 : undefined;
        const on = f ?? timing ?? rnd() < 0.48;
        if (on) out.push({ x: c + QUIET, y: r + QUIET });
      }
    }
    return out;
  });
}
