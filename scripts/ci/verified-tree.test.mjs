// Tests for scripts/ci/verified-tree.mjs. node:test, not vitest: the
// detect-changes job runs them before it trusts the script, and it has no
// node_modules. Run locally with `pnpm test:ci-scripts`.
//
// API responses are fixtures shaped like GitHub's REST answers; git is real,
// in a throwaway repo, because the check reads trees and parents from it.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { env as processEnv } from 'node:process';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { BOT_SUBJECT, checkVerifiedTree, recordVerifiedTree } from './verified-tree.mjs';

const REPO = 'IIxauII/hnch';
const PR_HEAD = 'a'.repeat(40);
const RUN_ID = 4242;
const RUN_URL = `https://github.com/${REPO}/actions/runs/${RUN_ID}`;

const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A throwaway repo whose git ignores the developer's global config. */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'verified-tree-'));
  dirs.push(dir);
  const env = {
    ...processEnv,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-q', '-b', 'main');
  const commit = (subject, files = {}) => {
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', subject);
    return git('rev-parse', 'HEAD');
  };
  return { dir, env, git: (args) => git(...args), rawGit: git, commit };
}

/**
 * main: lastGreen ← squash (PR #7). The record says PR #7's run tested the
 * squash commit's tree on lastGreen, which is what a clean merge looks like.
 * Built once: nothing writes to it, and every repo costs a dozen git spawns.
 */
let clean;
function cleanMerge() {
  clean ??= buildCleanMerge();
  return clean;
}

function buildCleanMerge() {
  const repo = makeRepo();
  const lastGreen = repo.commit('feat(relay): earlier merge (#6)', { a: '1' });
  const sha = repo.commit('fix(cli): the merged PR (#7)', { b: '2' });
  const record = {
    tree: repo.rawGit('rev-parse', `${sha}^{tree}`),
    base: lastGreen,
    head: PR_HEAD,
    pr: 7,
  };
  return { ...repo, lastGreen, sha, record };
}

const pull = (sha, overrides = {}) => ({
  number: 7,
  merged_at: '2026-10-30T10:00:00Z',
  merge_commit_sha: sha,
  base: { ref: 'main', repo: { full_name: REPO } },
  head: { sha: PR_HEAD, repo: { full_name: REPO } },
  ...overrides,
});

const prRun = (overrides = {}) => ({
  id: RUN_ID,
  event: 'pull_request',
  status: 'completed',
  conclusion: 'success',
  head_sha: PR_HEAD,
  head_repository: { full_name: REPO },
  html_url: RUN_URL,
  ...overrides,
});

/** GitHub's answers for a clean merge; pass overrides per endpoint. */
function api(sha, { pulls, runs, artifacts } = {}) {
  const routes = {
    [`repos/${REPO}/commits/${sha}/pulls`]: pulls ?? [pull(sha)],
    [`repos/${REPO}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${PR_HEAD}&status=completed&per_page=20`]:
      { workflow_runs: runs ?? [prRun()] },
    [`repos/${REPO}/actions/runs/${RUN_ID}/artifacts?name=verified-tree`]: {
      artifacts: artifacts ?? [{ id: 1, name: 'verified-tree', expired: false }],
    },
  };
  const answer = (path) => {
    if (!(path in routes)) throw new Error(`unexpected API call: ${path}`);
    if (routes[path] instanceof Error) throw routes[path];
    return routes[path];
  };
  answer.routes = routes;
  return answer;
}

