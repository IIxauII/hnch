import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';
import {
  configProblems,
  deployedVersionId,
  deployedVersionProblems,
  HASHED,
  wwwProblems,
  wwwReport,
} from './deploy-guard.mjs';

const ZONE = '0d0f221371c8a419c6a9d36fc3b4da23';
const SRC = resolve(import.meta.dirname, '../src');
const prod = {
  name: 'hnch-web',
  main: 'worker/index.ts',
  routes: [{ pattern: 'hnch.dev/*', zone_id: ZONE }],
  workers_dev: false,
  preview_urls: false,
  observability: { enabled: false },
  assets: {
    directory: './www',
    binding: 'ASSETS',
    not_found_handling: 'single-page-application',
    run_worker_first: ['/*', '!/*.*'],
  },
};

/** `value` as a config that never set `key`. */
function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  delete copy[key];
  return copy as Omit<T, K>;
}

describe('configProblems', () => {
  it('passes the wrangler.jsonc in this package', () => {
    const config = unstable_readConfig({
      config: resolve(import.meta.dirname, '../wrangler.jsonc'),
    });
    expect(configProblems(config as never)).toEqual([]);
    expect(config.name).toBe('hnch-web');
  });

  it('refuses another Worker name', () => {
    expect(configProblems({ ...prod, name: 'hnch-relay' })).toHaveLength(1);
  });

  it('refuses a Worker reachable outside hnch.dev', () => {
    expect(configProblems(prod)).toEqual([]);
    expect(configProblems({ ...prod, workers_dev: true })).toHaveLength(1);
    expect(configProblems({ ...prod, preview_urls: true })).toHaveLength(1);
  });

  it('accepts the Markdown Worker by relative or absolute path, and no other script', () => {
    expect(
      configProblems({ ...prod, main: resolve(import.meta.dirname, '../worker/index.ts') }),
    ).toEqual([]);
    expect(configProblems({ ...prod, main: 'src/worker.ts' })).toHaveLength(1);
    expect(configProblems(omit(prod, 'main'))).toHaveLength(1);
    expect(configProblems({ ...prod, assets: omit(prod.assets, 'binding') })).toHaveLength(1);
    expect(configProblems({ ...prod, assets: { ...prod.assets, binding: 'STATIC' } })).toHaveLength(
      1,
    );
  });

  it('refuses to run the Worker for files: only the dot-free page paths', () => {
    expect(configProblems({ ...prod, assets: omit(prod.assets, 'run_worker_first') })).toHaveLength(
      1,
    );
    for (const run_worker_first of [true, false, ['/*'], ['/*', '!/*.js'], ['/']]) {
      expect(
        configProblems({ ...prod, assets: { ...prod.assets, run_worker_first } }),
      ).toHaveLength(1);
    }
  });

  it('refuses every sink that would record room codes from page URLs', () => {
    expect(configProblems(omit(prod, 'observability'))).toHaveLength(1);
    expect(configProblems({ ...prod, observability: { enabled: true } })).toHaveLength(1);
    expect(
      configProblems({ ...prod, observability: { enabled: false, logs: { enabled: true } } }),
    ).toHaveLength(1);
    expect(
      configProblems({ ...prod, observability: { enabled: false, traces: { enabled: true } } }),
    ).toHaveLength(1);
    expect(configProblems({ ...prod, logpush: true })).toHaveLength(1);
    expect(configProblems({ ...prod, tail_consumers: [{ service: 'tap' }] })).toHaveLength(1);
    expect(
      configProblems({ ...prod, streaming_tail_consumers: [{ service: 'tap' }] }),
    ).toHaveLength(1);
    expect(configProblems({ ...prod, logpush: false, tail_consumers: [] })).toEqual([]);
  });

  it('refuses assets other than www with SPA fallback', () => {
    expect(configProblems(omit(prod, 'assets'))).toHaveLength(1);
    expect(configProblems({ ...prod, assets: { ...prod.assets, directory: 'www/' } })).toEqual([]);
    expect(
      configProblems({ ...prod, assets: { ...prod.assets, directory: './dist' } }),
    ).toHaveLength(1);
    expect(
      configProblems({ ...prod, assets: { ...prod.assets, not_found_handling: '404-page' } }),
    ).toHaveLength(1);
  });

  it('refuses routes without zone_id, off hnch.dev, or none', () => {
    expect(
      configProblems({ ...prod, routes: [{ pattern: 'hnch.dev/*', zone_name: 'hnch.dev' }] }),
    ).toHaveLength(1);
    expect(
      configProblems({ ...prod, routes: [{ pattern: 'hnch.dev/*', zone_id: '' }] }),
    ).toHaveLength(1);
    expect(
      configProblems({
        ...prod,
        routes: [{ pattern: 'hnch.dev', zone_id: ZONE, custom_domain: true }],
      }),
    ).toHaveLength(2);
    expect(
      configProblems({ ...prod, routes: [{ pattern: 'example.com/*', zone_id: ZONE }] }),
    ).toHaveLength(1);
    expect(configProblems({ ...prod, routes: [] })).toHaveLength(1);
  });
});

