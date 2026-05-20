/**
 * Shared resolver for screenshot output directories.
 *
 * Every spec under packages/e2e/tests/_screenshots/*.spec.ts routes its
 * OUT_DIR through this helper. Layout is always:
 *
 *   docs/screenshots/<sha>/<feature>/<name>.png
 *
 * `<sha>` comes from SCREENSHOT_SHA env (set by scripts/screenshot-publish.mjs)
 * or defaults to 'local' for ad-hoc runs.
 *
 * `<feature>` is the spec's primary @tag, chosen by the spec author from
 * packages/e2e/README.md → Tag catalog.
 *
 * mkdir -p is a side effect of CALLING this function — never at module import.
 * The helper is not a Playwright test file (no .spec.ts suffix) so the default
 * testMatch glob does not pick it up.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');

export function resolveOutDir(feature: string): string {
  if (!feature || !/^[a-z0-9][a-z0-9-]*$/.test(feature)) {
    throw new Error(
      `resolveOutDir: invalid feature slug ${JSON.stringify(feature)} — must match /^[a-z0-9][a-z0-9-]*$/`,
    );
  }
  const sha = process.env['SCREENSHOT_SHA'] ?? 'local';
  const dir = path.resolve(REPO_ROOT, 'docs/screenshots', sha, feature);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
