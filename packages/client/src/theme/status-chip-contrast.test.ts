// Exercises: theme/variables.scss, theme/_ionic-overrides.scss (status chips)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { blend, contrastRatio } from '../app/core/accent.service';

/**
 * A status chip is a label in `--hnch-<status>-text` on the status color at
 * a fraction of its strength, over the page or a card. The label tokens are
 * picked by hand. Whoever changes one, a fill or a tint finds out here.
 */

// By where this file is, not by where the tests were started from. As text:
// the URL of the test environment is not the one Node knows.
const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');

const variables = read('./variables.scss');
const overrides = read('./_ionic-overrides.scss');

/**
 * A little over AA (4.5:1), like the accent label: the browser composites
 * the tint and rounds every channel its own way.
 */
const TARGET = 4.6;
const STATUSES = ['success', 'warning', 'danger'] as const;
const MODES = ['light', 'dark'] as const;

/** Both values of a color token: light first, dark second. */
function token(name: string): Record<(typeof MODES)[number], string> {
  const found = [...variables.matchAll(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`, 'gu'))].map(
    (m) => m[1]!,
  );
  expect(found, name).toHaveLength(2);
  return { light: found[0]!, dark: found[1]! };
}

/** How strongly the chip of `status` is tinted with its color. */
function tintOf(status: string): number {
  const rule = new RegExp(
    `ion-chip\\.ion-color-${status}\\s*\\{[^}]*background:\\s*rgba\\(var\\(--ion-color-${status}-rgb\\),\\s*([0-9.]+)\\)`,
    'u',
  ).exec(overrides);
  expect(rule, `the chip rule for ${status}`).not.toBeNull();
  return Number(rule![1]);
}

describe('status chips', () => {
  for (const status of STATUSES) {
    for (const mode of MODES) {
      it(`${status}: the label is readable on its chip, ${mode}`, () => {
        const label = token(`--hnch-${status}-text`)[mode];
        const fill = token(`--ion-color-${status}`)[mode];
        const tint = tintOf(status);

        for (const surface of ['--hnch-bg', '--hnch-elev-1']) {
          const chip = blend(fill, token(surface)[mode], tint);
          expect(
            contrastRatio(label, chip),
            `${label} on ${chip} (${surface})`,
          ).toBeGreaterThanOrEqual(TARGET);
        }
      });

      it(`${status}: the label is readable on a plain surface, ${mode}`, () => {
        const label = token(`--hnch-${status}-text`)[mode];

        for (const surface of ['--hnch-bg', '--hnch-elev-1', '--hnch-elev-2']) {
          expect(
            contrastRatio(label, token(surface)[mode]),
            `${label} on ${surface}`,
          ).toBeGreaterThanOrEqual(TARGET);
        }
      });
    }
  }

  it('reads a tint for every status', () => {
    for (const status of STATUSES) {
      expect(tintOf(status)).toBeGreaterThan(0);
      expect(tintOf(status)).toBeLessThan(0.5);
    }
  });
});
