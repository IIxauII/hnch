import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, HOME, expectToast, rememberedSessionCodes } from './fixtures/helpers';

/**
 * Format a 6-char room code to the displayed "XXX-XXX" form.
 * Mirrors formatRoomCode() in @hnch/shared — kept local so e2e
 * doesn't depend on the shared package import at runtime.
 */
function formatCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

const RELAY_HTTP_URL = `http://localhost:${process.env['RELAY_PORT'] ?? 1234}`;

/**
 * Resolve a room code to its relay UUID via GET /rooms/:code.
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

/**
 * Navigate to /home without clearing the last-session cache.
 * `leaveSession()` explicitly clears the cache — avoid it here.
 *
 * Waits first until session `code` is remembered: the lobby writes the entry
 * once the relay's first sync arrives, which can land after the code is on
 * screen, so leaving at once can leave nothing to list.
 */
async function goHomePreservingCache(
  page: import('@playwright/test').Page,
  code: string,
): Promise<void> {
  await expect.poll(() => rememberedSessionCodes(page)).toContain(code);
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/home/);
}

// ---------------------------------------------------------------------------
// Selector constants for the recent-rooms-list component
// ---------------------------------------------------------------------------
const RECENT_ROOMS = {
  list: 'app-recent-rooms-list',
  rows: HOME.recentRow,
  /** A row by the code it shows ("XXX-XXX"). */
  row: (formattedCode: string) => `${HOME.recentRow}:has(h3:text-is("${formattedCode}"))`,
} as const;

/** The codes the list shows, top to bottom, dash stripped. */
async function listedCodes(page: import('@playwright/test').Page): Promise<string[]> {
  return page
    .locator(RECENT_ROOMS.rows)
    .evaluateAll((els) =>
      els.map((el) => (el.querySelector('h3')?.textContent ?? '').replace('-', '')),
    );
}

// ---------------------------------------------------------------------------

