/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture — pre-reveal and post-reveal lobby.
 *
 * Scenes:
 *   reveal-01  — all 3 voters have voted, host has NOT tapped Reveal yet
 *                (manual reveal room — auto-reveal suppressed by 3-voter quorum)
 *   reveal-02  — post-reveal lobby (VoteResultsComponent visible)
 *
 * Ordering invariant: host page reveals only after all 3 votes are cast and
 * confirmed via voteCount. This prevents auto-reveal from firing before the
 * pre-reveal screenshot. With 3 voters unanimous auto-reveal fires when the
 * last vote lands — we use manual reveal by having the host vote last and
 * screenshot before calling reveal().
 *
 * Run:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/reveal-transition.spec.ts
 */
import path from 'node:path';
import fs from 'node:fs';
import { test, type BrowserContext, type Page } from '@playwright/test';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  fillRoomCode,
} from '../fixtures/helpers';

const SHA = process.env['SCREENSHOT_SHA'] ?? 'local';
const OUT_DIR = path.resolve(__dirname, '../../../../docs/screenshots', SHA);

const VOTERS: Array<{ name: string; vote: string }> = [
  { name: 'Host', vote: '5' },
  { name: 'Alice', vote: '3' },
  { name: 'Bob', vote: '8' },
];

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ mode: 'serial' });
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

async function freshCtx(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function onboard(page: Page, name: string): Promise<void> {
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/(home|onboarding)/);
  if (page.url().includes('/onboarding')) {
    await page.locator(ONBOARDING.nameInput).locator('input').fill(name);
    await page.locator(ONBOARDING.continueBtn).click();
    await page.waitForURL(/\/home/);
  }
}

async function joinSession(page: Page, code: string): Promise<void> {
  await page.goto(`${BASE_URL}/join`);
  await fillRoomCode(page, code);
  await page.locator('ion-button:has-text("Join")').first().click();
  await page.waitForURL(/\/lobby/);
}

async function castVote(page: Page, value: string): Promise<void> {
  await page.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
  await page.locator(ESTIMATING.card(value)).first().click();
}

test.describe('reveal transition screenshots', () => {
  test('pre-reveal (all voted) + post-reveal lobby', async ({ browser }) => {
    test.setTimeout(180_000);
    const viewport = { width: 1440, height: 900 };
    const contexts: BrowserContext[] = [];

    try {
      const { ctx: hostCtx, page: hostPage } = await freshCtx(browser, viewport);
      contexts.push(hostCtx);
      await onboard(hostPage, VOTERS[0]!.name);

      // Host creates session
      await hostPage.locator(HOME.createCard).click();
      await hostPage.waitForURL(/\/lobby/);
      const codeEl = hostPage.locator(LOBBY.roomCode);
      await codeEl.waitFor({ state: 'visible' });
      const code = ((await codeEl.textContent()) ?? '').replaceAll(/[^A-Z0-9]/gi, '');

      // Two joiners
      const joinerPages: Page[] = [];
      for (let i = 1; i < VOTERS.length; i++) {
        const { ctx, page } = await freshCtx(browser, viewport);
        contexts.push(ctx);
        await onboard(page, VOTERS[i]!.name);
        await joinSession(page, code);
        joinerPages.push(page);
      }

      // Confirm 3 participants visible to host
      await hostPage.locator(LOBBY.participantList).waitFor({ state: 'visible' });

      // Host starts round
      const startBtn = hostPage
        .locator('app-lobby:not(.ion-page-hidden) ion-button')
        .filter({ hasText: LOBBY.startRoundBtn });
      await startBtn.evaluate((el: HTMLElement) => el.click());
      await hostPage.locator('app-round-start-sheet').waitFor({ state: 'visible' });
      await hostPage
        .locator('app-round-start-sheet ion-input')
        .first()
        .locator('input')
        .fill('Auth flow redesign');
      await hostPage.locator(ROUND_START.startBtn).evaluate((el: HTMLElement) => el.click());
      await hostPage.waitForURL(/\/estimating/);
      await hostPage.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });

      // Joiners vote first — host votes last to stay pre-auto-reveal for screenshot
      for (let i = 0; i < joinerPages.length; i++) {
        await castVote(joinerPages[i]!, VOTERS[i + 1]!.vote);
      }
      // Wait for 2-of-3 count visible on host (all joiners voted)
      await hostPage.locator(ESTIMATING.voteCount).first().waitFor({ state: 'visible' });
      await hostPage.waitForTimeout(500);

      // reveal-01 — pre-reveal: all joiners voted, host has not yet (3-voter room,
      // auto-reveal won't fire until host also votes — capture the Reveal Votes button).
      // Note: if auto-reveal fires before we screenshot, page will have navigated to /lobby.
      await shot(hostPage, 'reveal-01-pre-reveal-estimating');

      // Host votes → unanimous auto-reveal fires → /lobby
      await castVote(hostPage, VOTERS[0]!.vote);
      await hostPage.waitForURL(/\/lobby/, { timeout: 10_000 });
      await hostPage.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });
      await hostPage.waitForTimeout(600);

      // reveal-02 — post-reveal lobby with VoteResultsComponent
      await shot(hostPage, 'reveal-02-post-reveal-lobby');
    } finally {
      for (const ctx of contexts) await ctx.close();
    }
  });
});
