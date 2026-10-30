// Tests for scripts/ci/workflow-policy.mjs. node:test, not vitest: the
// detect-changes job runs them before it trusts the script, and it has no
// node_modules. Run locally with `pnpm test:ci-scripts`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { checkWorkflow } from './workflow-policy.mjs';

const SHA = '11d5960a326750d5838078e36cf38b85af677262';
const UNPINNED = 'is not pinned to a full commit SHA with a version comment';
const NOT_HOSTED = 'is not a single GitHub-hosted label on the runs-on line';

describe('checkWorkflow: actions', () => {
  it('reports an action pinned by tag', () => {
    const text = ['jobs:', '  a:', '    steps:', '      - uses: actions/checkout@v4'].join('\n');
    assert.deepEqual(checkWorkflow(text), [
      { line: 4, problem: `actions/checkout@v4 ${UNPINNED}` },
    ]);
  });

  it('accepts a SHA pin with a version comment, quoted or not, and local actions', () => {
    const text = [
      `      - uses: actions/checkout@${SHA} # v4.4.0`,
      `        uses: codecov/codecov-action@${SHA}  # v5.5.5`,
      `        uses: "actions/cache@${SHA}" # v4.3.0`,
      `        uses: 'actions/setup-node@${SHA}' # v4.4.0`,
      '        uses: ./.github/actions/pnpm-install',
    ].join('\n');
    assert.deepEqual(checkWorkflow(text), []);
  });

  it('reports a SHA pin without the version comment Dependabot updates', () => {
    assert.deepEqual(checkWorkflow(`      - uses: actions/checkout@${SHA}`), [
      { line: 1, problem: `actions/checkout@${SHA} ${UNPINNED}` },
    ]);
  });
});

describe('checkWorkflow: runners', () => {
  it('accepts GitHub-hosted labels, quoted or with a comment', () => {
    const text = [
      '    runs-on: ubuntu-24.04-arm',
      '    runs-on: ubuntu-latest # cheap',
      "    runs-on: 'ubuntu-22.04'",
      '    runs-on: "macos-15"',
      '    runs-on: windows-2025',
    ].join('\n');
    assert.deepEqual(checkWorkflow(text), []);
  });

  it('reports a self-hosted runner, as a list, a single label or a lookalike', () => {
    const text = [
      '    runs-on: [self-hosted, linux, arm64, hnch-podman]',
      '    runs-on: self-hosted',
      '    runs-on: ubuntu-home-box',
    ].join('\n');
    assert.deepEqual(checkWorkflow(text), [
      { line: 1, problem: `runs-on [self-hosted, linux, arm64, hnch-podman] ${NOT_HOSTED}` },
      { line: 2, problem: `runs-on self-hosted ${NOT_HOSTED}` },
      { line: 3, problem: `runs-on ubuntu-home-box ${NOT_HOSTED}` },
    ]);
  });

  it('reports a block-form runs-on, whose labels sit on the lines below', () => {
    const text = [
      '    runs-on:',
      '      - self-hosted',
      '    runs-on: # pool',
      '      group: pool',
    ].join('\n');
    assert.deepEqual(checkWorkflow(text), [
      { line: 1, problem: `runs-on (block) ${NOT_HOSTED}` },
      { line: 3, problem: `runs-on (block) ${NOT_HOSTED}` },
    ]);
  });
});

describe('checkWorkflow: npm', () => {
  it('reports a global npm install that is not an exact version', () => {
    const text = [
      '        run: npm install -g npm@latest',
      '        run: npm install -g npm@12',
      '        run: npm install -g npm',
      '        run: npm i --global npm && npm --version',
      '        run: npm install -g npm@12.2.1',
    ].join('\n');
    assert.deepEqual(checkWorkflow(text), [
      { line: 1, problem: 'npm@latest is not an exact npm version' },
      { line: 2, problem: 'npm@12 is not an exact npm version' },
      { line: 3, problem: 'npm (no version) is not an exact npm version' },
      { line: 4, problem: 'npm (no version) is not an exact npm version' },
    ]);
  });
});

describe('workflow-policy.mjs CLI', () => {
  const script = join(import.meta.dirname, 'workflow-policy.mjs');
  const dirs = [];
  after(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  /** A repo root with the given files under .github/ */
  function repo(files) {
    const root = mkdtempSync(join(tmpdir(), 'workflow-policy-'));
    dirs.push(root);
    for (const [path, text] of Object.entries(files)) {
      const full = join(root, '.github', path);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, text);
    }
    return root;
  }

  it('exits 0 on a clean repo', () => {
    const root = repo({ 'workflows/ci.yml': 'jobs:\n  a:\n    runs-on: ubuntu-24.04-arm\n' });
    const { status, stderr } = spawnSync('node', [script], { cwd: root, encoding: 'utf8' });
    assert.equal(stderr, '');
    assert.equal(status, 0);
  });

  it('annotates each problem with its file and line and exits 1', () => {
    const root = repo({
      'workflows/ci.yml': 'jobs:\n  a:\n    runs-on: self-hosted\n',
      'actions/install/action.yml': 'runs:\n  steps:\n    - uses: actions/setup-node@v4\n',
      'dependabot.yml': 'uses: not/a-workflow@v1\n',
    });
    const { status, stderr } = spawnSync('node', [script], { cwd: root, encoding: 'utf8' });
    assert.equal(status, 1);
    assert.equal(
      stderr,
      [
        `::error file=.github/actions/install/action.yml,line=3::actions/setup-node@v4 ${UNPINNED}`,
        `::error file=.github/workflows/ci.yml,line=3::runs-on self-hosted ${NOT_HOSTED}`,
        '',
      ].join('\n'),
    );
  });
});