describe('checkVerifiedTree', () => {
  it('verifies a clean squash merge of a PR whose run was green', () => {
    const { git, lastGreen, sha, record } = cleanMerge();
    const result = checkVerifiedTree({
      repo: REPO,
      sha,
      lastGreen,
      gh: api(sha),
      git,
      download: () => record,
    });
    assert.deepEqual(result, {
      verified: true,
      pr: 7,
      runId: RUN_ID,
      runUrl: RUN_URL,
      tree: record.tree,
    });
  });

  // The PR run tested its head merged into an older main; the squash commit
  // has that change on a newer main, a tree no run has tested.
  it('runs the lanes when main moved after the PR run', () => {
    const { git, commit, rawGit } = makeRepo();
    const lastGreen = commit('feat(relay): earlier merge (#6)', { a: '1' });
    const testedTree = rawGit('rev-parse', 'HEAD^{tree}');
    commit('feat(client): a merge after the PR run (#8)', { c: '3' });
    const sha = commit('fix(cli): the merged PR (#7)', { b: '2' });
    const record = { tree: testedTree, base: lastGreen, head: PR_HEAD, pr: 7 };
    const result = checkVerifiedTree({
      repo: REPO,
      sha,
      lastGreen,
      gh: api(sha),
      git,
      download: () => record,
    });
    assert.equal(result.verified, false);
    assert.equal(result.warning, false);
    assert.match(result.reason, /tree/);
  });

  it('runs the lanes when the PR run tested on a different base', () => {
    const { git, lastGreen, sha, record } = cleanMerge();
    const result = checkVerifiedTree({
      repo: REPO,
      sha,
      lastGreen,
      gh: api(sha),
      git,
      download: () => ({ ...record, base: 'b'.repeat(40) }),
    });
    assert.equal(result.verified, false);
    assert.equal(result.warning, false);
    assert.match(result.reason, /base/);
  });

  // Main went red at #8; the PR run tested on top of it, but this main run
  // must still run #8's lanes, which the PR run may not have picked.
  it('runs the lanes when a merge since the last green main run is untested', () => {
    const { git, commit, rawGit } = makeRepo();
    const lastGreen = commit('feat(relay): earlier merge (#6)', { a: '1' });
    const red = commit('feat(client): a merge whose main run went red (#8)', { c: '3' });
    const sha = commit('fix(cli): the merged PR (#7)', { b: '2' });
    const record = { tree: rawGit('rev-parse', `${sha}^{tree}`), base: red, head: PR_HEAD, pr: 7 };
    const result = checkVerifiedTree({
      repo: REPO,
      sha,
      lastGreen,
      gh: api(sha),
      git,
      download: () => record,
    });
    assert.equal(result.verified, false);
    assert.equal(result.warning, false);
    assert.match(result.reason, new RegExp(red.slice(0, 12)));
  });

  it('verifies across the [skip ci] bot commits since the last green main run', () => {
    const { git, commit, rawGit } = makeRepo();
    const lastGreen = commit('feat(relay): earlier merge (#6)', { a: '1' });
    commit('chore(release): relay-v1.4.0 [skip ci]', { v: '1.4.0' });
    const bot = commit('chore(release): client-v1.47.0 [skip ci]', { c: '1.47.0' });
    const sha = commit('fix(cli): the merged PR (#7)', { b: '2' });
    const record = { tree: rawGit('rev-parse', `${sha}^{tree}`), base: bot, head: PR_HEAD, pr: 7 };
    const result = checkVerifiedTree({
      repo: REPO,
      sha,
      lastGreen,
      gh: api(sha),
      git,
      download: () => record,
    });
    assert.equal(result.verified, true);
  });

  it('does not count a human commit that only mentions [skip ci] in its subject as a bot commit', () => {
    const { git, commit, rawGit } = makeRepo();
    const lastGreen = commit('feat(relay): earlier merge (#6)', { a: '1' });
    const human = commit('docs(docs): explain [skip ci] (#8)', { d: '1' });
    const sha = commit('fix(cli): the merged PR (#7)', { b: '2' });
    const record = {
      tree: rawGit('rev-parse', `${sha}^{tree}`),
      base: human,
      head: PR_HEAD,
      pr: 7,
    };
    const result = checkVerifiedTree({
      repo: REPO,
      sha,
      lastGreen,
      gh: api(sha),
      git,
      download: () => record,
    });
    assert.equal(result.verified, false);
  });

  /** Runs the clean-merge check with one endpoint's answer replaced. */
  function checkWith(overrides, download) {
    const { git, lastGreen, sha, record } = cleanMerge();
    return checkVerifiedTree({
      repo: REPO,
      sha,
      lastGreen,
      gh: api(sha, typeof overrides === 'function' ? overrides(sha) : overrides),
      git,
      download: download ?? (() => record),
    });
  }

  const assertMiss = (result, reason) => {
    assert.equal(result.verified, false);
    assert.equal(result.warning, false, result.reason);
    assert.match(result.reason, reason);
  };

  it('runs the lanes for a direct push, which has no PR', () => {
    assertMiss(checkWith({ pulls: [] }), /no merged PR/);
  });

  it('ignores PRs that merely contain the commit', () => {
    assertMiss(
      checkWith((sha) => ({
        pulls: [pull(sha, { merge_commit_sha: 'c'.repeat(40) }), pull(sha, { merged_at: null })],
      })),
      /no merged PR/,
    );
  });

  it('runs the lanes when several PRs claim the commit', () => {
    assertMiss(
      checkWith((sha) => ({ pulls: [pull(sha), pull(sha, { number: 9 })] })),
      /2 merged PRs/,
    );
  });

  // CI skips the lanes and e2e on fork PRs, so their green run tested nothing.
  it('runs the lanes for a PR from a fork', () => {
    assertMiss(
      checkWith((sha) => ({
        pulls: [pull(sha, { head: { sha: PR_HEAD, repo: { full_name: 'someone/hnch' } } })],
      })),
      /fork/,
    );
  });

  it('runs the lanes when the PR head has no completed CI run', () => {
    assertMiss(checkWith({ runs: [] }), /no completed CI run/);
  });

  // A re-run that went red overrules the green run before it.
  it('takes the newest completed run, not the newest green one', () => {
    assertMiss(
      checkWith({ runs: [prRun(), prRun({ id: RUN_ID + 1, conclusion: 'failure' })] }),
      /failure/,
    );
  });

  it('takes the newest green run when an older one failed', () => {
    const result = checkWith({
      runs: [prRun({ id: RUN_ID - 1, conclusion: 'failure' }), prRun()],
    });
    assert.equal(result.verified, true);
  });

  it('runs the lanes when the recorded tree has expired', () => {
    assertMiss(
      checkWith({ artifacts: [{ id: 1, name: 'verified-tree', expired: true }] }),
      /expired/,
    );
  });

  // The PR run uploads this marker when its checkout was not head merged onto
  // the event's base: a known case, not breakage, so no warning.
  it('runs the lanes without a warning when the PR run said it could not record', () => {
    assertMiss(
      checkWith({}, () => ({
        unrecorded: 'not the merge of the head onto the base',
        head: PR_HEAD,
        pr: 7,
      })),
      /recorded no tree: not the merge/,
    );
  });

  // From here on something broke rather than missed: the run must not skip,
  // and the warning puts the cause on the run summary.
  const assertWarning = (result, reason) => {
    assert.equal(result.verified, false);
    assert.equal(result.warning, true, result.reason);
    assert.match(result.reason, reason);
  };

  // Every green same-repo PR run uploads one, so its absence is a fault.
  it('warns when a green PR run recorded no tree', () => {
    assertWarning(checkWith({ artifacts: [] }), /no verified-tree artifact/);
  });

  it('warns when the record is for another head', () => {
    const { record } = cleanMerge();
    assertWarning(
      checkWith({}, () => ({ ...record, head: 'd'.repeat(40) })),
      /record/,
    );
  });

  it('warns when the record is malformed', () => {
    assertWarning(
      checkWith({}, () => ({ tree: 'not-a-sha' })),
      /record/,
    );
  });

  it('warns when an API call fails', () => {
    assertWarning(checkWith({ pulls: new Error('HTTP 502') }), /HTTP 502/);
  });

  it('warns when the download fails', () => {
    assertWarning(
      checkWith({}, () => {
        throw new Error('no valid artifacts found to download');
      }),
      /no valid artifacts/,
    );
  });

  it('warns when git cannot resolve the last green main run', () => {
    const { git, sha, record } = cleanMerge();
    const result = checkVerifiedTree({
      repo: REPO,
      sha,
      lastGreen: 'e'.repeat(40),
      gh: api(sha),
      git,
      download: () => record,
    });
    assertWarning(result, /git/);
  });
});

