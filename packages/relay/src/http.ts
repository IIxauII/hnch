/** HTTP helpers for the Worker router. */

/** Same CORS headers as the Node relay: native apps preflight `POST /rooms`. */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

/** Max bytes of a JSON request body. */
export const MAX_BODY_BYTES = 4 * 1024;

/**
 * Reads a JSON body of at most {@link MAX_BODY_BYTES}. An empty body is `{}`.
 * Returns undefined for a body that is too large or not JSON.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  if (request.body === null) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes).trim();
  if (text === '') return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** A client password hash (ADR-0017): 64 lowercase hex characters. */
export function isPasswordHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
