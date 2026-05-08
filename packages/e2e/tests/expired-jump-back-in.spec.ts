import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, HOME, expectToast } from './fixtures/helpers';

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

test.describe('Expired Jump-back-in banner', () => {
  test('stale banner appears dimmed on unknown-room, second tap clears it', async ({ host }) => {
    // Step 1: host creates session → LastSessionService.record() fires on lobby init.
    const code = await host.createSession();

    // Step 2: resolve UUID from relay before eviction.
    const uuid = await resolveRoomUuid(code);

    // Step 3: navigate away WITHOUT leaveSession() — that clears the cache.
    // Direct goto preserves the lastSession Preferences entry.
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/home/);

    // Step 4: force-evict the room on the relay.
    await evictRoom(uuid);

    // Step 5: reload home so HomePage constructor re-reads localStorage → banner renders.
    await host.page.goto(`${BASE_URL}/home`);
    await host.page.waitForURL(/\/home/);

    // Banner should be visible; row not yet stale.
    const banner = host.page.locator('app-jump-back-in-banner');
    await banner.waitFor({ state: 'visible', timeout: 5_000 });
    const row = banner.locator('ion-item');
    await expect(row).not.toHaveClass(/stale/);

    // Step 6: tap banner → relay returns unknown-room → jumpBackInStale flips true.
    await row.evaluate((el: HTMLElement) => el.click());

    // Toast "That session isn't active anymore." fires.
    await expectToast(host.page, "That session isn't active anymore", { timeout: 8_000 });

    // Banner row acquires .stale class (dim).
    await expect(row).toHaveClass(/stale/, { timeout: 5_000 });

    // Step 7: second tap → cache cleared → banner removed from DOM.
    await row.evaluate((el: HTMLElement) => el.click());
    await banner.waitFor({ state: 'hidden', timeout: 5_000 });

    // Create Room and Join Room cards remain.
    await expect(host.page.locator(HOME.createCard)).toBeVisible();
    await expect(host.page.locator(HOME.joinCard)).toBeVisible();
  });
});
