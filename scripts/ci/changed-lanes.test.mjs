// Tests for scripts/ci/changed-lanes.mjs. node:test, not vitest: the
// detect-changes job runs them before it trusts the script, and it has no
// node_modules. Run locally with `pnpm test:ci-scripts`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  SCREENSHOT_PATHS,
  allLanes,
  changedLanes,
  formatOutputs,
  noLanes,
} from './changed-lanes.mjs';

const lanesOf = (files) => changedLanes(files).verifyPackages;
const e2eOf = (files) => changedLanes(files).lanes.e2e;

describe('changedLanes', () => {
  it('fans a relay source change out to the CLI, shared and e2e lanes', () => {
    const { lanes, verifyPackages } = changedLanes(['packages/relay/src/server.ts']);
    assert.deepEqual(lanes, {
      shared: true,
      relay: true,
      client: false,
      cli: true,
      e2e: true,
      root: false,
    });
    assert.deepEqual(verifyPackages, ['shared', 'relay', 'cli']);
  });

  it('starts no lane for Markdown or the LICENSE at a package root', () => {
    const files = [
      'packages/relay/README.md',
      'packages/cli/CHANGELOG.md',
      'packages/client/CLAUDE.md',
      'packages/cli/LICENSE',
      'packages/e2e/README.md',
    ];
    const { lanes, verifyPackages, ignored } = changedLanes(files);
    assert.deepEqual(verifyPackages, []);
    assert.equal(lanes.e2e, false);
    assert.deepEqual(ignored, files);
  });

  it('runs the package lanes as today when a README comes with a source file', () => {
    const files = ['packages/client/README.md', 'packages/client/src/main.ts'];
    assert.deepEqual(lanesOf(files), ['client']);
    assert.equal(e2eOf(files), true);
  });

  it('still counts Markdown nested inside a package', () => {
    assert.deepEqual(lanesOf(['packages/client/src/assets/notes.md']), ['client']);
  });

  it('starts no lane for root or docs Markdown', () => {
    const files = ['README.md', 'CONTRIBUTING.md', 'docs/ux.md', 'adr/0001-x.md'];
    assert.deepEqual(lanesOf(files), []);
    assert.equal(e2eOf(files), false);
  });

  it('starts no lane for an empty change list', () => {
    assert.deepEqual(lanesOf(['']), []);
  });

  it('runs every lane and e2e for a root file', () => {
    for (const f of [
      'pnpm-lock.yaml',
      'package.json',
      'tsconfig.base.json',
      '.github/workflows/ci.yml',
    ]) {
      const { lanes, verifyPackages } = changedLanes([f]);
      assert.equal(lanes.root, true, f);
      assert.equal(lanes.e2e, true, f);
      assert.deepEqual(verifyPackages, ['shared', 'relay', 'client', 'cli'], f);
    }
  });

  it('fans a shared change out to every lane and e2e', () => {
    const files = ['packages/shared/src/index.ts'];
    assert.deepEqual(lanesOf(files), ['shared', 'relay', 'client', 'cli']);
    assert.equal(e2eOf(files), true);
  });

  it('keeps a CLI change to the CLI lane', () => {
    const files = ['packages/cli/src/index.tsx'];
    assert.deepEqual(lanesOf(files), ['cli']);
    assert.equal(e2eOf(files), false);
  });

  // The e2e job runs the e2e package's typecheck, format check and lint
  // itself, so an e2e-only change has an empty verify matrix.
  it('runs e2e with no verify lane for an e2e spec change', () => {
    const files = ['packages/e2e/tests/lobby.spec.ts'];
    assert.deepEqual(lanesOf(files), []);
    assert.equal(e2eOf(files), true);
  });

  it('runs the relay and client lanes for the shared deploy-guard helpers', () => {
    const files = ['scripts/cloudflare/worker-guard.mjs'];
    assert.deepEqual(lanesOf(files), ['shared', 'relay', 'client', 'cli']);
    assert.equal(e2eOf(files), true);
  });

  it('runs the relay lane for its stall sampler, not for the rest of scripts/ci', () => {
    assert.deepEqual(lanesOf(['scripts/ci/with-stall-sampler.sh']), ['shared', 'relay', 'cli']);
    assert.deepEqual(lanesOf(['scripts/ci/changed-lanes.mjs']), []);
    assert.equal(e2eOf(['scripts/ci/changed-lanes.mjs']), false);
  });
});

