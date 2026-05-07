/**
 * Vitest global setup for the client package.
 *
 * Ensures @hnch/shared dist/ is present before tests run. The client
 * resolves @hnch/shared via its compiled dist; if the dist is absent
 * (e.g. a fresh clone that hasn't run `pnpm build` in packages/shared),
 * Vite cannot resolve the package entry point and every test file that
 * imports @hnch/shared fails with "Failed to resolve entry for package".
 *
 * This global setup runs once in the main thread before any test workers
 * start, so the dist is available to all parallel workers without each
 * worker rebuilding it.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sharedDir = resolve(import.meta.filename, '../../../shared');
const distIndex = resolve(sharedDir, 'dist/index.js');

export function setup(): void {
  if (!existsSync(distIndex)) {
    console.log('[vitest] @hnch/shared dist not found — building...');
    execSync('pnpm build', { cwd: sharedDir, stdio: 'inherit' });
    console.log('[vitest] @hnch/shared build complete.');
  }
}