const failingGit = () => {
  throw new Error('fatal: not a git repository');
};

describe('recordVerifiedTree', () => {
  /** What actions/checkout gives a PR run: refs/pull/N/merge, base first. */
  function mergeRef() {
    const repo = makeRepo();
    repo.commit('feat(relay): earlier merge (#6)', { a: '1' });
    repo.rawGit('checkout', '-q', '-b', 'pr');
    const head = repo.commit('fix(cli): the PR', { b: '2' });
    repo.rawGit('checkout', '-q', 'main');
    const base = repo.commit('feat(client): main moved on (#8)', { c: '3' });
    repo.rawGit('merge', '-q', '--no-ff', '-m', 'Merge pr into main', 'pr');
    return { ...repo, head, base };
  }

  it('records the merge tree, the base it was tested on and the PR head', () => {
    const { git, rawGit, head, base } = mergeRef();
    assert.deepEqual(recordVerifiedTree({ git, head, base, pr: 7 }), {
      tree: rawGit('rev-parse', 'HEAD^{tree}'),
      base,
      head,
      pr: 7,
    });
  });

  it('records nothing when the checkout is not a merge of the PR head', () => {
    const { git, base } = mergeRef();
    assert.equal(recordVerifiedTree({ git, head: PR_HEAD, base, pr: 7 }), null);
  });

  // The run picked its lanes by diffing from the event's base. Merged onto a
  // base that main moved past with a human commit, its lane choice need not
  // cover the squash commit.
  it('records nothing when the merge is onto another base than the run diffed from', () => {
    const { git, rawGit, head } = mergeRef();
    const eventBase = rawGit('rev-parse', 'HEAD^1^');
    assert.equal(recordVerifiedTree({ git, head, base: eventBase, pr: 7 }), null);
  });

  // A crash would turn the PR run red; no record, with the reason, is safe.
  it('records nothing, without throwing, when git cannot resolve the event base', () => {
    const { git, head } = mergeRef();
    const result = recordVerifiedTree({ git, head, base: PR_HEAD, pr: 7 });
    assert.equal(result.tree, undefined);
    assert.match(result.error, /^git failed: /);
  });

  it('records nothing, without throwing, when git fails outright', () => {
    const result = recordVerifiedTree({ git: failingGit, head: PR_HEAD, base: PR_HEAD, pr: 7 });
    assert.deepEqual(result, { error: 'git failed: fatal: not a git repository' });
  });
});

