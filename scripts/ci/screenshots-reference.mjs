#!/usr/bin/env node
// Publishes main's screenshot reference set to the `screenshots` branch and
// moves the latest pointer (#597). Called by the screenshots-reference job in
// .github/workflows/ci.yml after the e2e job captured the set on a main push.
//
//   node scripts/ci/screenshots-reference.mjs publish \
//     --branch-dir <checkout of the screenshots branch> \
//     --set-dir <the capture: <topic>/<scene>.png, no sha-<short>/ parent> \
//     --set sha-<short> --commit <main sha> --run-url <this run> \
//     [--main-dir <checkout of main with history>]
//
// Layout on the branch (its README.md is written from here, so the branch
// describes itself):
//
//   sha-<short>/<topic>/<scene>.png   every capture, PR pushes and main alike
//   latest/<topic>/<scene>.png        a copy of main's newest set. A directory,
//                                     not a symlink: GitHub serves no file
//                                     through a symlinked path (404), and a
//                                     copy costs nothing, git stores one blob
//                                     per distinct content.
//   latest.json                       which set latest/ is, which main commit
//                                     it shows, and the run that captured it
//
// latest/ only moves forward: with --main-dir, a set whose commit is behind
// the one latest.json names (a re-run of an older run's failed publish) is
// added as sha-<short>/ but leaves latest/ alone.
//
// The branch has no history to keep: the job checks it out at depth 1, with
// blob:none and a sparse cone of latest/ (a few MB), and fetch + reset +
// retry on a rejected push, as scripts/screenshot-publish.mjs does for PR
// captures. Never a force push.
//
// Pure Node, no dependencies: the job installs no node_modules.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process, { argv, env as processEnv, stderr } from 'node:process';

export const BRANCH = 'screenshots';
export const LATEST_DIR = 'latest';
export const POINTER_FILE = 'latest.json';
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;
const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';
const REPO = 'IIxauII/hnch';
// A push lost to a concurrent push says one of these; anything else (auth, a
// missing branch, the network) is not cured by trying again.
const RACE_RE = /fetch first|non-fast-forward|failed to push some refs|rejected/i;

export const README = `# \`screenshots\` branch — machine-managed

Do not hand-edit. Do not merge into \`main\`. Two publishers write here, never with a force push:

- \`scripts/screenshot-publish.mjs\` on \`main\` (the \`lefthook\` pre-push hook and \`pnpm screenshots:publish\`): a PR's capture, under \`sha-<short>/\` of the PR head.
- \`scripts/ci/screenshots-reference.mjs\` on \`main\` (the \`screenshots-reference\` job of \`ci.yml\`, after the e2e job of a \`main\` push with UI changes): main's reference set, under \`sha-<short>/\` of the \`main\` commit, copied to \`latest/\`, and this README.

## Layout

\`\`\`
sha-<short>/<topic>/<scene>.png   every capture: PR pushes and main alike
latest/<topic>/<scene>.png        main's newest reference set (a copy, not a symlink: GitHub serves nothing through a symlinked path)
latest.json                       { set, commit, run }: which sha-<short>/ latest/ is, the main commit it shows, the run that captured it
\`\`\`

Embed or open an image with the one URL pattern that renders on GitHub mobile and desktop:

\`\`\`
https://github.com/${REPO}/blob/${BRANCH}/latest/<topic>/<scene>.png?raw=true
https://github.com/${REPO}/blob/${BRANCH}/sha-<short>/<topic>/<scene>.png?raw=true
\`\`\`

## Retention

Uncapped. PNGs are small (about 80 kB each, about 150 per capture), and identical images share one blob. Revisit if the branch exceeds, say, 10 GB.

## Concurrency

Both publishers fetch and reset to \`origin/${BRANCH}\` before each commit and retry on a rejected (non-fast-forward) push. \`latest/\` only moves to a set whose \`main\` commit is at or past the one it shows.

## Cross-references

- Flow and troubleshooting: \`docs/release.md\` › Screenshots, on \`main\`.
- Harness: \`packages/e2e/README.md\` › Screenshot harness, on \`main\`.
`;

