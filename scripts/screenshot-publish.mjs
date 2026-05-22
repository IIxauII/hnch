#!/usr/bin/env node
// Capture screenshots, publish to the `screenshots` orphan branch, sticky-
// comment the inline links on the active PR. Invoked by:
//
//   - lefthook pre-push (mode=hook): conditional on UI-bearing diff vs @{push}
//   - pnpm screenshots:publish (mode=manual): always runs full or tag-scoped
//
// See docs/plans/e2e-screenshot-coverage-expansion.md (Phase 3).

import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

const REPO_OWNER = 'IIxauII';
const REPO_NAME = 'hnch';
const REPO = `${REPO_OWNER}/${REPO_NAME}`;
const SCREENSHOTS_BRANCH = 'screenshots';
const COMMENT_MARKER = '<!-- hnch-screenshots -->';
const RELEVANT_PATHS = [
  'packages/client/',
  'packages/shared/',
  'packages/e2e/tests/_screenshots/',
  'packages/e2e/tests/fixtures/',
];
const MAX_PUSH_ATTEMPTS = 5;

const __dirname = import.meta.dirname;
const repoRoot = resolve(__dirname, '..');

const args = parseArgs(process.argv.slice(2));
const mode = args.mode === 'manual' ? 'manual' : 'hook';
const verbose = !!args.verbose;

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    out[m[1]] = m[2] ?? true;
  }
  return out;
}

function log(msg) {
  console.error(`[screenshot-publish] ${msg}`);
}

function vlog(msg) {
  if (verbose) log(msg);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    .toString()
    .trim();
}

