// Tests for scripts/ci/screenshots-reference.mjs. node:test, not vitest: the
// detect-changes job runs them before the script is trusted with a push, and
// it has no node_modules. Run locally with `pnpm test:ci-scripts`.
//
// Every test publishes into a throwaway bare repo standing in for origin,
// then reads the `screenshots` branch back from it: what the next consumer
// (a PR diff comment, an agent following a latest/ link) would see.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env as processEnv } from 'node:process';
import { after, describe, it } from 'node:test';
import { BRANCH, publishReference } from './screenshots-reference.mjs';

const SET = 'sha-abc1234';
const COMMIT = 'c'.repeat(40);
const RUN_URL = 'https://github.com/IIxauII/hnch/actions/runs/4242';

const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const env = {
  ...processEnv,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

const tmp = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();

/** Writes `files` (path → content) under `root`, creating directories. */
function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
}

/**
 * A bare repo standing in for origin, with a `screenshots` branch like
 * today's: a README, one PR capture, and an older reference set under
 * latest/ holding a scene the new set no longer has.
 */
function makeOrigin() {
  const bare = tmp('screenshots-origin-');
  git(bare, 'init', '-q', '--bare', '-b', BRANCH);
  // Partial clones (the workflow's blob:none checkout) need this on the server.
  git(bare, 'config', 'uploadpack.allowFilter', 'true');
  const seed = tmp('screenshots-seed-');
  git(seed, 'init', '-q', '-b', BRANCH);
  writeTree(seed, {
    'README.md': '# old readme\n',
    'sha-pr00001/baseline/01-home.png': 'pr capture',
    'latest/baseline/01-home.png': 'old home',
    'latest/baseline/99-gone.png': 'scene removed since',
    'latest.json': `${JSON.stringify({ set: 'sha-old0000', commit: 'o'.repeat(40), run: 'x' })}\n`,
  });
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'screenshots: PR #1 @ sha-pr00001');
  git(seed, 'push', '-q', bare, `HEAD:${BRANCH}`);
  return bare;
}

/** The workflow's checkout of the branch: one commit, no history. */
function cloneBranch(origin, ...extra) {
  const dir = tmp('screenshots-branch-');
  git(
    dir,
    'clone',
    '-q',
    '--branch',
    BRANCH,
    '--single-branch',
    '--depth',
    '1',
    ...extra,
    origin,
    '.',
  );
  return dir;
}

/** The downloaded artifact: the capture's files, no sha-<short>/ parent. */
function makeSet(files = { 'baseline/01-home.png': 'new home', 'reveal/02-after.png': 'reveal' }) {
  const dir = tmp('screenshots-set-');
  writeTree(dir, files);
  return dir;
}

const treeOf = (origin) => git(origin, 'ls-tree', '-r', '--name-only', BRANCH).split('\n');
const fileOn = (origin, path) => git(origin, 'show', `${BRANCH}:${path}`);

const publish = (branchDir, setDir, overrides = {}) =>
  publishReference({
    branchDir,
    setDir,
    set: SET,
    commit: COMMIT,
    runUrl: RUN_URL,
    env,
    log: () => {},
    retryDelayMs: 0,
    ...overrides,
  });

/** A stand-in for main's checkout: two commits, older then newer. */
function makeMain() {
  const dir = tmp('screenshots-main-');
  git(dir, 'init', '-q', '-b', 'main');
  const commitOn = (name) => {
    writeFileSync(join(dir, name), name);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', name);
    return git(dir, 'rev-parse', 'HEAD');
  };
  const older = commitOn('older');
  const newer = commitOn('newer');
  return { dir, older, newer };
}

