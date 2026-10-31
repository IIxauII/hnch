/**
 * PROTOTYPE (#643). Cell-exact text helpers for the TUI frame: segments, widths,
 * truncation, the §5.8 glyph table with its ASCII fallback and the colour tokens.
 *
 * Every glyph used here measures 1 cell in Ink 5's own string-width 7.2.0
 * (checked at build time); `↔` measures 2 there, so it is drawn as `⇄` (R-49).
 */

/** §5.8 semantic terminal tokens. */
export type Tone = 'accent' | 'success' | 'neutral' | 'warning' | 'danger' | 'muted';

export interface Seg {
  t: string;
  tone?: Tone | undefined;
  bold?: boolean | undefined;
  inverse?: boolean | undefined;
}
export type Line = Seg[];

export interface TextMode {
  ascii: boolean;
}

/** §5.8 glyph table. */
const GLYPHS = {
  live: ['●', '*'],
  wait: ['○', 'o'],
  reconnecting: ['◌', '~'],
  offline: ['✗', 'x'],
  ok: ['✓', '+'],
  close: ['≈', '~='],
  split: ['⇄', '<>'],
  none: ['–', '-'],
  sel: ['▸', '>'],
  up: ['▲', '^'],
  bar: ['█', '#'],
  rule: ['─', '-'],
  enter: ['⏎', 'enter'],
  ell: ['…', '~'],
  tick: ['▰', '='],
  untick: ['▱', '.'],
} as const;
export type GlyphName = keyof typeof GLYPHS;

export function glyph(name: GlyphName, m: TextMode): string {
  return GLYPHS[name][m.ascii ? 1 : 0];
}

/** Model copy carries ✓ ≈ ↔ – …; map them for this terminal. */
export function term(s: string, m: TextMode): string {
  let out = s.replaceAll('↔', '⇄');
  if (!m.ascii) return out;
  const map: Record<string, string> = {
    '✓': '+',
    '≈': '~=',
    '⇄': '<>',
    '–': '-',
    '—': '-',
    '…': '...',
    '●': '*',
    '○': 'o',
    '◌': '~',
    '✗': 'x',
    '▸': '>',
    '◂': '<',
    '▲': '^',
    '⏎': 'enter',
    '←': '<-',
    '→': '->',
    '↑': 'up',
    '↓': 'down',
    '⌫': 'bksp',
    '½': '1/2',
  };
  out = Array.from(out)
    .map((c) => map[c] ?? c)
    .join('');
  return out;
}

/** Cell width. All glyphs we draw are 1 cell (see header). */
export function cw(s: string): number {
  return Array.from(s).length;
}

export function trunc(s: string, n: number, m: TextMode): string {
  if (n <= 0) return '';
  if (cw(s) <= n) return s;
  const ell = glyph('ell', m);
  const chars = Array.from(s);
  if (n <= cw(ell)) return chars.slice(0, n).join('');
  return chars.slice(0, n - cw(ell)).join('') + ell;
}

export function padEnd(s: string, n: number): string {
  const w = cw(s);
  return w >= n ? s : s + ' '.repeat(n - w);
}
export function padStart(s: string, n: number): string {
  const w = cw(s);
  return w >= n ? s : ' '.repeat(n - w) + s;
}

export function lineWidth(l: Line): number {
  return l.reduce((a, s) => a + cw(s.t), 0);
}

/** Truncate (with …) and pad a line to exactly `w` cells. Never wraps. */
export function fit(l: Line, w: number, m: TextMode): Line {
  const out: Line = [];
  let used = 0;
  for (const s of l) {
    const sw = cw(s.t);
    if (used + sw <= w) {
      out.push(s);
      used += sw;
      continue;
    }
    const room = w - used;
    if (room > 0) out.push({ ...s, t: trunc(s.t, room, m) });
    used = w;
    break;
  }
  if (used < w) out.push({ t: ' '.repeat(w - used) });
  return out;
}

/** Left and right parts on one row; the left side gives way first. */
export function lr(left: Line, right: Line, w: number, m: TextMode): Line {
  const rw = lineWidth(right);
  if (rw >= w) return fit(right, w, m);
  const lw = Math.max(0, w - rw - 1);
  return [...fit(left, lw, m), { t: ' ' }, ...right];
}

export function blank(w: number): Line {
  return [{ t: ' '.repeat(w) }];
}

export function rule(w: number, m: TextMode): Line {
  return [{ t: glyph('rule', m).repeat(w), tone: 'muted' }];
}

/** Side by side: `a` (width aw) + gap + `b` (width bw), row count = max. */
export function hcat(a: Line[], aw: number, b: Line[], bw: number, m: TextMode, sep?: Seg): Line[] {
  const n = Math.max(a.length, b.length);
  const out: Line[] = [];
  for (let i = 0; i < n; i++) {
    out.push([...fit(a[i] ?? [], aw, m), sep ?? { t: ' ' }, ...fit(b[i] ?? [], bw, m)]);
  }
  return out;
}

/** Exactly `h` rows (cut or padded with blanks). */
export function rows(ls: Line[], h: number, w: number): Line[] {
  const out = ls.slice(0, h);
  while (out.length < h) out.push(blank(w));
  return out;
}

/** A bordered box, `w` wide, `h` tall, with a title in the top border. */
export function box(title: string, body: Line[], w: number, h: number, m: TextMode): Line[] {
  const [tl, tr, bl, br, hz, vt] = m.ascii
    ? ['+', '+', '+', '+', '-', '|']
    : ['┌', '┐', '└', '┘', '─', '│'];
  const inner = w - 4;
  const head = `${tl}${hz} ${title} `;
  const top: Line = [
    { t: head, tone: 'muted' },
    { t: hz.repeat(Math.max(0, w - cw(head) - 1)) + tr, tone: 'muted' },
  ];
  const out: Line[] = [top];
  const content = rows(body, h - 2, inner);
  for (const l of content)
    out.push([{ t: `${vt} `, tone: 'muted' }, ...fit(l, inner, m), { t: ` ${vt}`, tone: 'muted' }]);
  out.push([{ t: bl + hz.repeat(w - 2) + br, tone: 'muted' }]);
  return out;
}

/**
 * Stopwatch at minute granularity: on Ink 5 a per-second clock repaints the whole
 * frame every second (R-47 fallback, UX-095), so the cell changes once a minute.
 */
export function minutes(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  return m < 1 ? '<1 min' : `${m} min`;
}
