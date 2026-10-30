#!/usr/bin/env node
// Verified-skip (ADR-0055): a main push run may pass on the evidence of a
// green PR run that tested the identical tree on the identical base.
//
//   node scripts/ci/verified-tree.mjs record <out-file>      (PR runs)
//   node scripts/ci/verified-tree.mjs check <sha> <last-green-sha>   (main)
//
// record reads PR_HEAD_SHA, PR_BASE_SHA and PR_NUMBER and writes the record
// the PR run uploads as the verified-tree artifact. check reads REPO and
// exits 0 when the push is verified (and appends to GITHUB_STEP_SUMMARY), 3
// when it is not; it prints the reason, as a ::warning:: when a lookup failed.
// Any other exit status is a crash, which the caller treats as not verified.
//
// Pure Node plus the gh and git CLIs, no dependencies: detect-changes does not
// install node_modules.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process, { argv, env, stderr, stdout } from 'node:process';

/**
 * The bot's [skip ci] commits (semantic-release bumps, screenshot refreshes),
 * matched on the subject only. Same pattern as BOT_SUBJECT in ci.yml and
 * release.yml; a test keeps the three in step.
 */
export const BOT_SUBJECT = /^chore\((release|screenshots)\): .*\[skip ci\]$/;

/** The artifact a PR run uploads from detect-changes. */
export const ARTIFACT = 'verified-tree';

const SHA = /^[0-9a-f]{40}$/;

/** A plain mismatch: the run tests as it did before verified-skip. */
const miss = (reason) => ({ verified: false, warning: false, reason });

/** Something broke. The run tests as before, and says so on its summary. */
const fault = (reason) => ({ verified: false, warning: true, reason });

/**
 * Decides whether the main push of `sha` was already verified by a PR run.
 * Only `verified: true` lets the run skip; every error, of the API, the
 * download or git, comes back as a warning and never as a skip.
 *
 * @param {{
 *   repo: string,            // owner/name
 *   sha: string,             // the pushed commit on main
 *   lastGreen: string,       // head of the last green main push run
 *   gh: (path: string) => any,          // GET the REST path, parsed JSON
 *   git: (args: string[]) => string,    // stdout, trimmed
 *   download: (runId: number) => any,   // the run's parsed record
 * }} input
 * @returns {{ verified: true, pr: number, runUrl: string, tree: string }
 *   | { verified: false, warning: boolean, reason: string }}
 */
export function checkVerifiedTree(input) {
  try {
    return lookup(input);
  } catch (err) {
    return fault(`verified-tree lookup failed: ${err.message.split('\n')[0]}`);
  }
}

function lookup({ repo, sha, lastGreen, gh, git, download }) {
  const found = findVerifyingRun({ repo, sha, gh, download });
  if (!found.record) return found;
  return compareWithMain({ sha, lastGreen, git, ...found });
}

/**
 * The record of the green PR run that could vouch for `sha`, with its PR and
 * run; or the miss or fault that rules one out.
 */