describe('publishReference', () => {
  it('publishes the set under sha-<short>/ and as latest/, with the pointer file', () => {
    const origin = makeOrigin();
    const result = publish(cloneBranch(origin), makeSet());

    assert.equal(result.status, 'published');
    assert.equal(result.latest, true);
    assert.deepEqual(result.previous, { set: 'sha-old0000', commit: 'o'.repeat(40) });
    assert.equal(result.images, 2);
    const tree = treeOf(origin);
    for (const path of [
      `${SET}/baseline/01-home.png`,
      `${SET}/reveal/02-after.png`,
      'latest/baseline/01-home.png',
      'latest/reveal/02-after.png',
      'latest.json',
      'README.md',
      'sha-pr00001/baseline/01-home.png',
    ]) {
      assert.ok(tree.includes(path), `${path} missing from ${tree.join(', ')}`);
    }
    assert.ok(!tree.includes('latest/baseline/99-gone.png'), 'latest/ still holds a removed scene');
    assert.equal(fileOn(origin, 'latest/baseline/01-home.png'), 'new home');
    assert.deepEqual(JSON.parse(fileOn(origin, 'latest.json')), {
      set: SET,
      commit: COMMIT,
      run: RUN_URL,
    });
    assert.equal(git(origin, 'log', '-1', '--format=%s', BRANCH), `screenshots: main @ ${SET}`);
    assert.equal(git(origin, 'log', '-1', '--format=%an', BRANCH), 'github-actions[bot]');
  });

  // A re-run of the job (or a second run for the same commit) adds no commit.
  it('publishes nothing when the branch already holds the set as latest/', () => {
    const origin = makeOrigin();
    const set = makeSet();
    const first = publish(cloneBranch(origin), set);
    const again = publish(cloneBranch(origin), set);

    assert.equal(again.status, 'unchanged');
    assert.equal(again.sha, first.sha);
    assert.equal(git(origin, 'rev-parse', BRANCH), first.sha);
  });

  // The hook publishes PR captures to the same branch at any time.
  it('retries on top of a push that landed meanwhile', () => {
    const origin = makeOrigin();
    const attempts = [];
    const result = publish(cloneBranch(origin), makeSet(), {
      beforePush: (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) pushPrCapture(origin, 'sha-pr00002');
      },
    });

    assert.equal(result.status, 'published');
    assert.deepEqual(attempts, [1, 2]);
    const tree = treeOf(origin);
    assert.ok(tree.includes('sha-pr00002/baseline/01-home.png'), 'the PR capture was lost');
    assert.ok(tree.includes(`${SET}/baseline/01-home.png`), 'the reference was lost');
    assert.equal(git(origin, 'log', '-1', '--format=%s', BRANCH), `screenshots: main @ ${SET}`);
  });

  it('gives up after the last attempt and leaves the branch as it was', () => {
    const origin = makeOrigin();
    let n = 0;
    assert.throws(
      () =>
        publish(cloneBranch(origin), makeSet(), {
          maxAttempts: 2,
          beforePush: () => pushPrCapture(origin, `sha-pr1000${++n}`),
        }),
      /rejected 2 times/,
    );
    assert.equal(
      git(origin, 'log', '-1', '--format=%s', BRANCH),
      'screenshots: PR #1 @ sha-pr10002',
    );
    assert.ok(!treeOf(origin).some((p) => p.startsWith(`${SET}/`)));
  });

  // A push that fails for another reason than a race is not cured by retrying.
  it('stops at once when the push fails for another reason than a race', () => {
    const origin = makeOrigin();
    const branchDir = cloneBranch(origin);
    const attempts = [];
    assert.throws(
      () =>
        publish(branchDir, makeSet(), {
          beforePush: (attempt) => {
            attempts.push(attempt);
            git(
              branchDir,
              'remote',
              'set-url',
              'origin',
              join(tmp('screenshots-gone-'), 'nowhere'),
            );
          },
        }),
      /push to screenshots failed/,
    );
    assert.deepEqual(attempts, [1]);
  });

  // A re-run of an older run's failed publish must not move latest/ back.
  describe('with main history', () => {
    it("adds an older commit's set without moving latest/ back", () => {
      const origin = makeOrigin();
      const main = makeMain();
      const newest = publish(cloneBranch(origin), makeSet(), {
        set: 'sha-bbbbbbb',
        commit: main.newer,
        mainDir: main.dir,
      });
      assert.equal(newest.latest, true);

      const older = publish(
        cloneBranch(origin),
        makeSet({ 'baseline/01-home.png': 'older home' }),
        { set: 'sha-aaaaaaa', commit: main.older, mainDir: main.dir },
      );

      assert.equal(older.status, 'published');
      assert.equal(older.latest, false);
      assert.deepEqual(older.previous, { set: 'sha-bbbbbbb', commit: main.newer });
      const tree = treeOf(origin);
      assert.ok(tree.includes('sha-aaaaaaa/baseline/01-home.png'), 'the older set was not added');
      assert.equal(fileOn(origin, 'latest/baseline/01-home.png'), 'new home');
      assert.equal(JSON.parse(fileOn(origin, 'latest.json')).commit, main.newer);
    });

    it('moves latest/ forward from an older commit, or one main does not know', () => {
      const origin = makeOrigin();
      const main = makeMain();
      // The seeded latest.json names a commit outside main's history.
      const first = publish(cloneBranch(origin), makeSet(), {
        set: 'sha-aaaaaaa',
        commit: main.older,
        mainDir: main.dir,
      });
      assert.equal(first.latest, true);
      const second = publish(
        cloneBranch(origin),
        makeSet({ 'baseline/01-home.png': 'newer home' }),
        {
          set: 'sha-bbbbbbb',
          commit: main.newer,
          mainDir: main.dir,
        },
      );
      assert.equal(second.latest, true);
      assert.equal(fileOn(origin, 'latest/baseline/01-home.png'), 'newer home');
    });
  });

  // A capture that wrote nothing must not become an empty latest/.
  it('refuses an empty capture', () => {
    const origin = makeOrigin();
    const before = git(origin, 'rev-parse', BRANCH);
    assert.throws(
      () => publish(cloneBranch(origin), makeSet({ 'baseline/notes.txt': 'x' })),
      /no PNG/,
    );
    assert.throws(
      () => publish(cloneBranch(origin), join(tmp('screenshots-none-'), 'missing')),
      /no PNG/,
    );
    assert.equal(git(origin, 'rev-parse', BRANCH), before);
  });

  it('rejects a set name that is not sha-<short>', () => {
    assert.throws(
      () => publish(cloneBranch(makeOrigin()), makeSet(), { set: 'latest' }),
      /sha-<short>/,
    );
  });

  // The job checks the branch out at depth 1, blob:none, sparse cone latest/:
  // nothing of the other captures downloads. The new set's directory is added
  // to the cone before the files are staged.
  it('publishes from the sparse partial checkout the job uses', () => {
    const origin = makeOrigin();
    const branchDir = cloneBranch(origin, '--filter=blob:none', '--sparse');
    git(branchDir, 'sparse-checkout', 'set', 'latest');
    assert.ok(
      !existsSync(join(branchDir, 'sha-pr00001')),
      'the PR capture should stay out of the cone',
    );

    const result = publish(branchDir, makeSet());

    assert.equal(result.status, 'published');
    const tree = treeOf(origin);
    assert.ok(tree.includes(`${SET}/reveal/02-after.png`));
    assert.ok(tree.includes('sha-pr00001/baseline/01-home.png'), 'the PR capture was dropped');
    assert.equal(fileOn(origin, 'latest/reveal/02-after.png'), 'reveal');
  });
});