describe('recordVerifiedTree on a stale event base', () => {
  /**
   * The event's base goes stale: the bot's [skip ci] commits land on main
   * without touching the PR, so GitHub keeps the old base.sha but builds
   * refs/pull/N/merge on the newer main tip. `landed` are the subjects of
   * the commits between the two.
   */
  function mergeOnStaleBase(landed) {
    const repo = makeRepo();
    const eventBase = repo.commit('feat(relay): earlier merge (#6)', { a: '1' });
    repo.rawGit('checkout', '-q', '-b', 'pr');
    const head = repo.commit('fix(cli): the PR', { b: '2' });
    repo.rawGit('checkout', '-q', 'main');
    landed.forEach((subject, i) => repo.commit(subject, { [`s${i}`]: 'png' }));
    const tip = repo.rawGit('rev-parse', 'HEAD');
    repo.rawGit('merge', '-q', '--no-ff', '-m', 'Merge pr into main', 'pr');
    return { ...repo, head, eventBase, tip };
  }

  // The lane diff from the stale base left out only the bot's commits, which
  // no lane counts, so the run's lane choice covers the merge on the new tip.
  it('records the newer main tip as the base when only bot commits landed after the event base', () => {
    const { git, rawGit, head, eventBase, tip } = mergeOnStaleBase([
      'chore(release): client-v1.47.0 [skip ci]',
      'chore(release): relay-v1.4.0 [skip ci]',
    ]);
    assert.deepEqual(recordVerifiedTree({ git, head, base: eventBase, pr: 7 }), {
      tree: rawGit('rev-parse', 'HEAD^{tree}'),
      base: tip,
      head,
      pr: 7,
    });
  });

  it('records nothing when a human commit landed after the event base', () => {
    const { git, head, eventBase } = mergeOnStaleBase([
      'chore(release): client-v1.47.0 [skip ci]',
      'feat(client): main moved on (#8)',
    ]);
    assert.equal(recordVerifiedTree({ git, head, base: eventBase, pr: 7 }), null);
  });

  it('records nothing when the event base is not an ancestor of the merged main tip', () => {
    const { git, head } = mergeOnStaleBase(['chore(release): client-v1.47.0 [skip ci]']);
    assert.equal(recordVerifiedTree({ git, head, base: head, pr: 7 }), null);
  });
});

