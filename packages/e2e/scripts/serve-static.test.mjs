import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createStaticServer } from './serve-static.mjs';

const INDEX = '<!doctype html><title>app</title>';

/** GET with the path sent as written; fetch() would normalise `..` away first. */
function rawGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, headers: { accept: 'text/html' } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('createStaticServer', () => {
  let tmp;
  let server;
  let port;
  let base;

  before(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'serve-static-'));
    writeFileSync(join(tmp, 'secret.txt'), 'outside the build');
    const root = join(tmp, 'www');
    mkdirSync(join(root, 'assets'), { recursive: true });
    writeFileSync(join(root, 'assets', 'a b.svg'), '<svg/>');
    writeFileSync(join(root, 'index.html'), INDEX);
    writeFileSync(join(root, '3rdpartylicenses.txt'), 'MIT');
    writeFileSync(join(root, 'blob.unknownext'), 'x');
    writeFileSync(join(root, 'main.abc123.js'), 'console.log(1)');
    server = createStaticServer(root);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    port = server.address().port;
    base = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => {
      server.close(resolve);
    });
    rmSync(tmp, { recursive: true, force: true });
  });

  it('serves a file from the build with its content type', async () => {
    const res = await fetch(`${base}/main.abc123.js`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(await res.text(), 'console.log(1)');
  });

  it('answers a navigation to an app route with index.html', async () => {
    const res = await fetch(`${base}/room/ABC123?x=1`, { headers: { accept: 'text/html' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await res.text(), INDEX);
  });

  it('answers a request for a missing asset with 404, not index.html', async () => {
    const res = await fetch(`${base}/chunk-missing.js`, { headers: { accept: '*/*' } });
    assert.equal(res.status, 404);
  });

  it('decodes percent-encoded file names', async () => {
    const res = await fetch(`${base}/assets/a%20b.svg`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/svg+xml');
  });

  it('falls back to a generic content type for an unknown extension', async () => {
    const txt = await fetch(`${base}/3rdpartylicenses.txt`);
    assert.equal(txt.headers.get('content-type'), 'text/plain; charset=utf-8');
    const other = await fetch(`${base}/blob.unknownext`);
    assert.equal(other.status, 200);
    assert.equal(other.headers.get('content-type'), 'application/octet-stream');
  });

  it('answers HEAD with headers only and marks every response no-store', async () => {
    const res = await fetch(`${base}/`, { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(await res.text(), '');
  });

  it('rejects methods other than GET and HEAD', async () => {
    const res = await fetch(`${base}/`, { method: 'POST', body: 'x' });
    assert.equal(res.status, 405);
  });

  it('never serves a file outside the build directory', async () => {
    const paths = ['/../secret.txt', '/..%2fsecret.txt', '/assets/..%2f..%2fsecret.txt'];
    const responses = await Promise.all(paths.map((path) => rawGet(port, path)));
    responses.forEach((res, i) => {
      assert.notEqual(res.body, 'outside the build', paths[i]);
    });
  });
});
