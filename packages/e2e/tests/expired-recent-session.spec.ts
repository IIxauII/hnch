import { test, expect } from './fixtures/app.fixture';
import {
  BASE_URL,
  HOME,
  expectToast,
  rememberedSessionCodes,
  watchForToast,
} from './fixtures/helpers';

const RELAY_HTTP_URL = `http://localhost:${process.env['RELAY_PORT'] ?? 1234}`;

/**
 * Resolve a room code to its relay UUID via GET /rooms/:code.
 * Needed to call the test-only eviction endpoint.
 */
async function resolveRoomUuid(code: string): Promise<string> {
  const res = await fetch(`${RELAY_HTTP_URL}/rooms/${code}`);
  if (!res.ok) throw new Error(`resolveRoom failed: ${res.status}`);
  const body = (await res.json()) as { uuid: string };
  return body.uuid;
}

/**
 * Force-evict a room from the relay via the test-only endpoint
 * (gated on HNCH_ENABLE_TEST_ROUTES=1 in playwright.config.ts).
 */
async function evictRoom(uuid: string): Promise<void> {
  const res = await fetch(`${RELAY_HTTP_URL}/test/rooms/${uuid}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`evictRoom failed: ${res.status}`);
}

test.describe('A session that expires while someone is in it', () => {
  // The relay answers the next handshake with 404, before there is a socket
  // to close with a reason. Left at that, the app retries for ever behind a
  // "Reconnecting…" that will never go away.
  test('the participant is told, and taken Home', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);
    await expect.poll(() => rememberedSessionCodes(player.page)).toContain(code);

    await evictRoom(await resolveRoomUuid(code));
    const reconnected = await watchForToast(player.page, 'Reconnected');

    // The connection has to be opened again
    await player.page.context().setOffline(true);
    await player.page.waitForTimeout(1_000);
    await player.page.context().setOffline(false);

    await expectToast(player.page, "That session isn't active anymore", { timeout: 15_000 });
    await player.page.waitForURL(/\/home/, { timeout: 10_000 });
    await expect(player.page.locator(HOME.createCard)).toBeVisible();

    // The wait ended, but not in a connection.
    expect(await reconnected.seen()).toBe(false);

    // The session can never be got into again: Home does not offer it. What
    // is in the cache is what Home lists, whenever it gets to read it.
    await expect.poll(() => rememberedSessionCodes(player.page)).not.toContain(code);
    await player.page.reload();
    await player.page.locator(HOME.createCard).waitFor({ state: 'visible' });
    expect(await rememberedSessionCodes(player.page)).not.toContain(code);
    await player.page.waitForTimeout(500);
    await expect(player.page.locator(HOME.recentRow)).toHaveCount(0);
  });
});

test.describe('Expired recent session', () => {
  test('a session the relay has forgotten is dropped on the first tap', async ({ host }) => {
    // Step 1: host creates session. The Lobby records it once the session
    // is joined — connected and in sync — which is after the code is shown.
    const code = await host.createSession();
    await expect.poll(() => rememberedSessionCodes(host.page)).toContain(code);

    // Step 2: resolve UUID from relay before eviction.
    const uuid = await resolveRoomUuid(code);

    // Step 3: navigate away WITHOUT leaveSession() — that clears the cache.
    // Direct goto preserves the lastSession Preferences entry.
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/home/);

    // Step 4: force-evict the room on the relay.
    await evictRoom(uuid);

    // Step 5: reload home so HomePage re-reads the cache → the row renders.
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/home/);

    const rows = host.page.locator(HOME.recentRow);
    await expect(rows).toHaveCount(1);

    // Step 6: tap the row → relay returns unknown-room.
    await rows.first().click();

    // The toast says why, and the entry — which can never work again — goes
    // with it. No second tap to clear a dimmed row.
    await expectToast(host.page, "That session isn't active anymore", { timeout: 8_000 });
    await expect(rows).toHaveCount(0);
    await expect(host.page).toHaveURL(/\/home/);

    // Gone for good: from the cache, which is what a Home that loads later
    // reads. (Rows counted right after a reload are zero either way — the
    // list has not been read yet.)
    await expect.poll(() => rememberedSessionCodes(host.page)).not.toContain(code);
    await host.page.reload();
    await host.page.waitForURL(/\/home/);
    await host.page.locator(HOME.createCard).waitFor({ state: 'visible' });
    expect(await rememberedSessionCodes(host.page)).not.toContain(code);
    await host.page.waitForTimeout(500);
    await expect(rows).toHaveCount(0);

    // New session and Join session rows remain.
    await expect(host.page.locator(HOME.createCard)).toBeVisible();
    await expect(host.page.locator(HOME.joinCard)).toBeVisible();
  });
});
