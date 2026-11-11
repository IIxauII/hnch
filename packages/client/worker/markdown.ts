// Content negotiation for hnch-web's Worker (index.ts). Kept out of the main
// module: workerd takes each of its named exports for an entrypoint.

/** The Markdown version of the site, copied to the root of www (angular.json). */
export const MARKDOWN_PATH = '/index.md';

/**
 * Whether an Accept header asks for Markdown over HTML: `text/markdown` is
 * listed with a q above 0, and at least as high as the q that applies to
 * `text/html` (its own entry, else `text/*`, else `*`/`*`). Browsers never
 * list `text/markdown`, and a wildcard alone keeps the HTML default.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (accept === null) return false;
  const q = { markdown: 0, html: -1, text: -1, any: -1 };
  for (const range of accept.split(',')) {
    const [type = '', ...params] = range.split(';').map((part) => part.trim().toLowerCase());
    const weight = quality(params);
    if (type === 'text/markdown') q.markdown = Math.max(q.markdown, weight);
    else if (type === 'text/html') q.html = Math.max(q.html, weight);
    else if (type === 'text/*') q.text = Math.max(q.text, weight);
    else if (type === '*/*') q.any = Math.max(q.any, weight);
  }
  const html = q.html >= 0 ? q.html : q.text >= 0 ? q.text : Math.max(q.any, 0);
  return q.markdown > 0 && q.markdown >= html;
}

/** A media range's q: 1 when absent, 0 when malformed or out of range. */
function quality(params: string[]): number {
  const param = params.find((p) => p.startsWith('q='));
  if (param === undefined) return 1;
  const value = param.slice(2).trim();
  if (!/^(0(\.\d{0,3})?|1(\.0{0,3})?)$/u.test(value)) return 0;
  return Number(value);
}

/**
 * Cloudflare's estimate for `x-markdown-tokens`: bytes divided by four,
 * rounded down. An estimate, not a tokenizer's count.
 */
export function markdownTokens(markdown: string): number {
  return Math.floor(new TextEncoder().encode(markdown).byteLength / 4);
}