// Main's screenshot reference set (#597): the e2e job captures it on a main
// push when a UI-bearing path changed, the same paths that start the pre-push
// hook's capture (scripts/screenshot-publish.mjs RELEVANT_PATHS).
describe('screenshots', () => {
  const screenshotsOf = (files) => changedLanes(files).screenshots;

  it('is on for the client, shared, the screenshot specs and the e2e fixtures', () => {
    for (const f of [
      'packages/client/src/app/home/home.page.html',
      'packages/shared/src/index.ts',
      'packages/e2e/tests/_screenshots/capture.spec.ts',
      'packages/e2e/tests/fixtures/helpers.ts',
    ]) {
      assert.equal(screenshotsOf([f]), true, f);
    }
  });

  it('is off for the relay, the CLI, an app spec and docs', () => {
    for (const f of [
      'packages/relay/src/server.ts',
      'packages/cli/src/index.tsx',
      'packages/e2e/tests/lobby.spec.ts',
      'docs/ux.md',
      '',
    ]) {
      assert.equal(screenshotsOf([f]), false, f);
    }
  });

  // A dependency bump can move pixels, and the full pipeline runs e2e anyway.
  it('is on for a root file', () => {
    for (const f of ['pnpm-lock.yaml', 'package.json', '.github/workflows/ci.yml']) {
      assert.equal(screenshotsOf([f]), true, f);
    }
  });

  it('ignores a package README like the lanes do', () => {
    assert.equal(screenshotsOf(['packages/client/README.md']), false);
  });

  it('is on for the full-pipeline fallback', () => {
    assert.equal(allLanes().screenshots, true);
  });

  // The pre-push hook captures for the same paths; a drift would give a PR a
  // capture its merge then does not refresh on main, or the other way round.
  it("matches the pre-push hook's RELEVANT_PATHS", () => {
    const source = readFileSync(join(import.meta.dirname, '../screenshot-publish.mjs'), 'utf8');
    const list = /const RELEVANT_PATHS = \[([^\]]*)\]/.exec(source);
    assert.ok(list, 'no RELEVANT_PATHS in scripts/screenshot-publish.mjs');
    const hookPaths = [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.ok(hookPaths.length > 0);
    for (const p of hookPaths) assert.equal(screenshotsOf([`${p}x.ts`]), true, p);
    assert.equal(hookPaths.length, SCREENSHOT_PATHS.source.split('|').length);
  });

  // A verified-skip main run (ADR-0055) still refreshes the reference when
  // the merge touched the UI: the lanes stay off, capture runs on its own.
  it('survives a verified skip', () => {
    const files = ['packages/client/src/main.ts'];
    const { lanes, verifyPackages, screenshots } = noLanes(files);
    assert.equal(lanes.e2e, false);
    assert.deepEqual(verifyPackages, []);
    assert.equal(screenshots, true);
    assert.equal(noLanes(['packages/relay/src/server.ts']).screenshots, false);
    assert.equal(noLanes().screenshots, false);
  });
});

describe('allLanes', () => {
  it('turns every lane on', () => {
    const { lanes, verifyPackages } = allLanes();
    assert.deepEqual(lanes, {
      shared: true,
      relay: true,
      client: true,
      cli: true,
      e2e: true,
      root: true,
    });
    assert.deepEqual(verifyPackages, ['shared', 'relay', 'client', 'cli']);
  });
});

describe('formatOutputs', () => {
  it('emits an empty verify-packages array rather than nothing', () => {
    assert.equal(
      formatOutputs(changedLanes(['packages/relay/README.md'])),
      [
        'shared=false',
        'relay=false',
        'client=false',
        'cli=false',
        'e2e=false',
        'root=false',
        'screenshots=false',
        'verify-packages=[]',
        '',
      ].join('\n'),
    );
  });
});

describe('CLI', () => {
  const script = join(import.meta.dirname, 'changed-lanes.mjs');
  const run = (args, input) =>
    execFileSync('node', [script, ...args], { input, encoding: 'utf8', stdio: 'pipe' });

  it('reads changed paths from stdin and prints the job outputs', () => {
    const out = run([], 'packages/cli/README.md\npackages/cli/src/index.tsx\n');
    assert.match(out, /^cli=true$/m);
    assert.match(out, /^e2e=false$/m);
    assert.match(out, /^verify-packages=\["cli"\]$/m);
  });

  it('turns e2e on with an empty matrix for an e2e-only change', () => {
    const out = run([], 'packages/e2e/tests/lobby.spec.ts\n');
    assert.match(out, /^e2e=true$/m);
    assert.match(out, /^verify-packages=\[\]$/m);
  });

  // A verified-skip main run (ADR-0055): the jobs after detect-changes skip,
  // but the changed paths still decide whether the reference set is captured.
  it('prints every lane off with --none and reads the screenshot rule from stdin', () => {
    const out = run(['--none'], 'packages/client/src/main.ts\n');
    for (const lane of ['shared', 'relay', 'client', 'cli', 'e2e', 'root']) {
      assert.match(out, new RegExp(`^${lane}=false$`, 'm'));
    }
    assert.match(out, /^verify-packages=\[\]$/m);
    assert.match(out, /^screenshots=true$/m);
    assert.match(run(['--none'], ''), /^screenshots=false$/m);
  });

  it('prints the screenshot rule beside the lanes', () => {
    assert.match(run([], 'packages/relay/src/server.ts\n'), /^screenshots=false$/m);
    assert.match(run([], 'packages/client/src/main.ts\n'), /^screenshots=true$/m);
  });

  // A mistyped flag must not read as an empty change list, which is no lanes.
  it('rejects an unknown argument', () => {
    assert.throws(
      () => run(['--nnone'], ''),
      (err) => err.status === 2,
    );
  });

  it('prints every lane with --all', () => {
    const out = run(['--all'], '');
    assert.match(out, /^e2e=true$/m);
    assert.match(out, /^verify-packages=\["shared","relay","client","cli"\]$/m);
  });
});
