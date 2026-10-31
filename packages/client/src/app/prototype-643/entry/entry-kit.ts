/**
 * PROTOTYPE (#643), throwaway. Shared bits for Home, Join and the System sheet:
 * a fake room directory (no network), the invite parser, the WCAG contrast
 * formula, and the one "enter the Room" helper every entry path uses.
 */
import type { ProtoStore } from '../proto-store';
import type { FixtureName } from '../room-model';

// ── fake room directory (what `GET /rooms/:code` + a read-only preview sync would tell us) ──

export interface FakeRoom {
  code: string; // 'K7P9MR'
  name: string;
  here: number;
  host: string;
  password: boolean;
  status: 'live' | 'ended' | 'expired';
  lastSeen: string;
}

export const FAKE_ROOMS: FakeRoom[] = [
  {
    code: 'K7P9MR',
    name: 'Sprint 42',
    here: 5,
    host: 'Hana',
    password: false,
    status: 'live',
    lastSeen: '12 min ago',
  },
  {
    code: 'B4Q7XT',
    name: 'Team Kiwi',
    here: 3,
    host: 'Hana',
    password: true,
    status: 'live',
    lastSeen: '1 h ago',
  },
  {
    code: 'M3D8QA',
    name: 'Design crit',
    here: 0,
    host: 'Hana',
    password: false,
    status: 'ended',
    lastSeen: 'yesterday',
  },
  {
    code: 'Z9R2KT',
    name: 'Spike review',
    here: 0,
    host: 'Dev',
    password: false,
    status: 'expired',
    lastSeen: '3 days ago',
  },
];

/** The password the prototype accepts for Team Kiwi. */
export const KIWI_PASSWORD = 'kiwi';

export function roomFor(code: string): FakeRoom {
  const c = code.replace(/-/gu, '').toUpperCase();
  return (
    FAKE_ROOMS.find((r) => r.code === c) ?? {
      code: c,
      name: `Room ${formatCode(c)}`,
      here: 3,
      host: 'Hana',
      password: false,
      status: 'live',
      lastSeen: 'just now',
    }
  );
}

