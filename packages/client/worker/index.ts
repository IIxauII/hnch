/**
 * hnch-web's Worker (ADR-0058): Markdown for agents, HTML for everyone else.
 *
 * It runs only for page paths, the paths without a dot (`run_worker_first` in
 * wrangler.jsonc). Every file is served as a static asset without it, so
 * script, style and image requests are never billed as Worker requests.
 *
 * A GET or HEAD that prefers Markdown (`Accept: text/markdown`) gets
 * `/index.md`, the site in Markdown. Anything else gets exactly what the
 * assets serve on their own: `index.html` through the SPA fallback, with its
 * `_headers`. Both carry `Vary: Accept`, so no cache hands one to the other.
 *
 * Only the default export may live here: workerd takes every named export of
 * the main module for an entrypoint and refuses to start on anything else.
 */

import { MARKDOWN_PATH, markdownTokens, prefersMarkdown } from './markdown';

/** The assets binding (`assets.binding` in wrangler.jsonc). */
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const reads = request.method === 'GET' || request.method === 'HEAD';
    if (reads && prefersMarkdown(request.headers.get('accept'))) {
      const markdown = await markdownResponse(request, env);
      if (markdown !== null) return markdown;
    }
    return varyOnAccept(await env.ASSETS.fetch(request));
  },
};

/**
 * `/index.md` as the answer for this page, or null when the build has no
 * Markdown (the SPA fallback answered with `index.html` instead): the page is
 * then served as HTML rather than as HTML labelled Markdown.
 */
async function markdownResponse(request: Request, env: Env): Promise<Response | null> {
  const asset = await env.ASSETS.fetch(new Request(new URL(MARKDOWN_PATH, request.url)));
  if (!asset.ok || !asset.headers.get('content-type')?.startsWith('text/markdown')) return null;
  const markdown = await asset.text();
  const headers = new Headers(asset.headers);
  headers.set('content-type', 'text/markdown; charset=utf-8');
  headers.set('x-markdown-tokens', String(markdownTokens(markdown)));
  // Validators and length belong to /index.md, not to this URL's variant.
  for (const name of ['etag', 'last-modified', 'content-length']) headers.delete(name);
  headers.append('vary', 'Accept');
  return new Response(request.method === 'HEAD' ? null : markdown, { status: 200, headers });
}

/** The assets' response, with `Vary: Accept` added. */
function varyOnAccept(response: Response): Response {
  const varied = new Response(response.body, response);
  varied.headers.append('vary', 'Accept');
  return varied;
}