function findVerifyingRun({ repo, sha, gh, download }) {
  // A squash merge's commit is the PR's merge_commit_sha. Other PRs listed
  // for the commit only contain it.
  const merged = gh(`repos/${repo}/commits/${sha}/pulls`).filter(
    (p) => p.merged_at && p.merge_commit_sha === sha,
  );
  if (merged.length === 0)
    return miss('no merged PR has this commit as its merge commit (a direct push?)');
  if (merged.length > 1)
    return miss(`${merged.length} merged PRs have this commit as their merge commit`);
  const [pr] = merged;
  if (pr.head.repo?.full_name !== repo) {
    return miss(`PR #${pr.number} comes from a fork; CI runs no lane or e2e for fork PRs`);
  }
  const head = pr.head.sha;
  const { workflow_runs: runs } = gh(
    `repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}&status=completed&per_page=20`,
  );
  // Newest by id: a later run for the same head (a reopen, a manual run)
  // overrules an earlier one, and a re-run keeps its id and reports its
  // latest attempt.
  const run = runs
    .filter((r) => r.head_sha === head && r.head_repository?.full_name === repo)
    .toSorted((a, b) => b.id - a.id)[0];
  if (!run) return miss(`PR #${pr.number}'s head ${head} has no completed CI run`);
  if (run.conclusion !== 'success') {
    return miss(`PR #${pr.number}'s newest CI run ${run.html_url} concluded ${run.conclusion}`);
  }
  const { artifacts } = gh(`repos/${repo}/actions/runs/${run.id}/artifacts?name=${ARTIFACT}`);
  if (artifacts.length === 0) {
    return fault(`PR #${pr.number}'s green run ${run.html_url} has no ${ARTIFACT} artifact`);
  }
  if (artifacts.every((a) => a.expired)) {
    return miss(`the ${ARTIFACT} artifact of ${run.html_url} has expired`);
  }
  const record = download(run.id);
  if (record?.head === head && typeof record.unrecorded === 'string') {
    return miss(
      `PR #${pr.number}'s green run ${run.html_url} recorded no tree: ${record.unrecorded}`,
    );
  }
  if (
    ![record?.tree, record?.base, record?.head].every((v) => SHA.test(v)) ||
    record.head !== head
  ) {
    return fault(
      `the ${ARTIFACT} record of ${run.html_url} is malformed or for another head than ${head}`,
    );
  }
  return { pr, run, record };
}

/** Whether the pushed commit is the tree and base the PR run tested. */
function compareWithMain({ sha, lastGreen, git, pr, run, record }) {
  const tree = git(['rev-parse', `${sha}^{tree}`]);
  if (tree !== record.tree) {
    return miss(
      `tree ${tree} differs from the tree PR #${pr.number}'s run tested (${record.tree}); main moved after that run`,
    );
  }
  const parent = git(['rev-parse', `${sha}^1`]);
  if (parent !== record.base) {
    return miss(
      `PR #${pr.number}'s run tested on base ${record.base}, but this commit's parent is ${parent}`,
    );
  }
  // The PR run picked its lanes from the PR's own diff. That covers what this
  // run would pick only if every commit since the last green main run, other
  // than this one, is a bot commit that no lane counts.
  const between = git(['log', '--format=%H %s', `${lastGreen}..${parent}`]);
  for (const line of between.split('\n').filter(Boolean)) {
    const [commit, ...words] = line.split(' ');
    if (!BOT_SUBJECT.test(words.join(' '))) {
      return miss(
        `${commit.slice(0, 12)} landed since the last green main run (${lastGreen.slice(0, 12)}) and is not a [skip ci] bot commit`,
      );
    }
  }
  return { verified: true, pr: pr.number, runUrl: run.html_url, tree };
}

/**
 * What a PR run records: the tree of the merge it checked out, the base tip
 * that merge was made on (its first parent), and the PR head (its second).
 *
 * The run's lane diff starts from the event's `base`, which goes stale when
 * the bot's [skip ci] commits land on main: they do not update the PR, but
 * GitHub builds the merge on the newer tip. The first parent may therefore
 * be ahead of `base` by bot commits only, which no lane counts, so the lanes
 * the run picked still cover the merge.
 *
 * Null when the checkout is not such a merge of `head`; the CLI then uploads
 * an `unrecorded` marker instead, so a main run misses without a warning.
 * Never throws on a git error: a crash here would fail the PR run.
 *
 * @param {{ git: (args: string[]) => string, head: string, base: string, pr: number }} input
 */
