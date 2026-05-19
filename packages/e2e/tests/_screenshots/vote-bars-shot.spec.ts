/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * One-off screenshot capture for issue #123 (vote distribution bars).
 *
 * Drives 5 participants with a spread vote distribution (3 / 5×3 / 8) so the
 * row-fill bars render with a clear plurality and two trailing groups.
 * Writes PNGs to .claude/screens/vote-bars/ in light + dark, desktop + mobile.
 *
 * Run:
 *   pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/vote-bars-shot.spec.ts
 */
import path from 'node:path';
import { test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  fillRoomCode,
} from '../fixtures/helpers';

const OUT_DIR = path.resolve(__dirname, '../../../../.claude/screens/vote-bars');

const ROUND_TITLE = 'Implement OAuth flow';
// Capped at 3 voters: playwright runs against the relay with HNCH_ROOM_CAP=3
// (set by global-setup for test-route mode), so a 4th joiner gets 4006-rejected.
const VOTERS: Array<{ name: string; vote: string }> = [
  { name: 'Alex', vote: '3' }, // host
  { name: 'Bob', vote: '5' },
  { name: 'Carol', vote: '8' },
];

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
  await page.locator('ion-button:has-text("Join")').first().click();
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
    await onboard(hostPage, VOTERS[0]!.name);
    const code = await hostCreate(hostPage);

    // Joiners (all same viewport — only host page is screenshotted)
    const joinerPages: Page[] = [];
    for (let i = 1; i < VOTERS.length; i++) {
      const { ctx, page } = await makeContext(browser, viewport, colorScheme);
      contexts.push(ctx);
      await onboard(page, VOTERS[i]!.name);
      await joinerJoin(page, code);
      joinerPages.push(page);
    }

    // Host sees 5 participants in lobby
    await hostPage.locator(LOBBY.participantList).waitFor({ state: 'visible' });

    // Host starts round
    const startBtn = hostPage
      .locator('app-lobby:not(.ion-page-hidden) ion-button')
      .filter({ hasText: LOBBY.startRoundBtn });
    await startBtn.evaluate((el: HTMLElement) => el.click());
    await hostPage.locator('app-round-start-sheet').waitFor({ state: 'visible' });
    await hostPage.locator(ROUND_START.titleInput).locator('input').fill(ROUND_TITLE);
    await hostPage.locator(ROUND_START.startBtn).evaluate((el: HTMLElement) => el.click());
    await hostPage.waitForURL(/\/estimating/);

    // All vote
    await castVote(hostPage, VOTERS[0]!.vote);
    for (let i = 0; i < joinerPages.length; i++) {
      await castVote(joinerPages[i]!, VOTERS[i + 1]!.vote);
    }

    // Unanimous auto-reveal → /lobby on host
    await hostPage.waitForURL(/\/lobby/, { timeout: 15_000 });
    await hostPage.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });
    await hostPage.waitForTimeout(800); // settle stagger + bar

    await hostPage.screenshot({
      path: path.join(OUT_DIR, `${outName}.png`),
      fullPage: false,
    });
  } finally {
    for (const ctx of contexts) await ctx.close();
  }
}

test.describe('Vote distribution bars — screenshots', () => {
  test('desktop 1440 dark', async ({ browser }) => {
    test.setTimeout(180_000);
    await runScenario(browser, { width: 1440, height: 900 }, 'dark', 'spread-1440-dark');
  });

  test('desktop 1440 light', async ({ browser }) => {
    test.setTimeout(180_000);
    await runScenario(browser, { width: 1440, height: 900 }, 'light', 'spread-1440-light');
  });

  test('mobile 390 dark', async ({ browser }) => {
    test.setTimeout(180_000);
    await runScenario(browser, { width: 390, height: 844 }, 'dark', 'spread-390-dark');
  });

  test('mobile 390 light', async ({ browser }) => {
    test.setTimeout(180_000);
    await runScenario(browser, { width: 390, height: 844 }, 'light', 'spread-390-light');
  });
});
