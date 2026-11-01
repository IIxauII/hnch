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
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import process, { argv, env as processEnv, stderr } from 'node:process';

export const BRANCH = 'screenshots';
export const LATEST_DIR = 'latest';
export const POINTER_FILE = 'latest.json';
/** The artifact a PR run uploads its screenshot set as (see adoptCapture). */
export const CAPTURE_ARTIFACT = 'screenshots-capture';
/** Its manifest, beside the <topic>/ directories. */
export const CAPTURE_MANIFEST = 'capture.json';
const SHA = /^[0-9a-f]{40}$/;
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
latest.json                       { set, commit, run, capturedIn? }: which sha-<short>/ latest/ is, the main commit it shows, the main run that published it, and, for a set promoted from a verified PR run, that PR run
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
 *   capturedIn?: string,
 *   mainDir?: string,
 *   env?: NodeJS.ProcessEnv,
 *   log?: (line: string) => void,
 *   maxAttempts?: number,
 *   retryDelayMs?: number,
 *   beforePush?: (attempt: number) => void,
 * }} opts
 *   branchDir: a checkout of the screenshots branch with `origin` set; set:
 *   `sha-<short>` of the main commit; runUrl: the main run publishing;
 *   capturedIn: the PR run whose set this is, when promoted (#598); mainDir:
 *   a checkout of main whose history decides whether latest/ moves (without
 *   it, it always moves); beforePush: a test hook.
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
  capturedIn,
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
      const pointer = { set, commit, run: runUrl, ...(capturedIn && { capturedIn }) };
      writeFileSync(join(branchDir, POINTER_FILE), `${JSON.stringify(pointer, null, 2)}\n`);
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
    const subject = `screenshots: main @ ${set}${capturedIn ? ' (promoted from a PR run)' : ''}`;
    execFileSync('git', ['commit', '--quiet', '-m', subject], {
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

/** A plain miss: main captures its own set, as it did before promotion. */
const miss = (reason) => ({ adopted: false, warning: false, reason });

/** Something broke: main captures its own set and says so on its summary. */
const fault = (reason) => ({ adopted: false, warning: true, reason });

/**
 * Adopts the set a verified PR run captured as main's reference (#598): the
 * same tree in the same image gives the same pixels, so the main run need
 * not capture again. Only `adopted: true` skips the capture; every miss or
 * error leaves the main run capturing as before, an error with a warning.
 *
 * The PR run's artifact (CAPTURE_ARTIFACT) holds `<topic>/<scene>.png` beside
 * CAPTURE_MANIFEST: `{ tree, complete }`, the tree of the checkout the set
 * was captured from and whether every screenshot spec passed in that run.
 * A set that is missing, expired, partial (`complete` not true) or from
 * another tree than `commit`'s is not adopted. On success, outDir holds the
 * set as the publisher expects it (manifest removed).
 *
 * @param {{
 *   repo: string,            // owner/name
 *   runId: number,           // the verifying PR run (ADR-0055)
 *   runUrl: string,
 *   commit: string,          // the pushed commit on main
 *   outDir: string,          // where the set is unpacked
 *   gh: (path: string) => any,                     // GET the REST path, parsed JSON
 *   git: (args: string[]) => string,               // stdout, trimmed
 *   download: (runId: number, dir: string) => void // unpack the artifact into dir
 * }} input
 * @returns {{ adopted: true, set: string, images: number, tree: string }
 *   | { adopted: false, warning: boolean, reason: string }}
 */
export function adoptCapture(input) {
  let result;
  try {
    result = adopt(input);
  } catch (err) {
    result = fault(`adopting the PR run's screenshot set failed: ${err.message.split('\n')[0]}`);
  }
  // A set that is not adopted must not linger where the upload step looks.
  if (!result.adopted) rmSync(input.outDir, { recursive: true, force: true });
  return result;
}

function adopt({ repo, runId, runUrl, commit, outDir, gh, git, download }) {
  const { artifacts } = gh(
    `repos/${repo}/actions/runs/${runId}/artifacts?name=${CAPTURE_ARTIFACT}`,
  );
  if (artifacts.length === 0) {
    return miss(`the PR run ${runUrl} uploaded no ${CAPTURE_ARTIFACT} artifact`);
  }
  if (artifacts.every((a) => a.expired)) {
    return miss(`the ${CAPTURE_ARTIFACT} artifact of ${runUrl} has expired`);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  download(runId, outDir);
  const manifestFile = join(outDir, CAPTURE_MANIFEST);
  if (!existsSync(manifestFile)) {
    return fault(`the ${CAPTURE_ARTIFACT} artifact of ${runUrl} has no ${CAPTURE_MANIFEST}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } catch {
    return fault(`the ${CAPTURE_MANIFEST} of ${runUrl} is not JSON`);
  }
  if (!SHA.test(manifest?.tree) || typeof manifest.complete !== 'boolean') {
    return fault(`the ${CAPTURE_MANIFEST} of ${runUrl} is malformed (tree and complete expected)`);
  }
  if (!manifest.complete) {
    return miss(`the set of ${runUrl} is partial (not every screenshot spec passed there)`);
  }
  const tree = git(['rev-parse', `${commit}^{tree}`]);
  if (manifest.tree !== tree) {
    return miss(
      `the set of ${runUrl} was captured from tree ${manifest.tree}, not this commit's ${tree}`,
    );
  }
  rmSync(manifestFile, { force: true });
  const images = countPngs(outDir);
  if (images === 0) return fault(`the ${CAPTURE_ARTIFACT} artifact of ${runUrl} holds no PNG`);
  return { adopted: true, set: `sha-${git(['rev-parse', '--short=7', commit])}`, images, tree };
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

const USAGE = [
  'usage: screenshots-reference.mjs publish --branch-dir <dir> --set-dir <dir> --set sha-<short> --commit <sha> --run-url <url> [--main-dir <dir>] [--captured-in <PR run url>]',
  '       screenshots-reference.mjs adopt --run <PR run id> --run-url <url> --commit <sha> --out <dir>',
  '',
].join('\n');

/** stdout trimmed; the message of a failed gh call carries gh's stderr. */
function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    }).trim();
  } catch (err) {
    throw new Error(`${err.message.split('\n')[0]}: ${String(err.stderr ?? '').trim()}`, {
      cause: err,
    });
  }
}

/**
 * adopt: the detect-changes step of a verified-skip main push. Exit 0 when
 * the PR run's set is now in --out (GITHUB_OUTPUT gets `set` and `from`), 3
 * when main captures its own, with the reason on stdout, as a ::warning::
 * when something broke. Needs REPO and GH_TOKEN (gh), and git on main.
 */
function adoptCommand(args) {
  for (const k of ['run', 'run-url', 'commit', 'out']) {
    if (!args[k]) throw new Error(`--${k} is required`);
  }
  const repo = processEnv.REPO;
  if (!repo) throw new Error('REPO is required');
  const result = adoptCapture({
    repo,
    runId: Number(args.run),
    runUrl: args['run-url'],
    commit: args.commit,
    outDir: args.out,
    gh: (path) => JSON.parse(sh('gh', ['api', path])),
    git: (gitArgs) => sh('git', gitArgs),
    download: (runId, dir) =>
      sh('gh', [
        'run',
        'download',
        String(runId),
        '--repo',
        repo,
        '--name',
        CAPTURE_ARTIFACT,
        '--dir',
        dir,
      ]),
  });
  if (!result.adopted) {
    const line = `Not adopting the PR run's screenshot set: ${result.reason}. The e2e job captures main's reference.`;
    process.stdout.write(result.warning ? `::warning::${line}\n` : `${line}\n`);
    return 3;
  }
  process.stdout.write(
    `Adopted ${result.images} images from ${args['run-url']} as ${result.set} (tree ${result.tree}); no capture in this run.\n`,
  );
  if (processEnv.GITHUB_OUTPUT) {
    writeFileSync(processEnv.GITHUB_OUTPUT, `set=${result.set}\nfrom=${args['run-url']}\n`, {
      flag: 'a',
    });
  }
  summary(
    `Screenshot set adopted from [the verified PR run](${args['run-url']}): ${result.images} images of the same tree, to be published as \`${result.set}\`; this run captures nothing (#598).`,
  );
  return 0;
}

function main() {
  if (argv[2] === 'adopt') return adoptCommand(parseArgs(argv.slice(3)));
  if (argv[2] !== 'publish') {
    stderr.write(USAGE);
    return 2;
  }
  const args = parseArgs(argv.slice(3));
  for (const k of ['branch-dir', 'set-dir', 'set', 'commit', 'run-url']) {
    if (!args[k]) throw new Error(`--${k} is required`);
  }
  // The workflow passes the promotion output verbatim: empty when this run
  // captured the set itself.
  const capturedIn = args['captured-in'] || undefined;
  const result = publishReference({
    branchDir: args['branch-dir'],
    setDir: args['set-dir'],
    set: args.set,
    commit: args.commit,
    runUrl: args['run-url'],
    capturedIn,
    mainDir: args['main-dir'],
  });
  const tree = (dir) => `https://github.com/${REPO}/tree/${BRANCH}/${dir}`;
  const verb = result.status === 'published' ? 'published' : 'already on the branch';
  const pointer = result.latest
    ? `now [\`${LATEST_DIR}/\`](${tree(LATEST_DIR)})`
    : `[\`${LATEST_DIR}/\`](${tree(LATEST_DIR)}) stays at \`${result.previous.set}\` (\`${args.commit.slice(0, 7)}\` is behind \`${result.previous.commit.slice(0, 7)}\` on main)`;
  const origin = capturedIn
    ? `, promoted from [the verified PR run](${capturedIn}) (same tree; this run captured nothing)`
    : '';
  summary(
    `Screenshot reference ${verb}: [\`${args.set}\`](${tree(args.set)}), ${result.images} images, ${pointer}${origin}.`,
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
    if (argv[2] === 'adopt') {
      // A crash here (bad arguments, no REPO) is a workflow bug, not a miss:
      // the step treats any status but 0 as "capture", with a warning.
      stderr.write(`::warning::screenshot set not adopted: ${e.message}\n`);
    } else {
      // The job runs with continue-on-error, so the main run stays green; the
      // annotation and the summary line keep the miss visible.
      stderr.write(`::error::screenshot reference not published: ${e.message}\n`);
      summary(
        `Screenshot reference **not published**: ${e.message}. The previous \`latest/\` stays.`,
      );
    }
    process.exitCode = 1;
  }
}
