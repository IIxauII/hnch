#!/usr/bin/env node
// Compares two screenshot sets (docs/screenshots/<set>/) by the bytes of each
// PNG: the exact-bytes standard decided in #595 (no tolerance, no masks).
//
//   node scripts/ci/screenshot-diff.mjs <base-dir> <head-dir>
//
// Prints the changed, added and removed scenes and exits 0 when the two sets
// are identical, 1 when they differ, 2 on a usage error. Two captures of one
// tree must exit 0 (#762); `pnpm screenshots:determinism` runs that check.
//
// Pure Node, no dependencies: CI jobs that compare sets have no node_modules.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

/** Every PNG under `dir`, by its path relative to `dir` (always `/`-separated), to its SHA-256. */
export function hashSet(dir) {
  const hashes = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith('.png')) {
        const name = relative(dir, path).split(sep).join('/');
        hashes.set(name, createHash('sha256').update(readFileSync(path)).digest('hex'));
      }
    }
  };
  walk(dir);
  return hashes;
}

/**
 * What changed from the set in `baseDir` to the set in `headDir`. Scene names
 * are sorted; `unchanged` counts scenes whose bytes match.
 */
export function diffSets(baseDir, headDir) {
  const base = hashSet(baseDir);
  const head = hashSet(headDir);
  const changed = [];
  const added = [];
  let unchanged = 0;
  for (const [name, hash] of head) {
    if (!base.has(name)) added.push(name);
    else if (base.get(name) === hash) unchanged++;
    else changed.push(name);
  }
  const removed = [...base.keys()].filter((name) => !head.has(name));
  return {
    changed: changed.toSorted(),
    added: added.toSorted(),
    removed: removed.toSorted(),
    unchanged,
  };
}

/** True when no scene changed, appeared or went. */
export function isIdentical({ changed, added, removed }) {
  return changed.length + added.length + removed.length === 0;
}

/** One `<changed|added|removed>\t<scene>` line per differing scene, then the counts. */
export function formatDiff({ changed, added, removed, unchanged }) {
  const lines = [
    ...changed.map((name) => `changed\t${name}`),
    ...added.map((name) => `added\t${name}`),
    ...removed.map((name) => `removed\t${name}`),
    `${unchanged} unchanged, ${changed.length} changed, ${added.length} added, ${removed.length} removed`,
  ];
  return `${lines.join('\n')}\n`;
}

function main([baseDir, headDir, ...rest]) {
  if (!baseDir || !headDir || rest.length > 0) {
    stderr.write('usage: screenshot-diff.mjs <base-dir> <head-dir>\n');
    return 2;
  }
  for (const dir of [baseDir, headDir]) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      stderr.write(`screenshot-diff: ${dir} is not a directory\n`);
      return 2;
    }
  }
  const diff = diffSets(baseDir, headDir);
  stdout.write(formatDiff(diff));
  return isIdentical(diff) ? 0 : 1;
}

if (argv[1] === fileURLToPath(import.meta.url)) exit(main(argv.slice(2)));
