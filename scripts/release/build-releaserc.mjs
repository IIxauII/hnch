// Per-package semantic-release config builder.
//
// Why this exists: commit-analyzer's releaseRules already scope-filter the
// version bump, but @semantic-release/release-notes-generator does not — it
// lists every commit since the last package tag, regardless of scope. That's
// why cli-v1.6.0 release notes were filled with client-only commits.
//
// Fix: wrap conventional-changelog-angular's default transform so commits
// whose scope does not include the package name are dropped from the notes.

import createAngularPreset from 'conventional-changelog-angular';

const PACKAGES = new Set(['shared', 'relay', 'client', 'cli']);

function scopeIncludes(rawScope, pkg) {
  if (!rawScope || typeof rawScope !== 'string') return false;
  return rawScope
    .split(',')
    .map((s) => s.trim())
    .includes(pkg);
}

function buildScopedTransform(pkg) {
  const preset = createAngularPreset();
  const orig = preset.writer.transform;
  return (commit, context) => {
    if (!scopeIncludes(commit.scope, pkg)) return undefined;
    return orig(commit, context);
  };
}

/**
 * Build a semantic-release config for one package.
 *
 * @param {object} opts
 * @param {'shared'|'relay'|'client'|'cli'} opts.pkg
 * @param {boolean} [opts.npmPublish] — defaults to false; cli sets true
 * @param {string} [opts.deployWorkflow] — optional gh workflow dispatched on
 *   tag (relay/client deploy).
 */
export function buildReleaserc({ pkg, npmPublish = false, deployWorkflow }) {
  if (!PACKAGES.has(pkg)) throw new Error(`Unknown package: ${pkg}`);

  const pkgRoot = `packages/${pkg}`;
  const scopePattern = `@(${pkg}|*,${pkg}|${pkg},*|*,${pkg},*)`;
  const transform = buildScopedTransform(pkg);

  const plugins = [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'angular',
        releaseRules: [
          { type: 'feat', release: false },
          { type: 'fix', release: false },
          { type: 'perf', release: false },
          { breaking: true, release: false },
          { scope: scopePattern, type: 'feat', release: 'minor' },
          { scope: scopePattern, type: 'fix', release: 'patch' },
          { scope: scopePattern, type: 'perf', release: 'patch' },
          { scope: scopePattern, breaking: true, release: 'major' },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'angular',
        writerOpts: { transform },
      },
    ],
    ['@semantic-release/npm', { npmPublish, pkgRoot }],
    ['@semantic-release/changelog', { changelogFile: `${pkgRoot}/CHANGELOG.md` }],
  ];

  if (deployWorkflow) {
    plugins.push([
      '@semantic-release/exec',
      {
        publishCmd: `gh workflow run ${deployWorkflow} --ref \${nextRelease.gitTag}`,
      },
    ]);
  }

  plugins.push(
    [
      '@semantic-release/git',
      {
        assets: [`${pkgRoot}/package.json`, `${pkgRoot}/CHANGELOG.md`],
        message: 'chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    '@semantic-release/github',
  );

  return {
    branches: ['main'],
    tagFormat: `${pkg}-v\${version}`,
    plugins,
  };
}