/** Always show codes as XXX-XXX (UX-028). */
export function formatCode(raw: string): string {
  const c = raw.replace(/[^A-Za-z0-9]/gu, '').toUpperCase();
  return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3, 6)}` : c;
}

/** Code or invite link → up to 6 code characters (parseInviteContent, ADR-0026's liberal accept). */
export function parseInvite(raw: string): string {
  const t = raw.trim();
  const q = /[?&]code=([A-Za-z0-9-]+)/u.exec(t);
  let s = q?.[1] ?? t;
  if (!q && /^(https?:)?\/\//iu.test(t)) s = t.split(/[/?#]/u).findLast((x) => x.length > 0) ?? '';
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, '')
    .slice(0, 6);
}

// ── knobs ──

export function knob(store: ProtoStore, key: string): string {
  const v = store.entry()[key];
  return v === undefined || v === false ? '' : String(v);
}
export function knobOn(store: ProtoStore, key: string): boolean {
  const v = store.entry()[key];
  return v === true || v === 'true' || (typeof v === 'number' && v > 0);
}

// ── entering the Room ──

const CANONICAL: Record<string, string> = {
  hana: 'hana',
  ana: 'ana',
  sam: 'sam',
  bob: 'bob',
  dev: 'dev',
  eve: 'eve',
};

export interface EnterOptions {
  code: string;
  fixture: FixtureName;
  /** 'host' = Hana; otherwise the canonical person whose name matches, else late joiner Kai. */
  role: 'host' | 'joiner';
  name?: string | undefined;
  watching?: boolean | undefined;
  notice?: string | undefined;
  roomName?: string | undefined;
}

export function enterRoom(store: ProtoStore, o: EnterOptions) {
  const room = roomFor(o.code);
  const typed = (o.name ?? '').trim();
  const match = CANONICAL[typed.toLowerCase()];
  if (o.role === 'host') {
    store.load(o.fixture, 'hana');
  } else if (match && match !== 'hana') {
    store.load(o.fixture, match);
  } else {
    store.load(o.fixture, 'hana');
    store.model.viewAs('kai');
  }
  const m = store.model;
  if (typed && (!match || o.role === 'host')) m.renameSelf(typed);
  m.state.name = o.roomName ?? room.name;
  m.state.code = formatCode(room.code);
  m.state.password = room.password;
  if (o.watching) m.setRole('viewer');
  if (o.notice) m.notify(o.notice, 'success');
  store.bump();
  store.screen.set('room');
}

// ── WCAG 2.x contrast, measured from whatever the browser resolves ──

let ctx: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour string → [r, g, b] 0–255, via a 1×1 canvas (works for hex, rgb, oklch). */
export function toRgb(css: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/iu.exec(css.trim());
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  if (typeof document === 'undefined') return null;
  if (ctx === undefined) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    ctx = c.getContext('2d', { willReadFrequently: true });
  }
  if (!ctx || !css.trim()) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = css.trim();
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(rgb: [number, number, number]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** Contrast ratio of two CSS colours, 2 decimals; NaN when unresolvable. */
export function contrast(a: string, b: string): number {
  const x = toRgb(a);
  const y = toRgb(b);
  if (!x || !y) return Number.NaN;
  const la = luminance(x);
  const lb = luminance(y);
  const r = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  return Math.round(r * 100) / 100;
}

/** Shared column styles for Home and Join: one content column, one left edge (UX-065). */
export const ENTRY_STYLES = `
  :host {
    display: block;
    min-height: 100%;
    background: var(--hn-bg);
    color: var(--hn-text);
  }
  .entry {
    display: flex;
    flex-direction: column;
    gap: var(--hn-space-4);
    max-width: var(--hn-dialog-w);
    margin: 0 auto;
    padding: var(--hn-space-4) var(--hn-space-4) var(--hn-space-7);
  }
  @container device (min-width: 600px) {
    .entry {
      padding-top: var(--hn-space-7);
    }
  }
  .brand-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--hn-tap);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--hn-space-2);
    font: var(--hn-type-title);
    color: var(--hn-text);
    margin: 0;
  }
  .brand .mark {
    width: 14px;
    height: 14px;
    border-radius: var(--hn-radius-pill);
    background: var(--hn-accent);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--hn-space-1);
  }
  label,
  .label {
    font: var(--hn-type-label);
    color: var(--hn-text);
  }
  input[type='text'],
  input[type='password'],
  input:not([type]) {
    min-height: var(--hn-tap);
    padding: 0 var(--hn-space-3);
    border-radius: var(--hn-radius-sm);
    border: 1px solid var(--hn-line-strong);
    background: var(--hn-surface);
    color: var(--hn-text);
    font: var(--hn-type-body);
    width: 100%;
  }
  input[aria-invalid='true'] {
    border-color: var(--hn-danger);
  }
  .hint {
    margin: 0;
    font: var(--hn-type-small);
    color: var(--hn-text-3);
  }
  .err {
    display: flex;
    align-items: center;
    gap: var(--hn-space-1);
    margin: 0;
    font: var(--hn-type-small);
    color: var(--hn-danger);
  }
  .switch-row {
    display: flex;
    align-items: center;
    gap: var(--hn-space-3);
    min-height: var(--hn-tap);
    font: var(--hn-type-body);
    cursor: pointer;
  }
  .switch-row input {
    appearance: none;
    flex: none;
    width: 40px;
    height: 24px;
    margin: 0;
    border-radius: var(--hn-radius-pill);
    background: var(--hn-surface-2);
    border: 1px solid var(--hn-line-strong);
    position: relative;
    cursor: pointer;
    transition: background-color var(--hn-dur-state) var(--hn-ease-std);
  }
  .switch-row input::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: var(--hn-radius-pill);
    background: var(--hn-text-3);
    transition: transform var(--hn-dur-state) var(--hn-ease-std);
  }
  .switch-row input:checked {
    background: var(--hn-accent);
    border-color: var(--hn-accent);
  }
  .switch-row input:checked::after {
    transform: translateX(16px);
    background: var(--hn-on-accent);
  }
  .spinner {
    width: 16px;
    height: 16px;
    border-radius: var(--hn-radius-pill);
    border: 2px solid currentColor;
    border-right-color: transparent;
    animation: hn-spin 800ms linear infinite;
  }
  @keyframes hn-spin {
    to {
      transform: rotate(360deg);
    }
  }
  ion-icon {
    font-size: 20px;
    flex: none;
  }
`;
