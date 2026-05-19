/* eslint-disable max-lines-per-function -- linear capture script */
/**
 * Screenshot capture for issue #196 — participant initials on vote-progress dots.
 *
 * Captures the AvatarVoteRowComponent in multiple states at mobile (390) and
 * desktop (1280) viewports, in both light and dark color schemes.
 *
 * Run with:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/vote-dots-196.spec.ts
 *
 * Output: .tmp-screens-196/<name>.png at repo root.
 */
import path from 'node:path';
import { test, type BrowserContext, type Page } from '@playwright/test';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  JOIN,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  fillRoomCode,
} from '../fixtures/helpers';

const OUT_DIR = path.resolve(__dirname, '../../../../.tmp-screens-196');

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ mode: 'serial' });
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

async function newClient(
  browser: import('@playwright/test').Browser,
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

async function host_createSession(page: Page): Promise<string> {
  await page.locator(HOME.createCard).click();
  await page.waitForURL(/\/lobby/);
  const codeEl = page.locator(LOBBY.roomCode);
  await codeEl.waitFor({ state: 'visible' });
  const code = (await codeEl.textContent()) ?? '';
  return code.replaceAll(/[^A-Z0-9]/gi, '');
}

async function joinSession(page: Page, code: string): Promise<void> {
  await page.locator(HOME.joinCard).click();
  await page.waitForURL(/\/join/);
  await fillRoomCode(page, code);
  await page.locator(JOIN.joinBtn).click();
  await page.waitForURL(/\/lobby/);
}

async function startRound(page: Page, title: string): Promise<void> {
  const startBtn = page
    .locator('app-lobby:not(.ion-page-hidden) ion-button')
    .filter({ hasText: LOBBY.startRoundBtn });
  await startBtn.waitFor({ state: 'visible' });
  await startBtn.click();
  const modal = page.locator('app-round-start-sheet');
  await modal.waitFor({ state: 'visible' });
  await modal.locator('ion-input').locator('input').fill(title);
  await page.locator(ROUND_START.startBtn).click();
  await page.waitForURL(/\/estimating/);
}

async function castVote(page: Page, value: string): Promise<void> {
  await page.locator(ESTIMATING.card(value)).first().click();
  await page.locator(ESTIMATING.selectedCard).first().waitFor({ state: 'visible' });
}

async function shotRow(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(300);
  const row = page.locator('app-avatar-vote-row').first();
  await row.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

async function shotFull(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

interface Scenario {
  label: string;
  viewport: { width: number; height: number };
  colorScheme: 'light' | 'dark';
}

const SCENARIOS: Scenario[] = [
  { label: 'mobile-390-light', viewport: { width: 390, height: 844 }, colorScheme: 'light' },
  { label: 'mobile-390-dark', viewport: { width: 390, height: 844 }, colorScheme: 'dark' },
  { label: 'desktop-1280-light', viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
  { label: 'desktop-1280-dark', viewport: { width: 1280, height: 900 }, colorScheme: 'dark' },
];

// Participant names exercise: short, medium, >10-char (truncation).
// Limited to 3 — relay test config caps rooms at 3 (HNCH_ROOM_CAP).
const PARTICIPANT_NAMES = ['Alice', 'Bob', 'Christopher'];

for (const sc of SCENARIOS) {
  test(`vote-dots ${sc.label}`, async ({ browser }) => {
    test.setTimeout(240_000);

    const clients: { ctx: BrowserContext; page: Page; name: string }[] = [];
    try {
      for (const name of PARTICIPANT_NAMES) {
        const { ctx, page } = await newClient(browser, sc.viewport, sc.colorScheme);
        await onboard(page, name);
        clients.push({ ctx, page, name });
      }
      const [hostC, p2, p3] = clients;

      const code = await host_createSession(hostC.page);
      await joinSession(p2.page, code);
      await joinSession(p3.page, code);

      // Wait for roster to fan-in
      await hostC.page.waitForTimeout(1000);

      await startRound(hostC.page, 'Implement OAuth flow');
      // Wait others to navigate
      for (const c of [p2, p3]) {
        await c.page.waitForURL(/\/estimating/, { timeout: 10_000 });
      }
      await hostC.page.waitForTimeout(500);

      // State A: 0/3 voted — all dots empty
      await shotRow(hostC.page, `${sc.label}-state-a-0of3`);
      await shotFull(hostC.page, `${sc.label}-state-a-0of3-full`);

      // Host votes → 1/3
      await castVote(hostC.page, '3');
      await hostC.page.waitForTimeout(400);
      await shotRow(hostC.page, `${sc.label}-state-b-1of3`);
      await shotFull(hostC.page, `${sc.label}-state-b-1of3-full`);

      // Second votes → 2/3
      await castVote(p2.page, '5');
      await hostC.page.waitForTimeout(600);
      await shotRow(hostC.page, `${sc.label}-state-c-2of3`);
      await shotFull(hostC.page, `${sc.label}-state-c-2of3-full`);
    } finally {
      for (const c of clients) await c.ctx.close();
    }
  });
}
