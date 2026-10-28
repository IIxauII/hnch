/**
 * Contract of the `@hnch/relay/testing` harness — what Phase 1b's workerd-backed
 * implementation must keep. Nothing here depends on how the relay is run.
 */

import { describe, expect, it } from 'vitest';
import { startTestRelay } from './start-relay.mjs';

describe('startTestRelay', () => {
  it('serves /health at httpUrl', async () => {
    const relay = await startTestRelay();
    try {
      const res = await fetch(`${relay.httpUrl}/health`);
      expect(res.status).toBe(200);
    } finally {
      await relay.stop();
    }
  });

  it('gives a wsUrl that is the ws form of httpUrl', async () => {
    const relay = await startTestRelay();
    try {
      expect(relay.httpUrl).toMatch(/^http:\/\/[^/]+:\d+$/);
      expect(relay.wsUrl).toBe(relay.httpUrl.replace(/^http:/, 'ws:'));
    } finally {
      await relay.stop();
    }
  });

  it('runs two relays side by side on different ports', async () => {
    const [a, b] = await Promise.all([startTestRelay(), startTestRelay()]);
    try {
      expect(a.httpUrl).not.toBe(b.httpUrl);
      for (const relay of [a, b]) {
        expect((await fetch(`${relay.httpUrl}/health`)).status).toBe(200);
      }
    } finally {
      await Promise.all([a.stop(), b.stop()]);
    }
  });

  it('refuses connections once stopped', async () => {
    const relay = await startTestRelay();
    await relay.stop();
    await expect(fetch(`${relay.httpUrl}/health`)).rejects.toThrow();
  });
});
