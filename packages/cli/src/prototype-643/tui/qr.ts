/**
 * PROTOTYPE (#643). The invite QR as half-block rows (§5.9: version 3, 31×16
 * cells with a 1-module margin). The repo already depends on `qrcode` in
 * packages/client, so the prototype borrows it from there; if that fails it
 * draws a clearly labelled placeholder of the same size.
 */
import { createRequire } from 'node:module';

interface QrModules {
  size: number;
  get(row: number, col: number): number | boolean;
}
interface QrLib {
  create(
    text: string,
    opts: { errorCorrectionLevel: string; version?: number },
  ): {
    modules: QrModules;
  };
}

let lib: QrLib | null | undefined;
function load(): QrLib | null {
  if (lib !== undefined) return lib;
  try {
    const req = createRequire(new URL('../../../../client/package.json', import.meta.url));
    lib = req('qrcode') as QrLib;
  } catch {
    lib = null;
  }
  return lib;
}

export interface Qr {
  rows: string[];
  real: boolean;
}

/**
 * Light modules are drawn filled, so the code scans on dark terminal themes
 * (the common case; §5.9 notes polarity under NO_COLOR is right only on dark).
 */
export function qrRows(text: string): Qr {
  const q = load();
  if (q) {
    try {
      let modules: QrModules;
      try {
        modules = q.create(text, { errorCorrectionLevel: 'L', version: 3 }).modules;
      } catch {
        modules = q.create(text, { errorCorrectionLevel: 'L' }).modules;
      }
      const n = modules.size + 2; // 1-module margin
      const dark = (r: number, c: number) =>
        r >= 1 && c >= 1 && r <= modules.size && c <= modules.size && !!modules.get(r - 1, c - 1);
      const out: string[] = [];
      for (let r = 0; r < n; r += 2) {
        let line = '';
        for (let c = 0; c < n; c++) {
          const top = !dark(r, c);
          const bot = r + 1 < n ? !dark(r + 1, c) : false;
          line += top && bot ? '█' : top ? '▀' : bot ? '▄' : ' ';
        }
        out.push(line);
      }
      return { rows: out, real: true };
    } catch {
      // fall through to the placeholder
    }
  }
  const w = 31;
  const out: string[] = [];
  for (let r = 0; r < 16; r++) {
    if (r === 0) out.push('┌' + '─'.repeat(w - 2) + '┐');
    else if (r === 15) out.push('└' + '─'.repeat(w - 2) + '┘');
    else if (r === 7) out.push('│' + ' QR placeholder (31×16)'.padEnd(w - 2) + '│');
    else if (r === 8) out.push('│' + ' no qrcode dep found'.padEnd(w - 2) + '│');
    else out.push('│' + ' '.repeat(w - 2) + '│');
  }
  return { rows: out, real: false };
}