describe('CLI', () => {
  const script = join(import.meta.dirname, 'screenshots-reference.mjs');
  const run = (origin, setDir) => {
    const summaryFile = join(tmp('screenshots-summary-'), 'summary.md');
    writeFileSync(summaryFile, '');
    const res = spawnSync(
      'node',
      [
        script,
        'publish',
        '--branch-dir',
        cloneBranch(origin),
        '--set-dir',
        setDir,
        '--set',
        SET,
        '--commit',
        COMMIT,
        '--run-url',
        RUN_URL,
      ],
      { env: { ...env, GITHUB_STEP_SUMMARY: summaryFile }, encoding: 'utf8' },
    );
    return { ...res, summary: readFileSync(summaryFile, 'utf8') };
  };

  it('publishes and writes the set and the latest/ link to the step summary', () => {
    const origin = makeOrigin();
    const res = run(origin, makeSet());
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.summary, new RegExp(`published.*${SET}.*2 images.*tree/${BRANCH}/latest`));
    assert.ok(treeOf(origin).includes('latest/reveal/02-after.png'));
  });

  it('says so when the branch already holds the set', () => {
    const origin = makeOrigin();
    const set = makeSet();
    assert.equal(run(origin, set).status, 0);
    const again = run(origin, set);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.summary, /already on the branch.*2 images/);
  });

  // The job runs with continue-on-error: the exit code marks the job, the
  // annotation and the summary say what happened and that latest/ is stale.
  it('fails visibly when there is nothing to publish', () => {
    const origin = makeOrigin();
    const res = run(origin, makeSet({ 'baseline/notes.txt': 'x' }));
    assert.equal(res.status, 1);
    assert.match(res.stderr, /^::error::screenshot reference not published: no PNG/m);
    assert.match(res.summary, /not published.*previous `latest\/` stays/);
  });

  it('rejects anything but publish', () => {
    const res = spawnSync('node', [script, 'prune'], { env, encoding: 'utf8' });
    assert.equal(res.status, 2);
  });
});

/** Another publisher (the pre-push hook) lands a PR capture on origin. */
function pushPrCapture(origin, prSet) {
  const dir = cloneBranch(origin);
  writeTree(dir, { [`${prSet}/baseline/01-home.png`]: 'pr capture' });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', `screenshots: PR #1 @ ${prSet}`);
  git(dir, 'push', '-q', 'origin', `HEAD:${BRANCH}`);
}
