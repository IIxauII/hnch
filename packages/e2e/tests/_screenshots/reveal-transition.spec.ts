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
import { test, type BrowserContext, type Page } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';
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

const OUT_DIR = resolveOutDir('reveal');
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
  test('pre-reveal (all voted) + post-reveal lobby @reveal', async ({ browser }) => {
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
      await startBtn.click();
      await expandRoundStartSheet(hostPage);
      await hostPage
        .locator('app-round-start-sheet ion-input')
        .first()
        .locator('input')
        .fill('Auth flow redesign');
      await hostPage.locator('app-round-start-sheet ion-input').first().locator('input').blur();
      await clickRoundStartSubmit(hostPage);
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

  async function runConsensusScene(
    browser: import('@playwright/test').Browser,
    viewport: { width: number; height: number },
    colorScheme: 'light' | 'dark',
    reducedMotion: boolean,
    outName: string,
  ): Promise<void> {
    const contexts: BrowserContext[] = [];
    try {
      // Create host context with requested scheme
      const hostCtx = await browser.newContext({
        viewport,
        deviceScaleFactor: 2,
        colorScheme,
      });
      contexts.push(hostCtx);
      const hostPage = await hostCtx.newPage();

      if (reducedMotion) {
        await hostPage.emulateMedia({ reducedMotion: 'reduce' });
      }

      await onboard(hostPage, VOTERS[0]!.name);

      // Host creates session
      await hostPage.locator(HOME.createCard).click();
      await hostPage.waitForURL(/\/lobby/);
      const codeEl = hostPage.locator(LOBBY.roomCode);
      await codeEl.waitFor({ state: 'visible' });
      const code = ((await codeEl.textContent()) ?? '').replaceAll(/[^A-Z0-9]/gi, '');

      // Two joiners (same scheme for consistency)
      const joinerPages: Page[] = [];
      for (let i = 1; i < VOTERS.length; i++) {
        const ctx = await browser.newContext({
          viewport,
          deviceScaleFactor: 2,
          colorScheme,
        });
        contexts.push(ctx);
        const page = await ctx.newPage();
        if (reducedMotion) {
          await page.emulateMedia({ reducedMotion: 'reduce' });
        }
        await onboard(page, VOTERS[i]!.name);
        await joinSession(page, code);
        joinerPages.push(page);
      }

      // Confirm participants visible
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
        .fill('New Feature');
      await clickRoundStartSubmit(hostPage);
      await hostPage.waitForURL(/\/estimating/);
      await hostPage.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });

      // All vote the same card (consensus trigger)
      for (const page of [hostPage, ...joinerPages]) {
        await castVote(page, '5');
      }

      // Wait for auto-reveal to fire and navigate to /lobby
      await hostPage.waitForURL(/\/lobby/, { timeout: 10_000 });
      await hostPage.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });
      await hostPage.locator('.consensus-overlay').waitFor({ state: 'visible' });

      if (reducedMotion) {
        // Static state — capture at any stable point
        await hostPage.waitForTimeout(250);
      } else {
        // Motion state — capture at t≈500ms into overlay window
        await hostPage.waitForTimeout(500);
      }

      await shot(hostPage, outName);
    } finally {
      for (const ctx of contexts) await ctx.close();
    }
  }

  test('consensus celebration overlay — motion, desktop 1440 dark @reveal', async ({ browser }) => {
    test.setTimeout(180_000);
    await runConsensusScene(
      browser,
      { width: 1440, height: 900 },
      'dark',
      false,
      'consensus-motion-1440-dark',
    );
  });

  test('consensus celebration overlay — motion, desktop 1440 light @reveal', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    await runConsensusScene(
      browser,
      { width: 1440, height: 900 },
      'light',
      false,
      'consensus-motion-1440-light',
    );
  });

  test('consensus celebration overlay — motion, mobile 375 dark @reveal', async ({ browser }) => {
    test.setTimeout(180_000);
    await runConsensusScene(
      browser,
      { width: 375, height: 812 },
      'dark',
      false,
      'consensus-motion-375-dark',
    );
  });

  test('consensus celebration overlay — motion, mobile 375 light @reveal', async ({ browser }) => {
    test.setTimeout(180_000);
    await runConsensusScene(
      browser,
      { width: 375, height: 812 },
      'light',
      false,
      'consensus-motion-375-light',
    );
  });

  test('consensus celebration overlay — reduced-motion, desktop 1440 dark @reveal', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    await runConsensusScene(
      browser,
      { width: 1440, height: 900 },
      'dark',
      true,
      'consensus-reduced-1440-dark',
    );
  });

  test('consensus celebration overlay — reduced-motion, desktop 1440 light @reveal', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    await runConsensusScene(
      browser,
      { width: 1440, height: 900 },
      'light',
      true,
      'consensus-reduced-1440-light',
    );
  });

  test('consensus celebration overlay — reduced-motion, mobile 375 dark @reveal', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    await runConsensusScene(
      browser,
      { width: 375, height: 812 },
      'dark',
      true,
      'consensus-reduced-375-dark',
    );
  });

  test('consensus celebration overlay — reduced-motion, mobile 375 light @reveal', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    await runConsensusScene(
      browser,
      { width: 375, height: 812 },
      'light',
      true,
      'consensus-reduced-375-light',
    );
  });
});
