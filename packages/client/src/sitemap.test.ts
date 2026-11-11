// Exercises: sitemap.xml against app/app.routes.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { routes } from './app/app.routes';

// Only the route paths are read. The real guards' services load Ionic,
// which does not load in this environment.
vi.mock('./app/core/display-name.guard', () => ({ displayNameGuard: () => true }));
vi.mock('./app/core/session-resume.guard', () => ({ sessionResumeGuard: () => true }));

// By where this file is. Not `new URL('./sitemap.xml', import.meta.url)`:
// Vite rewrites that form into an asset URL that is not a file.
const sitemap = new DOMParser().parseFromString(
  readFileSync(join(import.meta.dirname, 'sitemap.xml'), 'utf8'),
  'application/xml',
);
const locs = [...sitemap.querySelectorAll('url > loc')].map((loc) => loc.textContent ?? '');

describe('sitemap.xml', () => {
  it('is a well-formed <urlset> in the sitemaps namespace', () => {
    expect(sitemap.querySelectorAll('parsererror')).toHaveLength(0);
    expect(sitemap.documentElement.localName).toBe('urlset');
    expect(sitemap.documentElement.namespaceURI).toBe(
      'http://www.sitemaps.org/schemas/sitemap/0.9',
    );
  });

  it('gives every <url> exactly one <loc>', () => {
    const urls = [...sitemap.documentElement.children];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.localName).toBe('url');
      expect(url.querySelectorAll(':scope > loc')).toHaveLength(1);
    }
  });

  // A route that is removed or renamed fails here until its <loc> goes too.
  it('lists each hnch.dev URL once, each a route without parameters', () => {
    const paths = routes
      .map((route) => route.path)
      .filter((path) => path !== undefined && path !== '**' && !path.includes(':'));
    expect(new Set(locs).size).toBe(locs.length);
    for (const loc of locs) {
      const url = new URL(loc);
      // Canonical form only: no whitespace, query or fragment, escaped as URL would.
      expect(url.href).toBe(loc);
      expect(url.origin).toBe('https://hnch.dev');
      expect(url.search + url.hash).toBe('');
      expect(paths).toContain(url.pathname.slice(1));
    }
  });

  it('is named by robots.txt, once', () => {
    const robots = readFileSync(join(import.meta.dirname, 'robots.txt'), 'utf8');
    expect(robots.split('\n').filter((line) => /^sitemap:/iu.test(line))).toEqual([
      'Sitemap: https://hnch.dev/sitemap.xml',
    ]);
  });
});
