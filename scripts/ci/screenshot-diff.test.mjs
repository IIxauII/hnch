// Tests for scripts/ci/screenshot-diff.mjs. node:test, not vitest: CI jobs
// that compare sets run it with no node_modules. Run locally with
// `pnpm test:ci-scripts`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { after, describe, it } from 'node:test';
import { diffSets } from './screenshot-diff.mjs';

const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A capture set on disk: `{ 'baseline/01-home.png': 'bytes' }`. */
function set(files) {
  const dir = mkdtempSync(join(tmpdir(), 'screenshot-set-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe('diffSets', () => {
  it('reports nothing for two sets with the same bytes', () => {
    const files = { 'baseline/01-home.png': 'a', 'reveal/02-lobby.png': 'b' };
    assert.deepEqual(diffSets(set(files), set(files)), {
      changed: [],
      added: [],
      removed: [],
      unchanged: 2,
    });
  });

  it('sorts each differing scene into changed, added or removed', () => {
    const base = set({
      'baseline/01-home.png': 'a',
      'baseline/06-lobby.png': 'code GKU-2JH',
      'skip/gone.png': 'c',
    });
    const head = set({
      'baseline/01-home.png': 'a',
      'baseline/06-lobby.png': 'code EX3-VYM',
      'agenda/new.png': 'd',
    });
    assert.deepEqual(diffSets(base, head), {
      changed: ['baseline/06-lobby.png'],
      added: ['agenda/new.png'],
      removed: ['skip/gone.png'],
      unchanged: 1,
    });
  });

  it('compares PNGs only', () => {
    const base = set({ 'a.png': 'a', 'trace.zip': 'x', 'latest.json': '{}' });
    const head = set({ 'a.png': 'a' });
    assert.deepEqual(diffSets(base, head).removed, []);
  });
});

describe('screenshot-diff.mjs <base> <head>', () => {
  const script = join(import.meta.dirname, 'screenshot-diff.mjs');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  it('exits 0 for identical sets', () => {
    const files = { 'baseline/01-home.png': 'a' };
    const res = run(set(files), set(files));
    assert.equal(res.status, 0);
    assert.match(res.stdout, /1 unchanged, 0 changed, 0 added, 0 removed/);
  });

  it('exits 1 and names each differing scene', () => {
    const res = run(set({ 'x/a.png': 'a', 'x/b.png': 'b' }), set({ 'x/a.png': 'A' }));
    assert.equal(res.status, 1);
    assert.match(res.stdout, /^changed\tx\/a\.png$/m);
    assert.match(res.stdout, /^removed\tx\/b\.png$/m);
  });

  it('exits 2 when a directory is missing', () => {
    assert.equal(run(set({}), join(tmpdir(), 'no-such-screenshot-set')).status, 2);
    assert.equal(run(set({})).status, 2);
  });
});