// ci.yml's lane diff and release.yml's fast-forward skip the same bot commits
// in bash; a drift would let one count a commit the others skip.
describe('BOT_SUBJECT', () => {
  for (const workflow of ['ci.yml', 'release.yml']) {
    it(`matches the pattern in ${workflow}`, () => {
      const path = join(import.meta.dirname, '../../.github/workflows', workflow);
      const found = [...readFileSync(path, 'utf8').matchAll(/BOT_SUBJECT='([^']+)'/g)].map(
        (m) => m[1],
      );
      assert.ok(found.length > 0, `no BOT_SUBJECT in ${workflow}`);
      for (const pattern of found) assert.equal(pattern, BOT_SUBJECT.source);
    });
  }
});

describe('CLI', () => {
  const script = join(import.meta.dirname, 'verified-tree.mjs');

  /**
   * A stand-in for the gh CLI: `gh api <path>` answers from the routes,
   * anything else in them fails like an HTTP error, and `gh run download`
   * writes the record where the real one unpacks the artifact.
   */
  function fakeGh(routes, record) {
    const bin = mkdtempSync(join(tmpdir(), 'fake-gh-'));
    dirs.push(bin);
    const fixtures = join(bin, 'fixtures.json');
    writeFileSync(fixtures, JSON.stringify({ routes, record }));
    const gh = join(bin, 'gh');
    writeFileSync(
      gh,
      `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { routes, record } = JSON.parse(readFileSync(${JSON.stringify(fixtures)}, 'utf8'));
const [cmd, sub, ...rest] = process.argv.slice(2);
if (cmd === 'api' && sub in routes) {
  process.stdout.write(JSON.stringify(routes[sub]));
} else if (cmd === 'run' && sub === 'download') {
  writeFileSync(join(rest[rest.indexOf('--dir') + 1], 'verified-tree.json'), JSON.stringify(record));
} else {
  process.stderr.write('gh: HTTP 502 for ' + process.argv.slice(2).join(' ') + '\\n');
  process.exit(1);
}
`,
    );
    chmodSync(gh, 0o755);
    return bin;
  }

  function run(repo, args, { routes, record }) {
    const dir = mkdtempSync(join(tmpdir(), 'summary-'));
    dirs.push(dir);
    const summary = join(dir, 'summary.md');
    const output = join(dir, 'output.txt');
    writeFileSync(summary, '');
    writeFileSync(output, '');
    const bin = fakeGh(routes, record);
    const result = spawnSync('node', [script, ...args], {
      cwd: repo.dir,
      env: {
        ...repo.env,
        PATH: `${bin}:${processEnv.PATH}`,
        REPO,
        GITHUB_STEP_SUMMARY: summary,
        GITHUB_OUTPUT: output,
      },
      encoding: 'utf8',
    });
    return {
      ...result,
      summary: readFileSync(summary, 'utf8'),
      output: readFileSync(output, 'utf8'),
    };
  }

  it('exits 0 and names the verifying PR run in the step summary', () => {
    const merge = cleanMerge();
    const out = run(merge, ['check', merge.sha, merge.lastGreen], {
      routes: api(merge.sha).routes,
      record: merge.record,
    });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.summary, /PR #7/);
    assert.ok(out.summary.includes(RUN_URL), out.summary);
  });

  // The screenshot promotion step (#598) reads the verifying run from the
  // step's outputs; a run that is not verified writes none.
  it('writes the verifying run to GITHUB_OUTPUT, and nothing on a miss', () => {
    const merge = cleanMerge();
    const verified = run(merge, ['check', merge.sha, merge.lastGreen], {
      routes: api(merge.sha).routes,
      record: merge.record,
    });
    assert.equal(verified.status, 0, verified.stdout + verified.stderr);
    assert.equal(verified.output, `verified-run-id=${RUN_ID}\nverified-run-url=${RUN_URL}\n`);

    const miss = run(merge, ['check', merge.sha, merge.lastGreen], {
      routes: api(merge.sha, { pulls: [] }).routes,
      record: merge.record,
    });
    assert.equal(miss.status, 3);
    assert.equal(miss.output, '');
  });

  it('exits 3 with the reason for a plain mismatch', () => {
    const merge = cleanMerge();
    const out = run(merge, ['check', merge.sha, merge.lastGreen], {
      routes: api(merge.sha, { pulls: [] }).routes,
      record: merge.record,
    });
    assert.equal(out.status, 3, out.stdout + out.stderr);
    assert.match(out.stdout, /no merged PR/);
    assert.doesNotMatch(out.stdout, /::warning::/);
    assert.equal(out.summary, '');
  });

  it('exits 3 with a ::warning:: annotation when the lookup fails', () => {
    const merge = cleanMerge();
    const { routes } = api(merge.sha);
    delete routes[`repos/${REPO}/commits/${merge.sha}/pulls`];
    const out = run(merge, ['check', merge.sha, merge.lastGreen], { routes, record: merge.record });
    assert.equal(out.status, 3, out.stdout + out.stderr);
    assert.match(out.stdout, /^::warning::.*HTTP 502/m);
  });

  it('records the merge checkout to the given file', () => {
    const repo = makeRepo();
    repo.commit('feat(relay): earlier merge (#6)', { a: '1' });
    repo.rawGit('checkout', '-q', '-b', 'pr');
    const head = repo.commit('fix(cli): the PR', { b: '2' });
    repo.rawGit('checkout', '-q', 'main');
    const base = repo.rawGit('rev-parse', 'HEAD');
    repo.rawGit('merge', '-q', '--no-ff', '-m', 'Merge pr into main', 'pr');
    const file = join(repo.dir, 'out', 'verified-tree.json');
    const out = spawnSync('node', [script, 'record', file], {
      cwd: repo.dir,
      env: { ...repo.env, PR_HEAD_SHA: head, PR_BASE_SHA: base, PR_NUMBER: '7' },
      encoding: 'utf8',
    });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    const record = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(record.head, head);
    assert.equal(record.pr, 7);
    assert.equal(record.tree, repo.rawGit('rev-parse', 'HEAD^{tree}'));
  });

  it('writes an unrecorded marker, not a tree, when the checkout is not the merge', () => {
    const repo = makeRepo();
    const base = repo.commit('feat(relay): earlier merge (#6)', { a: '1' });
    const file = join(repo.dir, 'out', 'verified-tree.json');
    const out = spawnSync('node', [script, 'record', file], {
      cwd: repo.dir,
      env: { ...repo.env, PR_HEAD_SHA: PR_HEAD, PR_BASE_SHA: base, PR_NUMBER: '7' },
      encoding: 'utf8',
    });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    const record = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(record.tree, undefined);
    assert.equal(record.head, PR_HEAD);
    assert.match(record.unrecorded, /not the merge/);
    assert.doesNotMatch(out.stdout, /::warning::/);
  });

  // Git breaking is not the known stale-base case: say so, and warn on the
  // PR run, so verified-skip does not switch off unnoticed.
  it('writes the git error into the marker and warns when git fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'not-a-repo-'));
    dirs.push(dir);
    const file = join(dir, 'out', 'verified-tree.json');
    const out = spawnSync('node', [script, 'record', file], {
      cwd: dir,
      env: {
        ...processEnv,
        GIT_CEILING_DIRECTORIES: tmpdir(),
        PR_HEAD_SHA: PR_HEAD,
        PR_BASE_SHA: PR_HEAD,
        PR_NUMBER: '7',
      },
      encoding: 'utf8',
    });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /^::warning::Recording no tree: git failed: /m);
    const record = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(record.tree, undefined);
    assert.match(record.unrecorded, /^git failed: /);
  });
});