describe('wwwProblems', () => {
  let www: string;
  const put = (file: string, body = '') => {
    mkdirSync(dirname(join(www, file)), { recursive: true });
    writeFileSync(join(www, file), body);
  };

  beforeEach(() => {
    www = mkdtempSync(join(tmpdir(), 'hnch-www-'));
    put('index.html', '<app-root></app-root>');
    put('_headers', readFileSync(join(SRC, '_headers'), 'utf8'));
    put('robots.txt', readFileSync(join(SRC, 'robots.txt'), 'utf8'));
    put('sitemap.xml', readFileSync(join(SRC, 'sitemap.xml'), 'utf8'));
    put('index.md', readFileSync(join(SRC, 'index.md'), 'utf8'));
    put('openapi.json', readFileSync(join(SRC, 'openapi.json'), 'utf8'));
    put('.well-known/api-catalog', readFileSync(join(SRC, '.well-known/api-catalog'), 'utf8'));
    put('main.66e4893120763c69.js');
    put('styles.876f054718d41689.css');
    put('219.b341d1532e91059a.js');
    put('3rdpartylicenses.txt');
    put('favicon.ico');
    put('assets/shapes.svg');
    put('svg/add.svg');
  });

  afterEach(() => rmSync(www, { recursive: true, force: true }));

  it('passes a production build, counting its .js and .css in the same walk', () => {
    expect(wwwReport(www, SRC)).toEqual({ problems: [], assets: 3 });
  });

  it('refuses an unhashed .js or .css anywhere in the build', () => {
    put('main.js');
    put('assets/vendor/lib.css');
    expect(wwwProblems(www, SRC)).toEqual([
      expect.stringContaining('assets/vendor/lib.css'),
      expect.stringContaining('main.js'),
    ]);
  });

  it('refuses a build without the _headers it was configured with', () => {
    rmSync(join(www, '_headers'));
    expect(wwwProblems(www, SRC)).toHaveLength(1);
    put('_headers', '/*\n  Cache-Control: public, max-age=31536000, immutable\n');
    expect(wwwProblems(www, SRC)).toHaveLength(1);
  });

  it('refuses a build without the robots.txt it was built from', () => {
    rmSync(join(www, 'robots.txt'));
    expect(wwwProblems(www, SRC)).toEqual([expect.stringContaining('no robots.txt')]);
    put('robots.txt', 'User-agent: *\nDisallow:\n');
    expect(wwwProblems(www, SRC)).toEqual([expect.stringContaining('robots.txt differs')]);
  });

  it('refuses a build without the sitemap.xml it was built from', () => {
    rmSync(join(www, 'sitemap.xml'));
    put('assets/sitemap.xml', readFileSync(join(SRC, 'sitemap.xml'), 'utf8'));
    expect(wwwProblems(www, SRC)).toEqual([expect.stringContaining('no sitemap.xml')]);
    put('sitemap.xml', '<urlset/>');
    expect(wwwProblems(www, SRC)).toEqual([expect.stringContaining('sitemap.xml differs')]);
  });

  it('refuses a build without the index.md that Markdown requests are answered with', () => {
    rmSync(join(www, 'index.md'));
    expect(wwwProblems(www, SRC)).toEqual([expect.stringContaining('no index.md')]);
    put('index.md', '# hnch\n');
    expect(wwwProblems(www, SRC)).toEqual([expect.stringContaining('index.md differs')]);
  });

  it('refuses a build without the API catalog and the OpenAPI spec it links to', () => {
    rmSync(join(www, '.well-known'), { recursive: true });
    put('api-catalog', readFileSync(join(SRC, '.well-known/api-catalog'), 'utf8'));
    expect(wwwProblems(www, SRC)).toEqual([expect.stringContaining('no .well-known/api-catalog')]);
    rmSync(join(www, 'openapi.json'));
    expect(wwwProblems(www, SRC)).toEqual([
      expect.stringContaining('no openapi.json'),
      expect.stringContaining('no .well-known/api-catalog'),
    ]);
  });

  it('refuses a directory that is not a build', () => {
    rmSync(join(www, 'index.html'));
    expect(wwwProblems(www, SRC)).toHaveLength(1);
  });

  it("matches exactly the webpack builder's .<16 lowercase hex>. hashes", () => {
    expect(HASHED.test('main.66e4893120763c69.js')).toBe(true);
    expect(HASHED.test('styles.876f054718d41689.css')).toBe(true);
    expect(HASHED.test('assets/x/219.b341d1532e91059a.js')).toBe(true);
    expect(HASHED.test('chunk-ABCD2345.css')).toBe(false);
    expect(HASHED.test('chunk.ABCD2345.css')).toBe(false);
    expect(HASHED.test('jquery.validate.js')).toBe(false);
    expect(HASHED.test('main.66E4893120763C69.js')).toBe(false);
    expect(HASHED.test('main.66e4893120763c6.js')).toBe(false);
    expect(HASHED.test('main.66e4893120763c690.js')).toBe(false);
    expect(HASHED.test('polyfills.1234567.js')).toBe(false);
  });
});

