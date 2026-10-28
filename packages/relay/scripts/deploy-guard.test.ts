import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';
import {
  configProblems,
  deployedProblems,
  isDowngrade,
  parseVersion,
  removedRoutes,
} from './deploy-guard.mjs';

const ZONE = '0d0f221371c8a419c6a9d36fc3b4da23';
const route = (pattern: string) => ({ pattern, zone_id: ZONE });
const prod = {
  name: 'hnch-relay',
  vars: { JURISDICTION: 'eu' },
  routes: [route('hnch.dev/health*'), route('hnch.dev/rooms*'), route('hnch.dev/ws/*')],
  workers_dev: false,
  preview_urls: false,
  observability: { logs: { invocation_logs: false }, traces: { enabled: false } },
};

describe('configProblems', () => {
  it('passes the wrangler.jsonc in this package', () => {
    const config = unstable_readConfig({
      config: resolve(import.meta.dirname, '../wrangler.jsonc'),
    });
    expect(configProblems(config as never)).toEqual([]);
    expect(readFileSync(resolve(import.meta.dirname, '../wrangler.jsonc'), 'utf8')).toContain(
      '"invocation_logs": false',
    );
  });

  it('refuses the ADR-0027 test vars', () => {
    expect(configProblems({ ...prod, vars: { ...prod.vars, HNCH_ROOM_CAP: '3' } })).toHaveLength(1);
    expect(
      configProblems({ ...prod, vars: { ...prod.vars, HNCH_ENABLE_TEST_ROUTES: '1' } }),
    ).toHaveLength(1);
    expect(
      configProblems({ ...prod, env: { staging: { vars: { HNCH_ENABLE_TEST_ROUTES: '1' } } } }),
    ).toHaveLength(1);
  });

  it('refuses a jurisdiction other than eu', () => {
    expect(configProblems({ ...prod, vars: { JURISDICTION: 'none' } })).toHaveLength(1);
    expect(configProblems({ ...prod, vars: {} })).toHaveLength(1);
  });

  it('refuses a config that exposes the Worker or records request URLs', () => {
    expect(configProblems(prod)).toEqual([]);
    expect(configProblems({ ...prod, workers_dev: true })).toHaveLength(1);
    expect(configProblems({ ...prod, preview_urls: true })).toHaveLength(1);
    expect(configProblems({ ...prod, keep_vars: true })).toHaveLength(1);
    expect(configProblems({ ...prod, observability: { logs: {} } })).toHaveLength(1);
    expect(
      configProblems({
        ...prod,
        observability: { logs: { invocation_logs: false }, traces: { enabled: true } },
      }),
    ).toHaveLength(1);
  });

  it('refuses routes without zone_id or off hnch.dev', () => {
    expect(
      configProblems({ ...prod, routes: [{ pattern: 'hnch.dev/ws/*', zone_name: 'hnch.dev' }] }),
    ).toHaveLength(1);
    expect(configProblems({ ...prod, routes: [route('example.com/*')] })).toHaveLength(1);
    expect(configProblems({ ...prod, routes: [] })).toHaveLength(1);
  });
});

describe('removedRoutes', () => {
  const live = [
    { pattern: 'hnch.dev/health*', script: 'hnch-relay' },
    { pattern: 'hnch.dev/ws/*', script: 'hnch-relay' },
    { pattern: 'hnch.dev/*', script: 'hnch-web' },
  ];

  it('finds a live route of this script missing from the config', () => {
    expect(removedRoutes(live, ['hnch.dev/health*'], 'hnch-relay')).toEqual(['hnch.dev/ws/*']);
  });

  it('ignores other scripts and passes a config that keeps every route', () => {
    expect(
      removedRoutes(live, ['hnch.dev/health*', 'hnch.dev/ws/*', 'hnch.dev/rooms*'], 'hnch-relay'),
    ).toEqual([]);
  });
});

describe('deployedProblems', () => {
  const eu = { name: 'JURISDICTION', type: 'plain_text', text: 'eu' };

  it('passes a version with only the production var', () => {
    expect(deployedProblems([eu, { name: 'ROOM', type: 'durable_object_namespace' }], [])).toEqual(
      [],
    );
  });

  it('refuses the test vars as a var or a secret, and an unpinned jurisdiction', () => {
    expect(deployedProblems([eu, { name: 'HNCH_ROOM_CAP', text: '3' }], [])).toHaveLength(1);
    expect(deployedProblems([eu], ['HNCH_ENABLE_TEST_ROUTES'])).toHaveLength(1);
    expect(deployedProblems([{ ...eu, text: 'none' }], [])).toHaveLength(1);
    expect(deployedProblems([], [])).toHaveLength(1);
  });
});

describe('versions', () => {
  it('reads release tags', () => {
    expect(parseVersion('relay-v1.10.2')).toEqual([1, 10, 2]);
    expect(parseVersion('1.3.0')).toEqual([1, 3, 0]);
    expect(parseVersion('client-v1.0.0')).toBeNull();
  });

  it('flags only a deploy older than what is live', () => {
    expect(isDowngrade('1.2.9', 'relay-v1.3.0')).toBe(true);
    expect(isDowngrade('1.3.0', 'relay-v1.3.0')).toBe(false);
    expect(isDowngrade('1.10.0', 'relay-v1.9.5')).toBe(false);
    expect(isDowngrade('1.3.0', 'untagged')).toBe(false);
  });
});
