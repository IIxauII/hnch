/* eslint-disable max-lines-per-function -- linear screenshot tour */
/**
 * Screenshot capture for ADR-0043 / issue #159 avatar color feature.
 *
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/avatar-color.spec.ts
 *
 * Writes PNGs into docs/screenshots/<SHA>/ (SHA defaults to `local`).
 */
import path from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';

import {
  BASE_URL,
  ONBOARDING,
  HOME,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  expandRoundStartSheet,
  clickRoundStartSubmit,
  fillRoomCode,
} from '../fixtures/helpers';
import { pageSettled } from './_helpers/settled';

const OUT_DIR = resolveOutDir('theming');
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ mode: 'serial' });
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

async function freshContext(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
  colorScheme: 'light' | 'dark',
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function shot(page: Page, name: string): Promise<void> {
  await pageSettled(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function onboard(page: Page, name: string): Promise<void> {
  await page.locator(ONBOARDING.nameInput).locator('input').fill(name);
  await page.locator(ONBOARDING.continueBtn).click();
  await page.waitForURL(/\/home/);
}

async function gotoSettings(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/settings`);
  await page.waitForURL(/\/settings/);
  await page.locator('app-settings').waitFor({ state: 'visible' });
  await page.locator('ion-select[label="Avatar color"]').waitFor({ state: 'visible' });
}

async function pickPaletteOption(page: Page, label: string): Promise<void> {
  const select = page.locator('ion-select[label="Avatar color"]');
  await select.click();
  await page.locator('ion-popover ion-radio', { hasText: label }).first().click();
  await page.waitForTimeout(200);
}

async function createSession(page: Page): Promise<string> {
  await page.locator(HOME.createCard).click();
  await page.waitForURL(/\/lobby/);
  await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });
  const codeEl = page.locator(LOBBY.roomCode);
  await codeEl.waitFor({ state: 'visible' });
  const code = (await codeEl.textContent()) ?? '';
  return code.replaceAll(/[^A-Z0-9]/gi, '');
}

/**
 * Join an existing session as a second, silent voter — present so the
 * denominator in `shouldAutoReveal` (packages/shared/src/auto-reveal.ts) is
 * 2, not 1. Without this, the host's single vote in step 4 satisfies
 * unanimous auto-reveal immediately and the card grid (bound to
 * `activeRound()`) unmounts before the selected-card screenshot can be taken.
 * This voter never casts a vote itself — it just needs to stay connected
 * (present in awareness) through step 4.
 */
async function joinAsSecondVoter(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/onboarding/);
  await onboard(page, name);
  await page.goto(`${BASE_URL}/join`);
  await fillRoomCode(page, code);
  // The sixth character submits: no Join tap after a typed code.
  await page.waitForURL(/\/lobby/);
}

async function captureSet(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
  colorScheme: 'light' | 'dark',
  tag: string,
): Promise<void> {
  const { ctx, page } = await freshContext(browser, viewport, colorScheme);
  // Second, silent voter — joins right before step 4 so the host's single
  // vote can't unanimously auto-reveal (see joinAsSecondVoter doc comment).
  // Uses the same viewport/scheme as the host; it's never screenshotted itself.
  const { ctx: voterCtx, page: voterPage } = await freshContext(browser, viewport, colorScheme);
  try {
    // 1 — settings with avatar color picker (default state, deterministic seed).
    await page.goto(`${BASE_URL}/home`);
    await page.waitForURL(/\/onboarding/);
    await onboard(page, 'Alex');
    await gotoSettings(page);
    await shot(page, `01-settings-default-${tag}`);

    // 2 — settings after picking "Pink".
    await pickPaletteOption(page, 'Pink');
    await shot(page, `02-settings-pink-${tag}`);

    // 3 — lobby with the chosen color on the host avatar.
    await page.goto(`${BASE_URL}/home`);
    await page.waitForURL(/\/home/);
    const code = await createSession(page);
    await shot(page, `03-lobby-pink-avatar-${tag}`);

    // Second voter joins now, after the solo-host lobby shot above, so that
    // shot keeps its original single-avatar composition.
    await joinAsSecondVoter(voterPage, code, 'Sam');
    await page.locator(LOBBY.participantItems).nth(1).waitFor({ state: 'visible' });

    // 4 — estimating with self-vote dot colored.
    const startBtn = page
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startBtn.click();
    await expandRoundStartSheet(page);
    await page.locator(ROUND_START.titleInput).locator('input').fill('Auth flow');
    await page.locator(ROUND_START.titleInput).locator('input').blur();
    await clickRoundStartSubmit(page);
    await page.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
    // Guard the exact race: app-avatar-vote-row is bound to
    // onlineVoterParticipants() (estimating.page.ts), the same signal
    // shouldAutoReveal reads for its denominator. Asserting 2 dots here
    // — right before the host votes — confirms the co-voter is counted,
    // rather than relying on the earlier lobby-roster wait as a proxy.
    await expect(page.locator(ESTIMATING.voteDots)).toHaveCount(2, { timeout: 15_000 });
    await page.locator(ESTIMATING.card('5')).first().click();
    await page.locator(ESTIMATING.selectedCard).first().waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    await shot(page, `04-estimating-pink-dot-${tag}`);
  } finally {
    await voterCtx.close();
    await ctx.close();
  }
}

test.describe('avatar color screenshots', () => {
  test('desktop 1440 light @theming @participants', async ({ browser }) => {
    test.setTimeout(180_000);
    await captureSet(browser, { width: 1440, height: 900 }, 'light', 'desktop-1440-light');
  });

  test('desktop 1440 dark @theming @participants', async ({ browser }) => {
    test.setTimeout(180_000);
    await captureSet(browser, { width: 1440, height: 900 }, 'dark', 'desktop-1440-dark');
  });

  test('mobile 390 light @theming @participants', async ({ browser }) => {
    test.setTimeout(180_000);
    await captureSet(browser, { width: 390, height: 844 }, 'light', 'mobile-390-light');
  });

  test('mobile 390 dark @theming @participants', async ({ browser }) => {
    test.setTimeout(180_000);
    await captureSet(browser, { width: 390, height: 844 }, 'dark', 'mobile-390-dark');
  });
});
