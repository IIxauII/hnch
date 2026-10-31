#!/usr/bin/env node
// Create a new git worktree and bootstrap it.
//
// Usage:
//   pnpm worktree:add <name> [base-branch] [--tags "<grep>"]
//
// Resolves dir = ../hnch-<name>, creates branch <name> off <base-branch> (default
// `main`), runs scripts/worktree-bootstrap.sh inside the new worktree.
//
// --tags "<grep>": writes the Playwright `--grep` regex (e.g. "@viewer|@participants")
// to `<worktree>/.screenshot-tags`, which narrows the pre-push screenshot capture
// (scripts/screenshot-publish.mjs). Without the flag the full suite runs. The file
// can also be hand-written later; see packages/e2e/README.md → Tag catalog.

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const here = import.meta.dirname;
const repoRoot = resolve(here, '..');

const USAGE = 'Usage: pnpm worktree:add <name> [base-branch] [--tags "<grep>"]';

const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0) {
  console.error(USAGE);
  process.exit(1);
}

let tagsRegex = null;
const positional = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === '--tags') {
    tagsRegex = rawArgs[++i];
    if (tagsRegex === undefined) {
      console.error('✗ --tags requires a grep argument, e.g. --tags "@viewer|@participants"');
      process.exit(1);
    }
  } else if (a.startsWith('--tags=')) {
    tagsRegex = a.slice('--tags='.length);
  } else if (a.startsWith('--')) {
    console.error(`✗ Unknown flag: ${a}`);
    console.error(USAGE);
    process.exit(1);
  } else {
    positional.push(a);
  }
}

const name = positional[0];
const baseBranch = positional[1] ?? 'main';

if (!name) {
  console.error(USAGE);
  process.exit(1);
}

if (!/^[a-zA-Z0-9._/-]+$/.test(name)) {
  console.error(
    `✗ Invalid worktree name: "${name}". Allowed: letters, digits, dot, underscore, slash, dash.`,
  );
  process.exit(1);
}

if (name.includes('..') || name.startsWith('/') || name.startsWith('-')) {
  console.error(
    `✗ Invalid worktree name: "${name}". Cannot contain '..' or start with '/' or '-'.`,
  );
  process.exit(1);
}

if (tagsRegex !== null) {
  tagsRegex = tagsRegex.trim();
  if (tagsRegex === '' || /[\r\n]/.test(tagsRegex)) {
    console.error('✗ --tags must be a single non-empty line, e.g. --tags "@viewer|@participants"');
    process.exit(1);
  }
}

const repoName = basename(repoRoot);
const worktreeDir = resolve(repoRoot, '..', `${repoName}-${name.replaceAll(/\//g, '-')}`);

if (existsSync(worktreeDir)) {
  console.error(`✗ Target dir already exists: ${worktreeDir}`);
  process.exit(1);
}

console.log(`→ Creating worktree:`);
console.log(`    name:        ${name}`);
console.log(`    base branch: ${baseBranch}`);
console.log(`    path:        ${worktreeDir}`);
if (tagsRegex) {
  console.log(`    tags:        ${tagsRegex}`);
}

const addResult = spawnSync('git', ['worktree', 'add', '-b', name, worktreeDir, baseBranch], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (addResult.status !== 0) {
  console.error('✗ git worktree add failed');
  process.exit(addResult.status ?? 1);
}

const bootstrapResult = spawnSync('bash', [resolve(repoRoot, 'scripts/worktree-bootstrap.sh')], {
  cwd: worktreeDir,
  stdio: 'inherit',
});

if (bootstrapResult.status !== 0) {
  console.error('✗ Bootstrap failed. Worktree was created at:', worktreeDir);
  console.error('  Fix the issue and rerun: cd', worktreeDir, '&& pnpm worktree:bootstrap');
  process.exit(bootstrapResult.status ?? 1);
}

if (tagsRegex) {
  writeFileSync(resolve(worktreeDir, '.screenshot-tags'), `${tagsRegex}\n`);
  console.log(`→ Wrote .screenshot-tags: ${tagsRegex}`);
}

console.log('');
console.log(`✓ Worktree ready. Open: cd ${worktreeDir}`);
