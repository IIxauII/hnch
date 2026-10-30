#!/usr/bin/env node
// Serves a built client (`ng build --configuration e2e`) for Playwright in
// CI, in place of `ng serve` (#602). Dependency-free on purpose: it only
// has to hand the test browser the files and answer app routes with
// index.html, the way hnch-web's Workers Static Assets SPA fallback does.
//
//   node scripts/serve-static.mjs <dir>   (port: CLIENT_PORT, default 4200)

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// What `ng build` writes to www/ (main, chunks, styles, ionicons SVGs,
// favicon, assets, licenses). Anything else goes out as octet-stream.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};
const FALLBACK_TYPE = 'application/octet-stream';

/**
 * Size of the file to send for `file`: the file itself, or a directory's
 * index.html. Null when there is none.
 * @param {string} file
 * @returns {{ file: string, size: number } | null}
 */
function lookup(file) {
  try {
    const stat = statSync(file);
    if (stat.isFile()) return { file, size: stat.size };
    if (stat.isDirectory()) return lookup(join(file, 'index.html'));
  } catch {
    // missing or unreadable: same as not there
  }
  return null;
}

/**
 * A browser navigation, which gets index.html for an unknown path. A
 * missing script or image gets a 404 instead, so a broken build fails
 * loudly rather than parsing HTML as JavaScript.
 * @param {import('node:http').IncomingMessage} req
 */
function isNavigation(req) {
  return (
    req.headers['sec-fetch-mode'] === 'navigate' || (req.headers.accept ?? '').includes('text/html')
  );
}

/**
 * The file a request path names, or null when it is malformed or points
 * outside `base` (a decoded `..%2f` would otherwise climb out).
 * @param {string} base absolute build directory
 * @param {string} url request target
 */
function resolveInRoot(base, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://x').pathname);
  } catch {
    return null;
  }
  const file = resolve(base, `.${pathname}`);
  return file === base || file.startsWith(base + sep) ? file : null;
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} message
 */
function sendText(res, status, message) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(message);
}

/**
 * HTTP server for the build in `root`.
 * @param {string} root
 */
export function createStaticServer(root) {
  const base = resolve(root);
  return createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('allow', 'GET, HEAD');
      sendText(res, 405, 'Method not allowed');
      return;
    }
    const requested = resolveInRoot(base, req.url ?? '/');
    let found = requested === null ? null : lookup(requested);
    if (found === null && isNavigation(req)) found = lookup(join(base, 'index.html'));
    if (found === null) {
      sendText(res, 404, 'Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(found.file)] ?? FALLBACK_TYPE,
      'content-length': found.size,
      // Every run serves a fresh build; never let the browser reuse one.
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(found.file)
      .on('error', () => res.destroy())
      .pipe(res);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  if (!dir || lookup(join(dir, 'index.html')) === null) {
    console.error(`serve-static: no index.html in ${dir ?? '(no directory given)'}`);
    process.exit(1);
  }
  const port = Number.parseInt(process.env['CLIENT_PORT'] ?? '4200', 10);
  // Loopback only, like the test relay: this is a test fixture, not a host.
  createStaticServer(dir).listen(port, '127.0.0.1', () => {
    console.log(`serve-static: ${resolve(dir)} on http://localhost:${port}`);
  });
}
