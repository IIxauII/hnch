#!/usr/bin/env node
// Create a new git worktree and bootstrap it.
//
// Usage:
//   pnpm worktree:add <name> [base-branch] [--plan <slug>]
//
// Resolves dir = ../hnch-<name>, creates branch <name> off <base-branch> (default
// `main`), runs scripts/worktree-bootstrap.sh inside the new worktree.
//
// --plan <slug>: reads `docs/plans/<slug>.md`, parses the first inline code span
// under `## Screenshot tags`, and writes the regex to `<worktree>/.screenshot-tags`.
// Auto-detected when `docs/plans/<name>.md` exists and --plan was omitted.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const here = import.meta.dirname;
const repoRoot = resolve(here, '..');

const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0) {
  console.error('Usage: pnpm worktree:add <name> [base-branch] [--plan <slug>]');
  process.exit(1);
}

let planSlug = null;
const positional = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === '--plan') {
    planSlug = rawArgs[++i];
    if (!planSlug) {
      console.error('✗ --plan requires a slug argument');
      process.exit(1);
    }
  } else if (a.startsWith('--plan=')) {
    planSlug = a.slice('--plan='.length);
  } else {
    positional.push(a);
  }
}

const name = positional[0];
const baseBranch = positional[1] ?? 'main';

if (!name) {
  console.error('Usage: pnpm worktree:add <name> [base-branch] [--plan <slug>]');
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

if (planSlug !== null && !/^[a-zA-Z0-9._/-]+$/.test(planSlug)) {
  console.error(`✗ Invalid --plan slug: "${planSlug}".`);
  process.exit(1);
}

const repoName = basename(repoRoot);
const worktreeDir = resolve(repoRoot, '..', `${repoName}-${name.replaceAll(/\//g, '-')}`);

if (existsSync(worktreeDir)) {
  console.error(`✗ Target dir already exists: ${worktreeDir}`);
  process.exit(1);
}

let resolvedPlanSlug = planSlug;
let planAutoDetected = false;
if (!resolvedPlanSlug) {
  if (existsSync(resolve(repoRoot, 'docs/plans', `${name}.md`))) {
    resolvedPlanSlug = name;
    planAutoDetected = true;
  }
}

if (planSlug && !existsSync(resolve(repoRoot, 'docs/plans', `${planSlug}.md`))) {
  console.error(`✗ Plan not found: docs/plans/${planSlug}.md`);
  process.exit(1);
}

console.log(`→ Creating worktree:`);
console.log(`    name:        ${name}`);
console.log(`    base branch: ${baseBranch}`);
console.log(`    path:        ${worktreeDir}`);
if (resolvedPlanSlug) {
  console.log(`    plan:        ${resolvedPlanSlug}${planAutoDetected ? ' (auto-detected)' : ''}`);
}

const addResult = spawnSync('git', ['worktree', 'add', '-b', name, worktreeDir, baseBranch], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (addResult.status !== 0) {
  console.error('✗ git worktree add failed');
  process.exit(addResult.status ?? 1);
}

// Bootstrap runs without HNCH_PLAN_SLUG: the plan doc may not exist on the
// new worktree's base branch yet. worktree-add resolves the plan against the
// primary worktree (where the plan was authored) and writes .screenshot-tags
// itself, below. HNCH_PLAN_SLUG remains the re-sync path inside an existing
// worktree (`pnpm worktree:bootstrap`).
const bootstrapResult = spawnSync('bash', [resolve(repoRoot, 'scripts/worktree-bootstrap.sh')], {
  cwd: worktreeDir,
  stdio: 'inherit',
});

if (bootstrapResult.status !== 0) {
  console.error('✗ Bootstrap failed. Worktree was created at:', worktreeDir);
  console.error('  Fix the issue and rerun: cd', worktreeDir, '&& pnpm worktree:bootstrap');
  process.exit(bootstrapResult.status ?? 1);
}

if (resolvedPlanSlug) {
  const planPath = resolve(repoRoot, 'docs/plans', `${resolvedPlanSlug}.md`);
  const tagsRegex = parseScreenshotTags(readFileSync(planPath, 'utf8'));
  const tagsFile = resolve(worktreeDir, '.screenshot-tags');
  if (tagsRegex) {
    writeFileSync(tagsFile, `${tagsRegex}\n`);
    console.log(`→ Wrote .screenshot-tags: ${tagsRegex}`);
  } else if (!existsSync(tagsFile)) {
    console.log(
      `→ Plan "${resolvedPlanSlug}" has no "## Screenshot tags" section — full screenshot suite will run`,
    );
  }
}

console.log('');
console.log(`✓ Worktree ready. Open: cd ${worktreeDir}`);

function parseScreenshotTags(markdown) {
  const lines = markdown.split(/\r?\n/);
  let inSection = false;
  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      if (inSection) return null;
      if (/^screenshot tags\b/i.test(headingMatch[2])) {
        inSection = true;
        continue;
      }
    }
    if (!inSection) continue;
    const codeMatch = /`([^`\n]+)`/.exec(line);
    if (codeMatch) return codeMatch[1].trim();
  }
  return null;
}