/**
 * Publish one capture as main's reference set.
 *
 * @param {{
 *   branchDir: string,
 *   setDir: string,
 *   set: string,
 *   commit: string,
 *   runUrl: string,
 *   mainDir?: string,
 *   env?: NodeJS.ProcessEnv,
 *   log?: (line: string) => void,
 *   maxAttempts?: number,
 *   retryDelayMs?: number,
 *   beforePush?: (attempt: number) => void,
 * }} opts
 *   branchDir: a checkout of the screenshots branch with `origin` set; set:
 *   `sha-<short>` of the main commit; mainDir: a checkout of main whose
 *   history decides whether latest/ moves (without it, it always moves);
 *   beforePush: a test hook.
 * @returns {{
 *   status: 'published' | 'unchanged',
 *   latest: boolean,
 *   previous: { set: string, commit: string } | null,
 *   images: number,
 *   sha: string,
 * }}
 *   latest: whether latest/ now shows this set; previous: what latest.json
 *   named before; sha: the branch tip after the call.
 */
export function publishReference({
  branchDir,
  setDir,
  set,
  commit,
  runUrl,
  mainDir,
  env = processEnv,
  log = (line) => stderr.write(`${line}\n`),
  maxAttempts = MAX_ATTEMPTS,
  retryDelayMs = RETRY_DELAY_MS,
  beforePush = () => {},
}) {
  if (!/^sha-[0-9a-f]{7,40}$/.test(set)) {
    throw new Error(`set must be sha-<short>, got ${JSON.stringify(set)}`);
  }
  const images = countPngs(setDir);
  if (images === 0) {
    throw new Error(`no PNG under ${setDir}: the capture produced nothing, publishing nothing`);
  }
  log(`${images} images in the capture, publishing as ${set}/`);

  const gitIn = (cwd, ...args) =>
    execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
  const git = (...args) => gitIn(branchDir, ...args);
  const gitOk = (cwd, ...args) => {
    try {
      gitIn(cwd, ...args);
      return true;
    } catch {
      return false;
    }
  };
  // The bot signs the commit whatever identity the environment carries.
  const botEnv = {
    ...env,
    GIT_AUTHOR_NAME: BOT_NAME,
    GIT_AUTHOR_EMAIL: BOT_EMAIL,
    GIT_COMMITTER_NAME: BOT_NAME,
    GIT_COMMITTER_EMAIL: BOT_EMAIL,
  };

  /** latest/ moves unless latest.json names a commit this one is behind. */
  const latestMoves = (previous) => {
    if (!previous?.commit || !mainDir || previous.commit === commit) return true;
    // A commit main's history does not know (rewritten, or a placeholder) is
    // no reason to hold latest/ back.
    if (!gitOk(mainDir, 'cat-file', '-e', `${previous.commit}^{commit}`)) return true;
    return gitOk(mainDir, 'merge-base', '--is-ancestor', previous.commit, commit);
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`attempt ${attempt}/${maxAttempts}: fetch origin/${BRANCH} and stage the set`);
    git('fetch', '--quiet', '--depth', '1', 'origin', BRANCH);
    git('reset', '--quiet', '--hard', `origin/${BRANCH}`);
    // The job's checkout is a sparse cone (root files + latest/); the new set's
    // directory must be inside the cone for `git add` to take it.
    if (git('config', '--default', 'false', 'core.sparseCheckout') === 'true') {
      git('sparse-checkout', 'set', LATEST_DIR, set);
    }

    const previous = readPointer(join(branchDir, POINTER_FILE));
    const latest = latestMoves(previous);
    rmSync(join(branchDir, set), { recursive: true, force: true });
    cpSync(setDir, join(branchDir, set), { recursive: true });
    if (latest) {
      rmSync(join(branchDir, LATEST_DIR), { recursive: true, force: true });
      cpSync(setDir, join(branchDir, LATEST_DIR), { recursive: true });
      writeFileSync(
        join(branchDir, POINTER_FILE),
        `${JSON.stringify({ set, commit, run: runUrl }, null, 2)}\n`,
      );
    } else {
      log(
        `${LATEST_DIR}/ stays at ${previous.set}: ${commit} is behind ${previous.commit} on main`,
      );
    }
    writeFileSync(join(branchDir, 'README.md'), README);

    git('add', '-A');
    const result = { latest, previous, images };
    if (gitOk(branchDir, 'diff', '--cached', '--quiet')) {
      log(`origin/${BRANCH} already holds this; nothing to publish`);
      return { status: 'unchanged', ...result, sha: git('rev-parse', 'HEAD') };
    }
    execFileSync('git', ['commit', '--quiet', '-m', `screenshots: main @ ${set}`], {
      cwd: branchDir,
      env: botEnv,
      stdio: 'pipe',
    });
    beforePush(attempt);
    try {
      git('push', '--quiet', 'origin', `HEAD:${BRANCH}`);
    } catch (e) {
      const why = firstLine(e);
      if (!RACE_RE.test(`${e.stderr ?? ''}`))
        throw new Error(`push to ${BRANCH} failed: ${why}`, { cause: e });
      log(`push rejected, another publish landed first: ${why}`);
      if (retryDelayMs > 0) execFileSync('sleep', [String(retryDelayMs / 1000)]);
      continue;
    }
    const sha = git('rev-parse', 'HEAD');
    log(`published ${sha} to ${BRANCH}`);
    return { status: 'published', ...result, sha };
  }
  throw new Error(`push to ${BRANCH} rejected ${maxAttempts} times; the previous reference stays`);
}

