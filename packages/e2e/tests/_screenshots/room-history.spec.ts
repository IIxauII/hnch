/* eslint-disable max-lines-per-function -- long linear capture script */
/**
 * Screenshot capture for the local-room-history feature (#224).
 *
 * Captures the Home screen at 0/1/2/5-entry states, and the × that forgets
 * an entry with keyboard focus on it. The × is always on screen — it used to
 * hide behind a hover on desktop and a swipe on touch. Light + dark.
 * Output: `docs/screenshots/<sha>/history/room-history-*.png` (via shared helper).
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/room-history.spec.ts
 */
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { BASE_URL, HOME } from '../fixtures/helpers';
import { resolveOutDir } from './_helpers/out-dir';
import { pageSettled } from './_helpers/settled';

const OUT_DIR = resolveOutDir('history');
const VP_PORTAL = { width: 1280, height: 800 };
const VP_MOBILE = { width: 390, height: 844 };

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

interface SeedEntry {
  roomCode: string;
  roomUuid: string;
  lastSeenAt: number;
  lastScreen: 'lobby' | 'estimating';
  passwordHash?: string;
}

async function seedCache(page: Page, entries: SeedEntry[]): Promise<void> {
  await page.addInitScript((seeds: SeedEntry[]) => {
    const cache = {
      version: 2,
      entries: Object.fromEntries(seeds.map((e) => [e.roomUuid, e])),
    };
    localStorage.setItem('CapacitorStorage.hnch.lastSession', JSON.stringify(cache));
    localStorage.setItem('CapacitorStorage.hnch.onboarded', 'true');
    localStorage.setItem('CapacitorStorage.hnch.displayName', 'Alex');
  }, entries);
}

async function shot(page: Page, name: string): Promise<void> {
  await pageSettled(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, `room-history-${name}.png`), fullPage: false });
}

function nowMinus(mins: number): number {
  return Date.now() - mins * 60 * 1000;
}

const FIVE_ROOMS: SeedEntry[] = [
  {
    roomCode: 'K7P9MR',
    roomUuid: '11111111-1111-1111-1111-111111111111',
    lastSeenAt: nowMinus(5),
    lastScreen: 'estimating',
  },
  {
    roomCode: 'TX4B2J',
    roomUuid: '22222222-2222-2222-2222-222222222222',
    lastSeenAt: nowMinus(45),
    lastScreen: 'lobby',
  },
  {
    roomCode: 'M3HN8Q',
    roomUuid: '33333333-3333-3333-3333-333333333333',
    lastSeenAt: nowMinus(180),
    lastScreen: 'estimating',
  },
  {
    roomCode: 'Y2VKD7',
    roomUuid: '44444444-4444-4444-4444-444444444444',
    lastSeenAt: nowMinus(540),
    lastScreen: 'lobby',
    passwordHash: 'x',
  },
  {
    roomCode: 'F8PWS5',
    roomUuid: '55555555-5555-5555-5555-555555555555',
    lastSeenAt: nowMinus(1320),
    lastScreen: 'estimating',
  },
];

async function newPage(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
  theme: 'light' | 'dark',
  seeds: SeedEntry[],
): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme });
  const page = await ctx.newPage();
  await seedCache(page, seeds);
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/home/);
  // Home is ready when what the shot shows is on it: the greeting (the stored
  // name is read) and one row per seeded entry (or none, for the empty state).
  // Not `networkidle`: Playwright discourages it, and the app's relay socket /
  // dev-server connections can keep the network busy for good, so it timed out
  // at 45 s on CI (#563). The fonts are system fonts, so there is nothing to
  // wait for there; `shot()` waits for the page transition itself.
  await expect(page.getByRole('heading', { name: 'Hi, Alex' })).toBeVisible();
  await expect(page.locator(HOME.createCard)).toBeVisible();
  await expect(page.locator(HOME.recentRow)).toHaveCount(seeds.length);
  return { page, close: () => ctx.close() };
}

for (const theme of ['light', 'dark'] as const) {
  for (const [vpName, vp] of [
    ['portal', VP_PORTAL],
    ['mobile', VP_MOBILE],
  ] as const) {
    test(`${vpName}-${theme}-empty @home @history`, async ({ browser }) => {
      const { page, close } = await newPage(browser, vp, theme, []);
      await shot(page, `home-empty-${vpName}-${theme}`);
      await close();
    });

    test(`${vpName}-${theme}-one-entry @home @history`, async ({ browser }) => {
      const { page, close } = await newPage(browser, vp, theme, [FIVE_ROOMS[0]!]);
      await shot(page, `home-one-${vpName}-${theme}`);
      await close();
    });

    test(`${vpName}-${theme}-two-entries @home @history`, async ({ browser }) => {
      const { page, close } = await newPage(browser, vp, theme, FIVE_ROOMS.slice(0, 2));
      await shot(page, `home-two-${vpName}-${theme}`);
      await close();
    });

    test(`${vpName}-${theme}-five-entries @home @history`, async ({ browser }) => {
      const { page, close } = await newPage(browser, vp, theme, FIVE_ROOMS);
      await shot(page, `home-five-${vpName}-${theme}`);
      await close();
    });
  }

  for (const [vpName, vp] of [
    ['portal', VP_PORTAL],
    ['mobile', VP_MOBILE],
  ] as const) {
    test(`${vpName}-${theme}-remove-focused @home @history`, async ({ browser }) => {
      const { page, close } = await newPage(browser, vp, theme, FIVE_ROOMS.slice(0, 3));
      // One × per row, there without hovering or swiping.
      const removeBtns = page.locator(HOME.recentRemoveBtn);
      await expect(removeBtns).toHaveCount(3);
      await expect(removeBtns.first()).toBeVisible();
      await page.getByRole('button', { name: 'Remove session K7P-9MR from this list' }).focus();
      await shot(page, `home-remove-focused-${vpName}-${theme}`);
      await close();
    });
  }
}