export function recordVerifiedTree({ git, head, base, pr }) {
  const parents = git(['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ').slice(1);
  if (parents.length !== 2 || parents[1] !== head) return null;
  if (parents[0] !== base && !onlyBotCommitsBetween(git, base, parents[0])) return null;
  return { tree: git(['rev-parse', 'HEAD^{tree}']), base: parents[0], head, pr };
}

/** Whether `tip` is `base` plus [skip ci] bot commits; false on any git error. */
function onlyBotCommitsBetween(git, base, tip) {
  try {
    if (git(['merge-base', base, tip]) !== base) return false;
    return git(['log', '--format=%s', `${base}..${tip}`])
      .split('\n')
      .every((subject) => BOT_SUBJECT.test(subject));
  } catch {
    return false;
  }
}

// --- CLI: the adapters over the real gh and git ---------------------------

const run = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  }).trim();

/** execFileSync's message is the command line; gh's own error is on stderr. */
function withStderr(fn) {
  try {
    return fn();
  } catch (err) {
    throw new Error(`${err.message.split('\n')[0]}: ${String(err.stderr ?? '').trim()}`, {
      cause: err,
    });
  }
}

const git = (args) => run('git', args);

const gh = (path) => withStderr(() => JSON.parse(run('gh', ['api', path])));

/** `gh run download --name` unpacks the artifact's files straight into --dir. */
function downloadFrom(repo) {
  return (runId) => {
    const dir = mkdtempSync(join(tmpdir(), `${ARTIFACT}-`));
    try {
      const args = ['run', 'download', String(runId), '--repo', repo, '--name', ARTIFACT];
      withStderr(() => run('gh', [...args, '--dir', dir]));
      return JSON.parse(readFileSync(join(dir, `${ARTIFACT}.json`), 'utf8'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function checkCommand(sha, lastGreen) {
  const repo = env.REPO;
  const download = downloadFrom(repo);
  const result = checkVerifiedTree({ repo, sha, lastGreen, git, gh, download });
  if (!result.verified) {
    const line = `Not verified by a PR run: ${result.reason}. Running the lanes for the changes since the last green main run.`;
    stdout.write(result.warning ? `::warning::${line}\n` : `${line}\n`);
    return 3;
  }
  stdout.write(
    `Verified by PR #${result.pr}'s CI run ${result.runUrl} (tree ${result.tree}); no lane or e2e runs.\n`,
  );
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      [
        '### Verified by a PR run',
        '',
        `[PR #${result.pr}'s CI run](${result.runUrl}) tested this commit's tree (\`${result.tree}\`) on the same base, after the last green main run. No package lane and no e2e ran in this run (ADR-0055).`,
        '',
      ].join('\n'),
    );
  }
  return 0;
}

function recordCommand(file) {
  const head = env.PR_HEAD_SHA;
  const base = env.PR_BASE_SHA;
  const pr = Number(env.PR_NUMBER);
  const result = recordVerifiedTree({ git, head, base, pr });
  mkdirSync(dirname(file), { recursive: true });
  if (!result) {
    // A marker, not nothing: a green run with no artifact at all reads as
    // breakage on main and warns.
    const unrecorded = `the checkout is not the merge of ${head} onto ${base} or onto ${base} plus [skip ci] bot commits`;
    writeFileSync(file, `${JSON.stringify({ unrecorded, head, pr }, null, 2)}\n`);
    stdout.write(`Recording no tree: ${unrecorded}.\n`);
    return 0;
  }
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  stdout.write(
    `Recorded tree ${result.tree} on base ${result.base} for PR #${result.pr} (head ${head}).\n`,
  );
  return 0;
}

if (argv[1] === import.meta.filename) {
  const [mode, ...args] = argv.slice(2);
  // exitCode, not exit(): exit() can cut off stdout written to a pipe.
  if (mode === 'check' && args.length === 2) process.exitCode = checkCommand(args[0], args[1]);
  else if (mode === 'record' && args.length === 1) process.exitCode = recordCommand(args[0]);
  else {
    stderr.write('usage: verified-tree.mjs check <sha> <last-green-sha> | record <out-file>\n');
    process.exitCode = 2;
  }
}
