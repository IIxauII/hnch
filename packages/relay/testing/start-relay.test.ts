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

  it('runs two relays side by side on different ports, even started at once', async () => {
    const started = await Promise.allSettled([startTestRelay(), startTestRelay()]);
    const relays = started.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
    try {
      expect(started.map((s) => s.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(relays[0]!.httpUrl).not.toBe(relays[1]!.httpUrl);
      for (const relay of relays) {
        expect((await fetch(`${relay.httpUrl}/health`)).status).toBe(200);
      }
    } finally {
      await Promise.all(relays.map((r) => r.stop()));
    }
  });

  it('answers under both localhost and 127.0.0.1', async () => {
    const relay = await startTestRelay();
    try {
      const { port } = new URL(relay.httpUrl);
      for (const host of ['localhost', '127.0.0.1']) {
        expect((await fetch(`http://${host}:${port}/health`)).status).toBe(200);
      }
    } finally {
      await relay.stop();
    }
  });

  it('stops promptly with a live WebSocket client connected', async () => {
    const relay = await startTestRelay();
    const minted = await fetch(`${relay.httpUrl}/rooms`, { method: 'POST' });
    const { uuid } = (await minted.json()) as { uuid: string };
    const ws = new WebSocket(`${relay.wsUrl}/ws/${uuid}`);
    ws.addEventListener('error', () => {});
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('ws failed to open')));
    });
    await expect(
      Promise.race([
        relay.stop().then(() => 'stopped'),
        new Promise((resolve) => setTimeout(() => resolve('hung'), 2_000)),
      ]),
    ).resolves.toBe('stopped');
  });

  it('runs production defaults, whatever test vars the caller has set', async () => {
    process.env['HNCH_ROOM_CAP'] = '1';
    process.env['HNCH_ENABLE_TEST_ROUTES'] = '1';
    const relay = await startTestRelay();
    try {
      const { uuid } = (await (
        await fetch(`${relay.httpUrl}/rooms`, { method: 'POST' })
      ).json()) as {
        uuid: string;
      };
      const res = await fetch(`${relay.httpUrl}/test/rooms/${uuid}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    } finally {
      delete process.env['HNCH_ROOM_CAP'];
      delete process.env['HNCH_ENABLE_TEST_ROUTES'];
      await relay.stop();
    }
  });

  it('mounts the test routes when asked', async () => {
    const relay = await startTestRelay({ testRoutes: true, roomCap: 3 });
    try {
      const { uuid } = (await (
        await fetch(`${relay.httpUrl}/rooms`, { method: 'POST' })
      ).json()) as {
        uuid: string;
      };
      const res = await fetch(`${relay.httpUrl}/test/rooms/${uuid}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    } finally {
      await relay.stop();
    }
  });

  it('refuses connections once stopped', async () => {
    const relay = await startTestRelay();
    await relay.stop();
    await expect(fetch(`${relay.httpUrl}/health`)).rejects.toThrow();
  });
});
