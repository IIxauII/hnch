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

function countPngs(dir) {
  if (!existsSync(dir)) return 0;
  const out = execSync(`find ${JSON.stringify(dir)} -type f -name '*.png' | wc -l`, {
    encoding: 'utf8',
  }).trim();
  return parseInt(out, 10) || 0;
}

function remoteShaDirExists(sha) {
  // `git ls-tree` on a missing path exits 128 with stderr "not a valid object name".
  return shOk(`git ls-tree origin/${SCREENSHOTS_BRANCH} -- ${JSON.stringify(`sha-${sha}`)}`);
}

function publishToScreenshotsBranch(sha) {
  const src = resolve(repoRoot, 'docs/screenshots', `sha-${sha}`);
  const localCount = countPngs(src);
  if (localCount === 0) {
    throw new Error(
      `expected PNGs under ${src} after capture; found 0. Capture step likely produced no files — check tag regex matches at least one spec.`,
    );
  }
  log(`local capture: ${localCount} PNG${localCount === 1 ? '' : 's'} in sha-${sha}/`);

  // Legitimate no-op: origin already carries this sha-dir (e.g. earlier run of
  // this same script, or a concurrent CI publish). Skip without touching the
  // branch — comment URLs will resolve.
  sh(`git fetch origin ${SCREENSHOTS_BRANCH}`);
  if (remoteShaDirExists(sha)) {
    log(
      `origin/${SCREENSHOTS_BRANCH} already has sha-${sha}/ — skipping push, comment URLs valid.`,
    );
    return;
  }

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
    if (attempt > 1) sh(`git fetch origin ${SCREENSHOTS_BRANCH}`);
    sh(`git worktree add -f ${JSON.stringify(tmpDir)} ${SCREENSHOTS_BRANCH}`);
    sh(`git -C ${JSON.stringify(tmpDir)} reset --hard origin/${SCREENSHOTS_BRANCH}`);
    const dest = resolve(tmpDir, `sha-${sha}`);
    mkdirSync(dest, { recursive: true });
    // rsync isn't ubiquitous on dev macs without homebrew; use a tar-pipe.
    execSync(`tar -C ${JSON.stringify(src)} -cf - . | tar -C ${JSON.stringify(dest)} -xf -`, {
      stdio: 'inherit',
    });
    const copiedCount = countPngs(dest);
    if (copiedCount !== localCount) {
      sh(`git worktree remove --force ${JSON.stringify(tmpDir)}`);
      throw new Error(
        `tar copy mismatch: ${localCount} PNGs in src, ${copiedCount} in dest. Aborting before comment update.`,
      );
    }
    sh(`git -C ${JSON.stringify(tmpDir)} add -A`);
    if (shOk(`git -C ${JSON.stringify(tmpDir)} diff --cached --quiet`)) {
      // Should be unreachable: we already verified remoteShaDirExists is false
      // and copied ${localCount} PNGs into a previously-non-existent dest.
      // Treat as a bug rather than silently no-op.
      sh(`git worktree remove --force ${JSON.stringify(tmpDir)}`);
      throw new Error(
        `staged diff is empty despite copying ${localCount} PNGs into sha-${sha}/. Refusing to update comment with broken URLs.`,
      );
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

function buildCommentBody(sha, prNum) {
  const root = resolve(repoRoot, 'docs/screenshots', `sha-${sha}`);
  const files = listPngsRecursive(root).toSorted();
  const lines = [];
  lines.push(COMMENT_MARKER);
  lines.push('');
  lines.push(`## Screenshots @ sha-${sha}`);
  lines.push('');
  lines.push(
    `<sub>PR #${prNum} · ${files.length} image${files.length === 1 ? '' : 's'} · branch \`${SCREENSHOTS_BRANCH}\`</sub>`,
  );
  lines.push('');
  // Group by first path segment (feature subfolder). Files at sha root (no
  // segment) — should not occur after OUT_DIR normalization — fall into a
  // synthetic '_root' group at the top so they remain visible if present.
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
  for (const feature of featureOrder) {
    lines.push(`### ${feature === '_root' ? '(uncategorized)' : feature}`);
    lines.push('');
    for (const rel of groups.get(feature)) {
      const url = `https://github.com/${REPO}/blob/${SCREENSHOTS_BRANCH}/sha-${sha}/${rel}?raw=true`;
      const alt = rel.replace(/\.png$/, '');
      lines.push(`![${alt}](${url})`);
    }
    lines.push('');
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

  // Final verification before claiming success in the sticky comment: refetch
  // origin/screenshots and confirm the sha-dir actually landed. Catches the
  // failure mode where publish silently no-ops but the dir is missing remote.
  sh(`git fetch origin ${SCREENSHOTS_BRANCH}`);
  if (!remoteShaDirExists(sha)) {
    throw new Error(
      `publish reported success but origin/${SCREENSHOTS_BRANCH} does not contain sha-${sha}/. Refusing to update sticky comment with broken URLs.`,
    );
  }

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
