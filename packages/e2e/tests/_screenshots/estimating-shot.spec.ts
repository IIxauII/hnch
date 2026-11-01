/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture for the Estimating screen visual hierarchy (#191).
 *
 * Three voters onboard, host creates a Fibonacci room, starts a titled
 * round, and two of three cast votes — leaving one outstanding so the
 * unanimous auto-reveal does NOT fire and the host's Estimating page
 * stays on screen for the screenshot. Writes PNGs in light + dark,
 * desktop + mobile.
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 \
 *     pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/estimating-shot.spec.ts
 */
import path from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test } from './_helpers/capture-test';
import { resolveOutDir } from './_helpers/out-dir';
import { pageSettled } from './_helpers/settled';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  LOBBY,
  ESTIMATING,
  fillRoomCode,
  expandRoundStartSheet,
  clickRoundStartSubmit,
} from '../fixtures/helpers';

const OUT_DIR = resolveOutDir('layout');
const ROUND_TITLE = 'Implement OAuth flow';
// Host votes 3, joiner #1 votes 5, joiner #2 stays unvoted so auto-reveal
// does not trigger and the host stays on /estimating for the screenshot.
const HOST = { name: 'Alex', vote: '3' };
const JOINER_VOTER = { name: 'Bob', vote: '5' };
const JOINER_PENDING = { name: 'Carol' };

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

async function makeContext(
  browser: Browser,
  viewport: { width: number; height: number },
  colorScheme: 'light' | 'dark',
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function onboard(page: Page, name: string): Promise<void> {
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/onboarding/);
  await page.locator(ONBOARDING.nameInput).locator('input').fill(name);
  await page.locator(ONBOARDING.continueBtn).click();
  await page.waitForURL(/\/home/);
}

async function hostCreate(page: Page): Promise<string> {
  await page.locator(HOME.createCard).click();
  await page.waitForURL(/\/lobby/);
  const codeEl = page.locator(LOBBY.roomCode);
  await codeEl.waitFor({ state: 'visible' });
  const code = (await codeEl.textContent()) ?? '';
  return code.replaceAll(/[^A-Z0-9]/gi, '');
}

async function joinerJoin(page: Page, code: string): Promise<void> {
  await page.goto(`${BASE_URL}/join`);
  await fillRoomCode(page, code);
  // The sixth character submits: no Join tap after a typed code.
  await page.waitForURL(/\/lobby/);
}

async function castVote(page: Page, value: string): Promise<void> {
  await page.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
  await page.locator(ESTIMATING.card(value)).first().click();
}

async function runScenario(
  browser: Browser,
  viewport: { width: number; height: number },
  colorScheme: 'light' | 'dark',
  outName: string,
): Promise<void> {
  const contexts: BrowserContext[] = [];
  try {
    // Host
    const { ctx: hostCtx, page: hostPage } = await makeContext(browser, viewport, colorScheme);
    contexts.push(hostCtx);
    await onboard(hostPage, HOST.name);
    const code = await hostCreate(hostPage);

    // Joiner who will vote
    const { ctx: jvCtx, page: jvPage } = await makeContext(browser, viewport, colorScheme);
    contexts.push(jvCtx);
    await onboard(jvPage, JOINER_VOTER.name);
    await joinerJoin(jvPage, code);

    // Joiner who will stay pending (no vote → blocks auto-reveal)
    const { ctx: jpCtx, page: jpPage } = await makeContext(browser, viewport, colorScheme);
    contexts.push(jpCtx);
    await onboard(jpPage, JOINER_PENDING.name);
    await joinerJoin(jpPage, code);

    // Host sees 3 participants in lobby
    await hostPage.locator(LOBBY.participantList).waitFor({ state: 'visible' });

    // Host starts round
    const startBtn = hostPage
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startBtn.click();
    await expandRoundStartSheet(hostPage);
    await hostPage
      .locator('app-round-start-sheet ion-input')
      .first()
      .locator('input')
      .fill(ROUND_TITLE);
    await hostPage.locator('app-round-start-sheet ion-input').first().locator('input').blur();
    await clickRoundStartSubmit(hostPage);

    // Host votes, one joiner votes, third stays pending
    await castVote(hostPage, HOST.vote);
    await castVote(jvPage, JOINER_VOTER.vote);

    // Settle: card-selected transition + avatar-row update + elapsed tick
    await hostPage.waitForTimeout(1200);
    await pageSettled(hostPage);

    await hostPage.screenshot({
      path: path.join(OUT_DIR, `${outName}.png`),
      fullPage: false,
    });
  } finally {
    for (const ctx of contexts) await ctx.close();
  }
}

test.describe('Estimating screen — screenshots (#191)', () => {
  test('desktop 1440 dark @all @layout @theming @estimating', async ({ browser }) => {
    test.setTimeout(180_000);
    await runScenario(browser, { width: 1440, height: 900 }, 'dark', 'estimating-1440-dark');
  });

  test('desktop 1440 light @all @layout @theming @estimating', async ({ browser }) => {
    test.setTimeout(180_000);
    await runScenario(browser, { width: 1440, height: 900 }, 'light', 'estimating-1440-light');
  });

  test('mobile 390 dark @all @layout @theming @estimating', async ({ browser }) => {
    test.setTimeout(180_000);
    await runScenario(browser, { width: 390, height: 844 }, 'dark', 'estimating-390-dark');
  });

  test('mobile 390 light @all @layout @theming @estimating', async ({ browser }) => {
    test.setTimeout(180_000);
    await runScenario(browser, { width: 390, height: 844 }, 'light', 'estimating-390-light');
  });
});