describe('deployedVersionId', () => {
  it('takes the version id of the last deploy entry', () => {
    const out = [
      JSON.stringify({ type: 'wrangler-session', version: 1 }),
      JSON.stringify({ type: 'deploy', version: 1, version_id: 'aaaa' }),
      JSON.stringify({ type: 'deploy', version: 1, version_id: 'bbbb' }),
      '',
    ].join('\n');
    expect(deployedVersionId(out)).toBe('bbbb');
  });

  it('is null without a deploy entry', () => {
    expect(deployedVersionId('')).toBeNull();
    expect(deployedVersionId(JSON.stringify({ type: 'deploy', version_id: null }))).toBeNull();
  });
});

describe('deployedVersionProblems', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';
  const version = {
    id: '11111111-2222-3333-4444-555555555555',
    percentage: 100,
    tag: 'client-v1.46.0',
    message: `client-v1.46.0 (${sha})`,
    bindings: [],
  };
  const expected = { versionId: version.id, sha, tag: 'client-v1.46.0' };

  it('passes when this upload serves all traffic with its commit and tag', () => {
    expect(deployedVersionProblems([version], expected)).toEqual([]);
    expect(
      deployedVersionProblems([{ ...version, tag: null, message: `untagged (${sha})` }], {
        ...expected,
        tag: '',
      }),
    ).toEqual([]);
  });

  it('refuses a script that was never deployed (no live versions)', () => {
    expect(deployedVersionProblems([], expected)).toEqual([expect.stringContaining('is not live')]);
  });

  it('refuses a reused tag whose live version is an earlier upload', () => {
    const earlier = { ...version, id: '99999999-2222-3333-4444-555555555555' };
    expect(deployedVersionProblems([earlier], expected)).toEqual([
      expect.stringContaining('is not live'),
    ]);
  });

  it('refuses a partial rollout, another commit, or the wrong tag', () => {
    expect(deployedVersionProblems([{ ...version, percentage: 50 }], expected)).toHaveLength(1);
    expect(
      deployedVersionProblems([{ ...version, message: 'client-v1.46.0 (deadbeef)' }], expected),
    ).toHaveLength(1);
    expect(deployedVersionProblems([version], { ...expected, tag: '' })).toHaveLength(1);
    expect(deployedVersionProblems([{ ...version, tag: null }], expected)).toHaveLength(1);
  });
});
