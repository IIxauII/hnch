/* eslint-disable max-lines-per-function -- linear capture tour; splitting obscures capture order */
/**
 * Screenshot capture for the lobby section visual hierarchy (#266).
 *
 * Captures the lobby's section-grid layout at mobile (390) and desktop
 * (1440) viewports in both themes. Tagged `@lobby-hierarchy` so the
 * lefthook pre-push subset (`@lobby-hierarchy|@layout`) re-renders these
 * images whenever lobby chrome moves.
 *
 * Coverage: host-side lobby states across {390, 1440} × {light, dark}.
 * Whether to widen this to a full state × viewport × theme × role matrix
 * is still open (#642).
 *
 * Run with:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     --grep '@lobby-hierarchy' \
 *     tests/_screenshots/lobby-hierarchy.spec.ts
 */
import path from 'node:path';
import { test, type BrowserContext, type Page } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';
import { BASE_URL, HOME, LOBBY } from '../fixtures/helpers';
import { pageSettled } from './_helpers/settled';

const OUT_DIR = resolveOutDir('lobby-hierarchy');
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ mode: 'serial' });
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const THEMES = ['light', 'dark'] as const;

async function freshCtx(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
  colorScheme: 'light' | 'dark',
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function onboard(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/(home|onboarding)/);
  if (page.url().includes('/onboarding')) {
    await page.locator('ion-input[autocapitalize="words"]').locator('input').fill('HierarchyHost');
    await page.locator('ion-button:has-text("Continue")').click();
    await page.waitForURL(/\/home/);
  }
}

async function createSession(page: Page): Promise<void> {
  await page.locator(HOME.createCard).click();
  await page.waitForURL(/\/lobby/);
  await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });
  await page
    .locator('app-lobby:not(.ion-page-hidden) ion-button')
    .filter({ hasText: LOBBY.startRoundBtn })
    .waitFor({ state: 'visible', timeout: 12_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  await pageSettled(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

for (const viewportName of ['mobile', 'desktop'] as const) {
  for (const theme of THEMES) {
    test(`@lobby-hierarchy lobby empty ${viewportName} ${theme}`, async ({ browser }) => {
      const { ctx, page } = await freshCtx(browser, VIEWPORTS[viewportName], theme);
      try {
        await onboard(page);
        await createSession(page);
        await shot(page, `lobby-empty-${viewportName}-${theme}`);
      } finally {
        await ctx.close();
      }
    });
  }
}