function shOk(cmd, opts = {}) {
  try {
    sh(cmd, opts);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- relevance

function relevantDiff() {
  // Hook mode: compare local HEAD against the upstream tip we're about to push to.
  // `@{push}` resolves to the branch's push target. If unset (first push), fall
  // back to origin/main as a coarse baseline.
  let base;
  try {
    base = sh('git rev-parse --abbrev-ref --symbolic-full-name @{push}');
  } catch {
    base = 'origin/main';
    vlog(`@{push} unset; using ${base} as baseline`);
  }
  let changed = '';
  try {
    changed = sh(`git diff --name-only ${base}...HEAD`);
  } catch {
    // Base ref missing locally — be conservative and run.
    return true;
  }
  if (!changed) return false;
  const files = changed.split('\n');
  return files.some((f) => RELEVANT_PATHS.some((p) => f.startsWith(p)));
}

// ---------------------------------------------------------------- PR lookup

function findPRNumber() {
  const res = spawnSync('gh', ['pr', 'view', '--json', 'number', '--jq', '.number'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (res.status !== 0) return null;
  const n = parseInt(res.stdout.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------- capture

function shortSHA() {
  return sh('git rev-parse --short=7 HEAD');
}

function readTags() {
  const p = resolve(repoRoot, '.screenshot-tags');
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf8').trim();
}

function runCapture(sha) {
  const env = { ...process.env, SCREENSHOT_CAPTURE: '1', SCREENSHOT_SHA: `sha-${sha}` };
  const tags = readTags();
  if (tags) {
    env['SCREENSHOT_TAGS'] = tags;
  }
  const playwrightArgs = [
    '--filter',
    '@hnch/e2e',
    'exec',
    'playwright',
    'test',
    '_screenshots',
    '--project=chromium',
    '--workers=1',
    '--reporter=list',
  ];
  if (tags) {
    playwrightArgs.push(`--grep=${tags}`);
  }
  log(`capturing screenshots → docs/screenshots/sha-${sha}/${tags ? ` (tags: ${tags})` : ''}`);
  const res = spawnSync('pnpm', playwrightArgs, { cwd: repoRoot, env, stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`playwright exited with ${res.status}`);
  }
  const outDir = resolve(repoRoot, 'docs/screenshots', `sha-${sha}`);
  if (!existsSync(outDir)) {
    throw new Error(`expected ${outDir} after capture; not found`);
  }
  return outDir;
}

// ---------------------------------------------------------------- publish

function publishToScreenshotsBranch(sha) {
  const tmpDir = resolve(repoRoot, '..', '.screenshots-tmp');
  if (existsSync(tmpDir)) {
    // Stale leftover from a previous failed run — clean up first.
    try {
      sh(`git worktree remove --force ${JSON.stringify(tmpDir)}`);
    } catch {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
    log(`publish attempt ${attempt}/${MAX_PUSH_ATTEMPTS} → ${SCREENSHOTS_BRANCH} branch`);
    sh(`git fetch origin ${SCREENSHOTS_BRANCH}`);
    sh(`git worktree add -f ${JSON.stringify(tmpDir)} ${SCREENSHOTS_BRANCH}`);
    sh(`git -C ${JSON.stringify(tmpDir)} reset --hard origin/${SCREENSHOTS_BRANCH}`);
    const src = resolve(repoRoot, 'docs/screenshots', `sha-${sha}`);
    const dest = resolve(tmpDir, `sha-${sha}`);
    mkdirSync(dest, { recursive: true });
    // rsync isn't ubiquitous on dev macs without homebrew; use a tar-pipe.
    execSync(`tar -C ${JSON.stringify(src)} -cf - . | tar -C ${JSON.stringify(dest)} -xf -`, {
      stdio: 'inherit',
    });
    sh(`git -C ${JSON.stringify(tmpDir)} add -A`);
    if (shOk(`git -C ${JSON.stringify(tmpDir)} diff --cached --quiet`)) {
      log('no changes vs screenshots branch; skipping commit.');
      sh(`git worktree remove --force ${JSON.stringify(tmpDir)}`);
      return;
    }
    const prNum = process.env['SCREENSHOTS_PR_NUM'] ?? '?';
    sh(
      `git -C ${JSON.stringify(tmpDir)} commit -m ${JSON.stringify(`screenshots: PR #${prNum} @ sha-${sha}`)}`,
    );
    const pushRes = spawnSync('git', ['-C', tmpDir, 'push', 'origin', SCREENSHOTS_BRANCH], {
      stdio: 'inherit',
    });
    if (pushRes.status === 0) {
      sh(`git worktree remove --force ${JSON.stringify(tmpDir)}`);
      return;
    }
    log('push rejected; will fetch + retry');
    sh(`git worktree remove --force ${JSON.stringify(tmpDir)}`);
    sleepSync(2000);
  }
  throw new Error(`failed to push to ${SCREENSHOTS_BRANCH} after ${MAX_PUSH_ATTEMPTS} attempts`);
}

function sleepSync(ms) {
  execFileSync('sleep', [String(ms / 1000)], { stdio: 'ignore' });
}

// --------------------------------------------------------------- comment

function listPngsRecursive(dir) {
  const entries = execSync(`find ${JSON.stringify(dir)} -type f -name '*.png'`, {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
  return entries.map((abs) => abs.slice(dir.length + 1));
}

// Best-effort mapping from a screenshot tag to the feature folder most likely
// to contain its scenes. Used to pick the "in scope" pinned preview at the top
// of the comment. First match wins; tags not listed contribute nothing.
const TAG_TO_FEATURE = {
  '@reveal': ['reveal', 'vote-bars'],
  '@skip': ['reveal'],
  '@scale': ['vote-dots'],
  '@host': ['agenda'],
  '@home': ['baseline'],
  '@baseline': ['baseline'],
  '@layout': ['layout', 'baseline'],
  '@onboarding': ['keyboard'],
};

const MOBILE_RE = /(?:^|[-_/])(?:375|390|mobile)(?:[-_./]|$)/;
const DESKTOP_RE = /(?:^|[-_/])(?:1280|1440|1920|desktop)(?:[-_./]|$)/;

function classifyVariant(rel) {
  const isMobile = MOBILE_RE.test(rel);
  const isDesktop = DESKTOP_RE.test(rel);
  const isDark = /\bdark\b/.test(rel);
  const isLight = /\blight\b/.test(rel);
  return { isMobile, isDesktop, isDark, isLight };
}

function pickPinned(filesInFeature) {
  const slots = {
    mobileDark: null,
    desktopDark: null,
    mobileLight: null,
    desktopLight: null,
  };
  for (const rel of filesInFeature) {
    const v = classifyVariant(rel);
    if (v.isMobile && v.isDark && !slots.mobileDark) slots.mobileDark = rel;
    else if (v.isDesktop && v.isDark && !slots.desktopDark) slots.desktopDark = rel;
    else if (v.isMobile && v.isLight && !slots.mobileLight) slots.mobileLight = rel;
    else if (v.isDesktop && v.isLight && !slots.desktopLight) slots.desktopLight = rel;
  }
  const found = Object.values(slots).filter(Boolean).length;
  return found >= 2 ? slots : null;
}

function pickPinnedFeature(groups, tagsRegex) {
  if (!tagsRegex) return null;
  // Extract literal tag tokens from a regex like "@reveal|@baseline|@layout".
  const tagTokens = tagsRegex.match(/@[a-z-]+/gi) ?? [];
  for (const tag of tagTokens) {
    const candidates = TAG_TO_FEATURE[tag.toLowerCase()] ?? [];
    for (const feature of candidates) {
      if (groups.has(feature)) return feature;
    }
  }
  return null;
}

function imgLine(rel, sha) {
  const url = `https://github.com/${REPO}/blob/${SCREENSHOTS_BRANCH}/sha-${sha}/${rel}?raw=true`;
  const alt = rel.replace(/\.png$/, '');
  return `![${alt}](${url})`;
}

const NEST_THRESHOLD = 10;

function emitFeatureSection(lines, feature, files, sha, openByDefault) {
  const count = files.length;
  const openAttr = openByDefault ? ' open' : '';
  lines.push(`<details${openAttr}>`);
  lines.push(`<summary><b>${feature}</b> — ${count} image${count === 1 ? '' : 's'}</summary>`);
  lines.push('');
  lines.push('<br>');
  lines.push('');
  const desktop = [];
  const mobile = [];
  const other = [];
  for (const rel of files) {
    const v = classifyVariant(rel);
    if (v.isDesktop) desktop.push(rel);
    else if (v.isMobile) mobile.push(rel);
    else other.push(rel);
  }
  // Only nest when category is large AND splitting yields ≥2 non-empty buckets,
  // otherwise the inner collapse adds a click for no organisational win.
  const buckets = [desktop, mobile, other].filter((b) => b.length > 0).length;
  const shouldNest = count >= NEST_THRESHOLD && buckets >= 2;
  if (shouldNest) {
    const emitSub = (label, items) => {
      if (items.length === 0) return;
      lines.push('<details>');
      lines.push(`<summary><i>${label} (${items.length})</i></summary>`);
      lines.push('');
      for (const rel of items) lines.push(imgLine(rel, sha));
      lines.push('');
      lines.push('</details>');
      lines.push('');
    };
    emitSub('Desktop', desktop);
    emitSub('Mobile', mobile);
    emitSub('Other', other);
  } else {
    for (const rel of files) lines.push(imgLine(rel, sha));
    lines.push('');
  }
  lines.push('</details>');
  lines.push('');
}

function buildCommentBody(sha, prNum) {
  const root = resolve(repoRoot, 'docs/screenshots', `sha-${sha}`);
  const files = listPngsRecursive(root).toSorted();
  const tagsRegex = readTags();
  const lines = [];
  lines.push(COMMENT_MARKER);
  lines.push('');
  lines.push(`## 📸 Screenshots @ sha-${sha}`);
  lines.push('');
  const tagsSuffix = tagsRegex ? ` · tags \`${tagsRegex}\`` : '';
  lines.push(
    `<sub>PR #${prNum} · ${files.length} image${files.length === 1 ? '' : 's'} · branch \`${SCREENSHOTS_BRANCH}\`${tagsSuffix}</sub>`,
  );
  lines.push('');

  // Group by feature folder.
  const groups = new Map();
  for (const rel of files) {
    const slash = rel.indexOf('/');
    const feature = slash === -1 ? '_root' : rel.slice(0, slash);
    if (!groups.has(feature)) groups.set(feature, []);
    groups.get(feature).push(rel);
  }
  const featureOrder = [...groups.keys()].toSorted((a, b) => {
    if (a === '_root') return -1;
    if (b === '_root') return 1;
    return a.localeCompare(b);
  });

  const indexEntries = featureOrder
    .filter((f) => f !== '_root')
    .map((f) => `\`${f}\` (${groups.get(f).length})`);
  if (indexEntries.length > 0) {
    lines.push(`**Categories:** ${indexEntries.join(' · ')}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  // Pinned in-scope preview (collapsible, open by default).
  const pinnedFeature = pickPinnedFeature(groups, tagsRegex);
  const pinnedSlots = pinnedFeature ? pickPinned(groups.get(pinnedFeature)) : null;
  if (pinnedSlots) {
    const filled = Object.values(pinnedSlots).filter(Boolean).length;
    lines.push('<details open>');
    lines.push(
      `<summary>⭐ <b>In scope for this PR</b> — ${filled} pinned preview${filled === 1 ? '' : 's'} from <code>${pinnedFeature}</code> (mobile + desktop × light + dark)</summary>`,
    );
    lines.push('');
    lines.push('<br>');
    lines.push('');
    const cell = (rel) => (rel ? imgLine(rel, sha) : '_(not captured)_');
    lines.push('| Mobile | Desktop |');
    lines.push('|---|---|');
    lines.push(`| ${cell(pinnedSlots.mobileDark)} | ${cell(pinnedSlots.desktopDark)} |`);
    lines.push('| **Dark** | **Dark** |');
    lines.push(`| ${cell(pinnedSlots.mobileLight)} | ${cell(pinnedSlots.desktopLight)} |`);
    lines.push('| **Light** | **Light** |');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Every category in a collapsed `<details>`.
  for (const feature of featureOrder) {
    const label = feature === '_root' ? '(uncategorized)' : feature;
    emitFeatureSection(lines, label, groups.get(feature), sha, false);
  }
  return lines.join('\n');
}

function upsertStickyComment(prNum, body) {
  const listRes = spawnSync(
    'gh',
    [
      'api',
      `repos/${REPO}/issues/${prNum}/comments`,
      '--paginate',
      '--jq',
      `.[] | select(.body | startswith(${JSON.stringify(COMMENT_MARKER)})) | .id`,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (listRes.status !== 0) {
    throw new Error(`gh api (list comments) failed: ${listRes.stderr}`);
  }
  const existing = listRes.stdout
    .trim()
    .split('\n')
    .find((line) => line.length > 0);
  // Write the body to a temp file so we don't shell-escape ~30 image lines.
  const bodyFile = join(tmpdir(), `hnch-screenshots-${Date.now()}.md`);
  writeFileSync(bodyFile, body, 'utf8');
  try {
    if (existing) {
      log(`updating sticky comment id=${existing}`);
      const res = spawnSync(
        'gh',
        [
          'api',
          '-X',
          'PATCH',
          `repos/${REPO}/issues/comments/${existing}`,
          '-F',
          `body=@${bodyFile}`,
        ],
        { cwd: repoRoot, stdio: 'inherit' },
      );
      if (res.status !== 0) throw new Error('gh api PATCH comment failed');
    } else {
      log('creating sticky comment');
      const res = spawnSync('gh', ['pr', 'comment', String(prNum), '--body-file', bodyFile], {
        cwd: repoRoot,
        stdio: 'inherit',
      });
      if (res.status !== 0) throw new Error('gh pr comment failed');
    }
  } finally {
    rmSync(bodyFile, { force: true });
  }
}

// ---------------------------------------------------------------- main

function main() {
  // Dry-run: emit the comment body for the given sha + PR num without
  // touching git, gh, or playwright. Used for local layout iteration.
  //   --dry-run-body --sha=<short> [--pr=999]
  if (args['dry-run-body']) {
    const sha = String(args.sha ?? shortSHA());
    const pr = parseInt(String(args.pr ?? '999'), 10);
    process.stdout.write(buildCommentBody(sha, pr));
    return 0;
  }

  // gh is required; bail fast if missing rather than failing mid-publish.
  if (!shOk('gh --version')) {
    log('gh CLI not installed; skipping. Install: brew install gh && gh auth login.');
    return 0;
  }

  if (mode === 'hook') {
    if (!relevantDiff()) {
      vlog('no UI-bearing changes vs push baseline; skip.');
      return 0;
    }
  }

  const pr = findPRNumber();
  if (!pr) {
    if (mode === 'hook') {
      log(
        "no PR yet for this branch. After 'gh pr create', run 'pnpm screenshots:publish' to upload screenshots.",
      );
      return 0;
    }
    log("no PR found for HEAD; create one with 'gh pr create' first.");
    return 1;
  }
  process.env['SCREENSHOTS_PR_NUM'] = String(pr);

  const sha = shortSHA();
  runCapture(sha);
  publishToScreenshotsBranch(sha);
  const body = buildCommentBody(sha, pr);
  upsertStickyComment(pr, body);
  log(`done. https://github.com/${REPO}/pull/${pr}`);
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  log(`error: ${e.message}`);
  // In hook mode we still exit 0 — screenshots are best-effort, not a push gate.
  // Caller can re-run via pnpm screenshots:publish after diagnosing.
  if (mode === 'hook') {
    log(
      'hook mode: continuing push despite screenshot failure. Re-run via `pnpm screenshots:publish`.',
    );
    process.exit(0);
  }
  process.exit(1);
}
