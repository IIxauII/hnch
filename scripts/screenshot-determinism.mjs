#!/usr/bin/env node
// Captures the screenshot suite twice on the current tree and compares the two
// sets by bytes (#762). Exit 0: every scene came out identical, so a diff
// against another set shows only real changes. Exit 1: some scene differs;
// the scenes are listed, and both sets stay on disk to look at.
//
//   pnpm screenshots:determinism [playwright args…]
//
// Each run is the CI command, `CI=1 SCREENSHOT_CAPTURE=1 pnpm --filter
// @hnch/e2e test`: app tests and capture together at min(4, CPUs) workers,
// each against a fresh relay. Extra arguments go to Playwright, e.g.
// `_screenshots` to capture without the app tests, or one spec file.
//
// Sets land in docs/screenshots/determinism-{a,b}/ (gitignored).
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, env, exit, stdout } from 'node:process';
import { diffSets } from './ci/screenshot-diff.mjs';

const root = resolve(import.meta.dirname, '..');
const sets = ['determinism-a', 'determinism-b'];

// The relay and client consume @hnch/shared's build, as in `pnpm test:e2e`.
if (spawnSync('pnpm', ['run', '_build:shared'], { cwd: root, stdio: 'inherit' }).status !== 0) {
  exit(2);
}

for (const set of sets) {
  const dir = join(root, 'docs/screenshots', set);
  rmSync(dir, { recursive: true, force: true });
  stdout.write(`\n▶ capture into docs/screenshots/${set}/\n`);
  // The e2e `test` script, spelled out: its `--project chromium` would read a
  // following path as a second project name.
  const playwright = ['exec', 'playwright', 'test', '--project=chromium', ...argv.slice(2)];
  const run = spawnSync('pnpm', ['--filter', '@hnch/e2e', ...playwright], {
    cwd: root,
    stdio: 'inherit',
    env: { ...env, CI: '1', SCREENSHOT_CAPTURE: '1', SCREENSHOT_SHA: set },
  });
  if (run.status !== 0) {
    stdout.write(`\nscreenshot-determinism: the ${set} run failed (exit ${run.status}).\n`);
    exit(2);
  }
}

const [a, b] = sets.map((set) => join(root, 'docs/screenshots', set));
const { changed, added, removed, unchanged } = diffSets(a, b);
for (const name of changed) stdout.write(`changed\t${name}\n`);
for (const name of added) stdout.write(`only in b\t${name}\n`);
for (const name of removed) stdout.write(`only in a\t${name}\n`);
const differing = changed.length + added.length + removed.length;
stdout.write(
  `\n${unchanged} identical, ${differing} differing (docs/screenshots/${sets[0]}/ vs ${sets[1]}/)\n`,
);
exit(differing === 0 && unchanged > 0 ? 0 : 1);
