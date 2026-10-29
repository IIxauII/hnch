import { test, expect } from './fixtures/app.fixture';
import { CONNECTION_BANNER, watchForToast } from './fixtures/helpers';

/**
 * Keepalive (ADR-0050, ADR-0051): y-websocket drops a socket that receives no
 * frame for 30 s and reconnects. A host alone in the lobby sends only its
 * awareness renewals, so the relay itself must keep frames coming — the Node
 * relay renewed its own presence every 15 s; the Worker relay answers inbound
 * traffic on a socket it has not written to for 10 s.
 */
test.describe('A host alone in the lobby', () => {
  test('keeps its one connection to the relay for 75 s', async ({ host }) => {
    test.setTimeout(120_000);
    const relaySockets: string[] = [];
    host.page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname.startsWith('/ws/')) relaySockets.push(ws.url());
    });

    await host.createSession();
    await host.page.waitForURL(/\/lobby/);
    const reconnected = await watchForToast(host.page, 'Reconnected');
    const banner = host.page.locator(`app-lobby:not(.ion-page-hidden) ${CONNECTION_BANNER.banner}`);

    // Two and a half reconnect timeouts.
    await host.page.waitForTimeout(75_000);

    expect(relaySockets).toHaveLength(1);
    await expect(banner).toBeHidden();
    expect(await reconnected.seen()).toBe(false);
  });
});