/** The PNGs under dir, at any depth. */
export function countPngs(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter(
    (d) => d.isFile() && d.name.endsWith('.png'),
  ).length;
}

/** latest.json's { set, commit } if the branch has a readable one. */
function readPointer(path) {
  if (!existsSync(path)) return null;
  try {
    const { set, commit } = JSON.parse(readFileSync(path, 'utf8'));
    return typeof set === 'string' && typeof commit === 'string' ? { set, commit } : null;
  } catch {
    return null;
  }
}

function firstLine(error) {
  const text = error.stderr?.toString().trim() || error.message;
  return text.split('\n').find((l) => l.trim()) ?? '';
}

// ---------------------------------------------------------------------- CLI

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const m = /^--([a-z-]+)$/.exec(args[i]);
    if (!m) throw new Error(`unexpected argument ${args[i]}`);
    out[m[1]] = args[++i] ?? '';
  }
  return out;
}

function main() {
  if (argv[2] !== 'publish') {
    stderr.write(
      'usage: screenshots-reference.mjs publish --branch-dir <dir> --set-dir <dir> --set sha-<short> --commit <sha> --run-url <url> [--main-dir <dir>]\n',
    );
    return 2;
  }
  const args = parseArgs(argv.slice(3));
  for (const k of ['branch-dir', 'set-dir', 'set', 'commit', 'run-url']) {
    if (!args[k]) throw new Error(`--${k} is required`);
  }
  const result = publishReference({
    branchDir: args['branch-dir'],
    setDir: args['set-dir'],
    set: args.set,
    commit: args.commit,
    runUrl: args['run-url'],
    mainDir: args['main-dir'],
  });
  const tree = (dir) => `https://github.com/${REPO}/tree/${BRANCH}/${dir}`;
  const verb = result.status === 'published' ? 'published' : 'already on the branch';
  const pointer = result.latest
    ? `now [\`${LATEST_DIR}/\`](${tree(LATEST_DIR)})`
    : `[\`${LATEST_DIR}/\`](${tree(LATEST_DIR)}) stays at \`${result.previous.set}\` (\`${args.commit.slice(0, 7)}\` is behind \`${result.previous.commit.slice(0, 7)}\` on main)`;
  summary(
    `Screenshot reference ${verb}: [\`${args.set}\`](${tree(args.set)}), ${result.images} images, ${pointer}.`,
  );
  return 0;
}

function summary(line) {
  stderr.write(`${line}\n`);
  if (processEnv.GITHUB_STEP_SUMMARY) {
    writeFileSync(processEnv.GITHUB_STEP_SUMMARY, `${line}\n`, { flag: 'a' });
  }
}

if (argv[1] === import.meta.filename) {
  try {
    process.exitCode = main();
  } catch (e) {
    // The job runs with continue-on-error, so the main run stays green; the
    // annotation and the summary line keep the miss visible.
    stderr.write(`::error::screenshot reference not published: ${e.message}\n`);
    summary(
      `Screenshot reference **not published**: ${e.message}. The previous \`latest/\` stays.`,
    );
    process.exitCode = 1;
  }
}