test.describe('Recent rooms list', () => {
  /**
   * Two-room sequence: join A → home → join B → home → list shows both, B first.
   *
   * Ordering invariant: both createSession() calls complete before either
   * goHomePreservingCache() so lastSeenAt(B) > lastSeenAt(A). The list must
   * render B at index 0 and A at index 1.
   */
  test('two-room sequence — both entries shown, most-recent first', async ({ host }) => {
    // Room A
    const codeA = await host.createSession();
    await host.page.waitForURL(/\/lobby/);
    await goHomePreservingCache(host.page, codeA);

    // Reload to re-read cache from Preferences (ionViewWillEnter fires on real nav)
    await host.page.reload();
    await host.page.waitForURL(/\/home/);

    // One entry is a one-row list — the same component as for five.
    await expect(host.page.locator(RECENT_ROOMS.rows)).toHaveCount(1);
    expect(await listedCodes(host.page)).toEqual([codeA]);

    // Room B (must wait at least 1 ms after A so lastSeenAt differs)
    const codeB = await host.createSession();
    await host.page.waitForURL(/\/lobby/);
    await goHomePreservingCache(host.page, codeB);

    // Reload to trigger ionViewWillEnter → loadEntriesFromCache()
    await host.page.reload();
    await host.page.waitForURL(/\/home/);

    const list = host.page.locator(RECENT_ROOMS.list);
    await list.waitFor({ state: 'visible', timeout: 5_000 });

    const rows = host.page.locator(RECENT_ROOMS.rows);
    await expect(rows).toHaveCount(2);

    // First row is B (most-recent), second row is A.
    expect(await listedCodes(host.page)).toEqual([codeB, codeA]);

    // Create / Join cards are still present
    await expect(host.page.locator(HOME.createCard)).toBeVisible();
    await expect(host.page.locator(HOME.joinCard)).toBeVisible();
  });

  /**
   * 6th-room eviction: 6 distinct rooms joined sequentially → only 5 entries
   * shown, oldest (Room 1) evicted. List is most-recent-first.
   *
   * Ordering invariant: each createSession() call increments the clock so
   * lastSeenAt(N+1) > lastSeenAt(N). After the 6th join only rooms 2–6
   * remain (cap = 5; room 1 evicted by LRU).
   */
  test('6th room evicts oldest entry — list shows exactly 5', async ({ host }) => {
    const codes: string[] = [];

    for (let i = 0; i < 6; i++) {
      const code = await host.createSession();
      codes.push(code);
      await host.page.waitForURL(/\/lobby/);
      await goHomePreservingCache(host.page, code);
      // Brief reload between rounds so ionViewWillEnter re-reads cache.
      // On the last iteration we assert after reload below, so skip here.
      if (i < 5) {
        await host.page.reload();
        await host.page.waitForURL(/\/home/);
      }
    }

    // Final reload to pick up all 6 writes (cap enforced at write time)
    await host.page.reload();
    await host.page.waitForURL(/\/home/);

    const list = host.page.locator(RECENT_ROOMS.list);
    await list.waitFor({ state: 'visible', timeout: 5_000 });

    const rows = host.page.locator(RECENT_ROOMS.rows);
    // Exactly 5 entries (cap=5, 6th write evicted room 1)
    await expect(rows).toHaveCount(5);

    // Oldest room (codes[0]) must NOT appear
    const listed = await listedCodes(host.page);
    expect(listed).not.toContain(codes[0]!);

    // Most-recent room (codes[5]) IS first in list
    expect(listed[0]).toBe(codes[5]!);
  });

  /**
   * Relay-reject on list-row tap: evict room A from relay → tap A's row →
   * entry A removed from list, B still present, expired toast shown.
   *
   * Ordering invariant: evictRoom() completes before the row tap so the
   * relay returns 404 on `GET /rooms/:codeA`, driving `unknown-room` outcome.
   */
  test('relay-reject on tap — entry removed, other entry stays, expired toast shown', async ({
    host,
  }) => {
    // Room A
    const codeA = await host.createSession();
    const uuidA = await resolveRoomUuid(codeA);
    await host.page.waitForURL(/\/lobby/);
    await goHomePreservingCache(host.page, codeA);
    await host.page.reload();
    await host.page.waitForURL(/\/home/);

    // Room B
    const codeB = await host.createSession();
    await host.page.waitForURL(/\/lobby/);
    await goHomePreservingCache(host.page, codeB);
    await host.page.reload();
    await host.page.waitForURL(/\/home/);

    // Both entries visible in the list
    const list = host.page.locator(RECENT_ROOMS.list);
    await list.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(host.page.locator(RECENT_ROOMS.rows)).toHaveCount(2);

    // Evict room A from relay
    await evictRoom(uuidA);

    // Find and tap row A (identified by the code it shows)
    const rowA = host.page.locator(RECENT_ROOMS.row(formatCode(codeA)));
    await rowA.waitFor({ state: 'visible', timeout: 5_000 });
    await rowA.evaluate((el: HTMLElement) => el.click());

    // Toast: expired / not active message
    await expectToast(host.page, "That session isn't active anymore", { timeout: 8_000 });

    // Entry A is gone; B is still offered.
    await expect(host.page.locator(RECENT_ROOMS.rows)).toHaveCount(1);
    expect(await listedCodes(host.page)).toEqual([codeB]);

    // Create / Join cards still present
    await expect(host.page.locator(HOME.createCard)).toBeVisible();
  });

  /**
   * Network-fail on tap: simulate pre-handshake network failure on tap of
   * room A → entry A still present, network-error toast shown.
   *
   * Ordering invariant: `context.setOffline(true)` fires before the row
   * click so `GET /rooms/:codeA` throws a network error → `network-error`
   * outcome. Entry stays (user can retry when connection restores).
   *
   * Implementation note: `context.setOffline(true)` blocks all TCP from
   * this browser context — `resolveRoom()` fetch fails with a TypeError,
   * producing `network-error` in `rejoinRoom()`. We restore online after
   * asserting so the context teardown (context.close()) succeeds.
   */
  test('network-fail on tap — entry stays, network-error toast shown', async ({ host }) => {
    // Room A
    const codeA = await host.createSession();
    await host.page.waitForURL(/\/lobby/);
    await goHomePreservingCache(host.page, codeA);
    await host.page.reload();
    await host.page.waitForURL(/\/home/);

    // Room B
    const codeB = await host.createSession();
    await host.page.waitForURL(/\/lobby/);
    await goHomePreservingCache(host.page, codeB);
    await host.page.reload();
    await host.page.waitForURL(/\/home/);

    // Both entries visible
    const list = host.page.locator(RECENT_ROOMS.list);
    await list.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(host.page.locator(RECENT_ROOMS.rows)).toHaveCount(2);

    // Cut the network before tapping room A
    await host.page.context().setOffline(true);

    const rowA = host.page.locator(RECENT_ROOMS.row(formatCode(codeA)));
    await rowA.waitFor({ state: 'visible', timeout: 5_000 });
    await rowA.evaluate((el: HTMLElement) => el.click());

    // Toast: network-error message
    await expectToast(host.page, "Couldn't reach the relay", { timeout: 8_000 });

    // Restore connectivity before any assertions that need DOM re-evaluation
    await host.page.context().setOffline(false);

    // Entry A must STILL be present (network-error does not remove the entry)
    await expect(host.page.locator(RECENT_ROOMS.rows)).toHaveCount(2);
    await expect(host.page.locator(RECENT_ROOMS.row(formatCode(codeA)))).toBeVisible();
  });

  /**
   * The × beside a row forgets that session on this device and nothing else:
   * the row goes, the other stays, and no session is joined.
   */
  test('× forgets one entry and leaves the rest', async ({ host }) => {
    const codeA = await host.createSession();
    await host.page.waitForURL(/\/lobby/);
    await goHomePreservingCache(host.page, codeA);
    await host.page.reload();
    await host.page.waitForURL(/\/home/);

    const codeB = await host.createSession();
    await host.page.waitForURL(/\/lobby/);
    await goHomePreservingCache(host.page, codeB);
    await host.page.reload();
    await host.page.waitForURL(/\/home/);
    await expect(host.page.locator(RECENT_ROOMS.rows)).toHaveCount(2);

    await host.page
      .getByRole('button', { name: `Remove session ${formatCode(codeA)} from this list` })
      .click();

    await expect(host.page.locator(RECENT_ROOMS.rows)).toHaveCount(1);
    expect(await listedCodes(host.page)).toEqual([codeB]);
    await expect(host.page).toHaveURL(/\/home/);

    // Forgotten for good: a reload does not bring it back.
    await host.page.reload();
    await host.page.waitForURL(/\/home/);
    await expect(host.page.locator(RECENT_ROOMS.rows)).toHaveCount(1);
    expect(await listedCodes(host.page)).toEqual([codeB]);
  });
});
