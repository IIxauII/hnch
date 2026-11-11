// Exercises: .well-known/api-catalog and openapi.json against _headers and the relay's routes

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// By where this file is (see sitemap.test.ts for why not `new URL`).
const read = (file: string) => readFileSync(join(import.meta.dirname, file), 'utf8');

interface Link {
  readonly href: string;
  readonly type?: string;
}
type Entry = { readonly anchor: string } & Record<string, readonly Link[] | string>;

const catalog = JSON.parse(read('.well-known/api-catalog')) as { linkset: Entry[] };
const spec = JSON.parse(read('openapi.json')) as {
  openapi: string;
  servers: { url: string }[];
  paths: Record<string, Record<string, unknown>>;
};
const headers = read('_headers');
const relay = readFileSync(join(import.meta.dirname, '../../relay/src/worker.ts'), 'utf8');
const repo = join(import.meta.dirname, '../../..');

const links = (rel: string) => catalog.linkset.flatMap((e) => (e[rel] ?? []) as Link[]);

/** `METHOD /path` for each route in the header comment of the relay's worker.ts. */
const relayRoutes = [...relay.matchAll(/^ \* {3}(GET|POST|PATCH|DELETE|WS) +(\/\S+)/gm)].map(
  ([, method, path]) => `${method === 'WS' ? 'GET' : method} ${path!.replace(/:(\w+)/g, '{$1}')}`,
);

describe('.well-known/api-catalog (RFC 9727)', () => {
  it('is a Linkset whose every entry names an API on hnch.dev and how to use it', () => {
    expect(catalog.linkset.length).toBeGreaterThan(0);
    for (const entry of catalog.linkset) {
      expect(entry.anchor).toMatch(/^https:\/\/hnch\.dev\//);
      expect(entry['service-desc']).toHaveLength(1);
      expect(entry['service-doc']).toHaveLength(1);
    }
  });

  it('links only files this repo serves or holds', () => {
    for (const { href } of links('service-desc')) {
      expect(href).toBe('https://hnch.dev/openapi.json');
    }
    for (const { href } of links('service-doc')) {
      const [, file] = /^https:\/\/github\.com\/IIxauII\/hnch\/blob\/main\/(.+)$/.exec(href) ?? [];
      expect(file && existsSync(join(repo, file)), href).toBe(true);
    }
    for (const { href } of links('status')) {
      expect(relayRoutes).toContain(`GET ${new URL(href).pathname}`);
    }
  });

  it('is served as Linkset JSON, with a Link to itself for HEAD', () => {
    const block = /^\/\.well-known\/api-catalog\n((?: {2}.*\n?)+)/m.exec(headers)?.[1] ?? '';
    expect(block).toContain(
      'Content-Type: application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
    );
    expect(block).toContain('Link: </.well-known/api-catalog>; rel="api-catalog"');
  });
});

describe('openapi.json', () => {
  it('is OpenAPI 3.1 for hnch.dev', () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(spec.servers).toEqual([{ url: 'https://hnch.dev' }]);
  });

  it("describes exactly the relay's public routes", () => {
    const described = Object.entries(spec.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`),
    );
    // Test routes exist only with HNCH_ENABLE_TEST_ROUTES=1 (ADR-0027).
    const publicRoutes = relayRoutes.filter((r) => !r.includes(' /test/'));
    expect(described.toSorted()).toEqual(publicRoutes.toSorted());
  });
});
