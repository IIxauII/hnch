import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BUILTIN_SCALES,
  formatRoomCode,
  isValidRoomCode,
  MAX_ROOM_PARTICIPANTS,
  SCALE_DISPLAY_NAMES,
} from '@hnch/shared';
import { describe, expect, it } from 'vitest';
import * as entry from './index';
import worker, { type Env } from './index';
import { markdownTokens, prefersMarkdown } from './markdown';

const MARKDOWN = readFileSync(resolve(import.meta.dirname, '../src/index.md'), 'utf8');
const INDEX_HTML = '<!doctype html><html><body><app-root></app-root></body></html>';
const AGENT = { accept: 'text/markdown' };
const BROWSER = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'sec-fetch-mode': 'navigate',
};

/**
 * The assets binding as hnch-web's `_headers` and SPA fallback shape it:
 * `/index.md` when the build has it, `index.html` for every other path.
 */
function fakeAssets(withMarkdown = true) {
  const requests: Request[] = [];
  const env: Env = {
    ASSETS: {
      async fetch(request) {
        requests.push(request);
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return new Response(null, { status: 405 });
        }
        const markdown = withMarkdown && new URL(request.url).pathname === '/index.md';
        return new Response(markdown ? MARKDOWN : INDEX_HTML, {
          headers: {
            'content-type': markdown ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8',
            'cache-control': 'no-cache, must-revalidate',
            etag: markdown ? '"md"' : '"html"',
          },
        });
      },
    },
  };
  return { env, requests };
}

function get(path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`https://hnch.dev${path}`, { method, headers });
}

describe('hnch-web Worker', () => {
  it('exports nothing but its handler, the only export workerd starts with', () => {
    expect(Object.keys(entry)).toEqual(['default']);
  });

  it('answers an agent asking for Markdown with index.md, on any page path', async () => {
    for (const path of ['/', '/home', '/join?code=K7P9MR', '/lobby/K7P9MR']) {
      const { env } = fakeAssets();
      const response = await worker.fetch(get(path, AGENT), env);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
      expect(response.headers.get('vary')).toBe('Accept');
      expect(response.headers.get('cache-control')).toBe('no-cache, must-revalidate');
      expect(response.headers.get('x-markdown-tokens')).toBe(String(markdownTokens(MARKDOWN)));
      // index.md's validator would revalidate the wrong variant of this URL.
      expect(response.headers.get('etag')).toBeNull();
      expect(await response.text()).toBe(MARKDOWN);
    }
  });

  it('passes browsers and plain clients through to the assets untouched, plus Vary', async () => {
    for (const headers of [BROWSER, {}, { accept: '*/*' }]) {
      const { env, requests } = fakeAssets();
      const request = get('/lobby/K7P9MR', headers);
      const response = await worker.fetch(request, env);
      expect(requests).toEqual([request]);
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(response.headers.get('vary')).toBe('Accept');
      expect(response.headers.get('etag')).toBe('"html"');
      expect(await response.text()).toBe(INDEX_HTML);
    }
  });

  it('answers HEAD with the Markdown headers and no body', async () => {
    const response = await worker.fetch(get('/', AGENT, 'HEAD'), fakeAssets().env);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('x-markdown-tokens')).toBe(String(markdownTokens(MARKDOWN)));
    expect(response.headers.get('content-length')).toBe(
      String(new TextEncoder().encode(MARKDOWN).byteLength),
    );
    expect(response.body).toBeNull();
  });

  it('leaves other methods to the assets, whatever they accept', async () => {
    const response = await worker.fetch(get('/', AGENT, 'POST'), fakeAssets().env);
    expect(response.status).toBe(405);
  });

  it('serves the HTML, not HTML labelled Markdown, when the build has no index.md', async () => {
    const response = await worker.fetch(get('/', AGENT), fakeAssets(false).env);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toBe(INDEX_HTML);
  });
});

describe('prefersMarkdown', () => {
  it.each([
    ['text/markdown', true],
    ['TEXT/Markdown; charset=utf-8', true],
    ['text/markdown, text/html;q=0.9', true],
    ['text/html, text/markdown', true],
    ['text/markdown, */*', true],
    ['text/plain, text/markdown;q=0.5, */*;q=0.1', true],
    ['text/markdown;q=0.5, text/*;q=0.4', true],
  ])('%s → Markdown', (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['*/*'],
    ['text/*'],
    ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'],
    ['text/html, text/markdown;q=0.5'],
    ['text/markdown;q=0.5, text/*'],
    ['text/markdown;q=0.5, */*'],
    ['text/markdown;q=0'],
    ['text/markdown;q=abc'],
    ['text/markdown;q=2'],
    ['text/x-markdown'],
  ])('%s → HTML', (accept) => {
    expect(prefersMarkdown(accept)).toBe(false);
  });
});

describe('markdownTokens', () => {
  it('estimates a quarter of the UTF-8 bytes, rounded down', () => {
    expect(markdownTokens('')).toBe(0);
    expect(markdownTokens('abc')).toBe(0);
    expect(markdownTokens('abcd')).toBe(1);
    // Two em dashes: 2 characters, 6 bytes.
    expect(markdownTokens('——')).toBe(1);
  });
});

// The page restates product facts; these keep it from drifting off the code.
describe('index.md', () => {
  it('lists every builtin scale under its display name, with its cards', () => {
    for (const [id, scale] of Object.entries(BUILTIN_SCALES)) {
      expect(MARKDOWN).toContain(`| ${SCALE_DISPLAY_NAMES[id]} | ${scale.cards.join(', ')} |`);
    }
  });

  it('states the participant cap', () => {
    expect(MARKDOWN).toContain(`Up to ${MAX_ROOM_PARTICIPANTS} people per session`);
  });

  it('uses a valid example session code, in its displayed form too', () => {
    expect(isValidRoomCode('K7P9MR')).toBe(true);
    expect(MARKDOWN).toContain(`\`${formatRoomCode('K7P9MR')}\``);
  });

  it('states the code length and exactly the letters and digits the code leaves out', () => {
    expect(MARKDOWN).toContain(
      'A session code is 6 characters, uppercase letters and digits without the look-alikes 0, O, 1, I and L.',
    );
    expect(isValidRoomCode('K7P9M')).toBe(false);
    expect(isValidRoomCode('K7P9MRX')).toBe(false);
    const excluded = new Set('0O1IL');
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      expect(isValidRoomCode(`K7P9M${c}`)).toBe(!excluded.has(c));
    }
  });
});
