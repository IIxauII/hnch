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
const robots = readFileSync(join(import.meta.dirname, 'robots.txt'), 'utf8');

/**
 * Pages anyone can open: the root, which is the site's address though it
 * redirects into the app, and every route without a parameter, redirect or
 * guard.
 */
const PUBLIC = [
  '/',
  ...routes
    .filter((r) => r.path && r.path !== '**' && !r.path.includes(':'))
    .filter((r) => !r.redirectTo && !r.canMatch)
    .map((r) => `/${r.path}`),
];

/**
 * RFC 9309 longest match over every Allow and Disallow in robots.txt. Every
 * group repeats the `*` group's rules (robots.test.ts), so the union is that
 * group's set. Prefix rules only: robots.txt has no `*` or `$`.
 */
function robotsAllows(path: string): boolean {
  let best = { length: -1, allow: true };
  for (const line of robots.split('\n')) {
    const [, field = '', rule = ''] = /^(allow|disallow):\s*(\S*)/iu.exec(line.trim()) ?? [];
    if (rule === '' || !path.startsWith(rule)) continue;
    const allow = field.toLowerCase() === 'allow';
    if (rule.length > best.length || (rule.length === best.length && allow)) {
      best = { length: rule.length, allow };
    }
  }
  return best.allow;
}

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

  // A route that is removed, renamed, guarded or blocked in robots.txt fails
  // here until its <loc> goes too.
  it('lists each hnch.dev URL once, each a public page robots.txt allows', () => {
    expect(new Set(locs).size).toBe(locs.length);
    for (const loc of locs) {
      const url = new URL(loc);
      // Canonical form only: no whitespace, query or fragment, escaped as URL would.
      expect(url.href).toBe(loc);
      expect(url.origin).toBe('https://hnch.dev');
      expect(url.search + url.hash).toBe('');
      expect(PUBLIC).toContain(url.pathname);
      expect(robotsAllows(url.pathname), url.pathname).toBe(true);
    }
  });

  it('reads robots.txt as crawlers do', () => {
    expect(robotsAllows('/')).toBe(true);
    expect(robotsAllows('/onboarding')).toBe(true);
    expect(robotsAllows('/join')).toBe(false);
    expect(robotsAllows('/lobby/K7P9MR')).toBe(false);
  });

  it('is named by robots.txt, once', () => {
    expect(robots.split('\n').filter((line) => /^sitemap:/iu.test(line))).toEqual([
      'Sitemap: https://hnch.dev/sitemap.xml',
    ]);
  });
});
