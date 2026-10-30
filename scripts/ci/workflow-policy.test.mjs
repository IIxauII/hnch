// node --test scripts/ci/workflow-policy.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkRepo, checkWorkflow } from './workflow-policy.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('checkRepo', () => {
  it("passes this repo's workflows and composite actions", () => {
    assert.deepEqual(checkRepo(ROOT), []);
  });
});

const SHA = '11d5960a326750d5838078e36cf38b85af677262';

describe('checkWorkflow', () => {
  it('reports an action pinned by tag', () => {
    const text = ['jobs:', '  a:', '    steps:', '      - uses: actions/checkout@v4'].join('\n');
    assert.deepEqual(checkWorkflow(text), [
      {
        line: 4,
        problem: 'actions/checkout@v4 is not pinned to a full commit SHA with a version comment',
      },
    ]);
  });

  it('accepts a SHA pin with a version comment, and local actions', () => {
    const text = [
      `      - uses: actions/checkout@${SHA} # v4.4.0`,
      `        uses: codecov/codecov-action@${SHA}  # v5.5.5`,
      '        uses: ./.github/actions/pnpm-install',
    ].join('\n');
    assert.deepEqual(checkWorkflow(text), []);
  });

  it('reports a SHA pin without the version comment Dependabot updates', () => {
    assert.deepEqual(checkWorkflow(`      - uses: actions/checkout@${SHA}`), [
      {
        line: 1,
        problem: `actions/checkout@${SHA} is not pinned to a full commit SHA with a version comment`,
      },
    ]);
  });

  it('reports a self-hosted runner, as a list or a single label', () => {
    const text = [
      '    runs-on: [self-hosted, linux, arm64, hnch-podman]',
      '    runs-on: ubuntu-24.04-arm',
      '    runs-on: self-hosted',
    ].join('\n');
    assert.deepEqual(checkWorkflow(text), [
      {
        line: 1,
        problem:
          'runs-on [self-hosted, linux, arm64, hnch-podman] is not a single GitHub-hosted label',
      },
      { line: 3, problem: 'runs-on self-hosted is not a single GitHub-hosted label' },
    ]);
  });

  it('reports a global npm install that is not an exact version', () => {
    const text = [
      '        run: npm install -g npm@latest',
      '        run: npm install -g npm@12',
      '        run: npm install -g npm@12.2.1',
    ].join('\n');
    assert.deepEqual(checkWorkflow(text), [
      { line: 1, problem: 'npm@latest is not an exact npm version' },
      { line: 2, problem: 'npm@12 is not an exact npm version' },
    ]);
  });
});
