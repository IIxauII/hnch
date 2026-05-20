/* eslint-disable max-lines-per-function -- linear capture tour; splitting obscures capture order */
/**
 * Screenshot capture for agenda feature states (ADR-0042).
 *
 * Writes PNGs to docs/screenshots/<sha>/agenda/ (via shared helper) covering key agenda UI
 * states on desktop 1440 viewport: empty panel, add sheet (open + filled),
 * 3-item list, edit sheet, round-start pre-fill, mid-session (1 consumed),
 * skipped badge, cancelled hidden, and mobile joiner chip.
 *
 * Run with:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list \
 *     tests/_screenshots/agenda-states.spec.ts
 */
import path from 'node:path';
import { test, type BrowserContext, type Page } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';
import {
  BASE_URL,
  LOBBY,
  HOME,
  expandRoundStartSheet,
  clickRoundStartSubmit,
} from '../fixtures/helpers';

const OUT_DIR = resolveOutDir('agenda');
// Disable trace/video/screenshot artefacts — we write our own files.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Serial mode: tests share a browser instance; use --workers=1 so contexts
// don't race for relay room slots when HNCH_ROOM_CAP limits concurrent peers.
test.describe.configure({ mode: 'serial' });

// Opt-in: only runs when SCREENSHOT_CAPTURE=1 so normal test runs skip it.
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

async function onboard(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/(home|onboarding)/);
  if (page.url().includes('/onboarding')) {
    await page.locator('ion-input[autocapitalize="words"]').locator('input').fill('ScreenHost');
    await page.locator('ion-button:has-text("Continue")').click();
    await page.waitForURL(/\/home/);
  }
}

async function createSession(page: Page): Promise<string> {
  await page.locator(HOME.createCard).click();
  await page.waitForURL(/\/lobby/);
  await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });
  // Wait for host status via startRoundBtn proxy.
  await page
    .locator('app-lobby:not(.ion-page-hidden) ion-button')
    .filter({ hasText: LOBBY.startRoundBtn })
    .waitFor({ state: 'visible', timeout: 12_000 });
  const code = (await page.locator('button.room-code span').textContent()) ?? '';
  return code.replaceAll(/[^A-Z0-9]/gi, '');
}

async function addItem(page: Page, input: { title?: string; ticketId?: string }): Promise<void> {
  const panel = page.locator('app-agenda-panel section.agenda-panel');
  await panel.waitFor({ state: 'visible' });
  const addBtn = panel.getByRole('button', { name: 'Add agenda item' });
  await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await addBtn.click();

  const sheetTitle = page.locator('app-agenda-item-form-sheet ion-title');
  await sheetTitle.waitFor({ state: 'visible', timeout: 10_000 });

  if (input.title !== undefined) {
    const f = page.getByRole('textbox', { name: 'Story title' });
    await f.waitFor({ state: 'visible', timeout: 5_000 });
    await f.fill(input.title);
  }
  if (input.ticketId !== undefined) {
    const f = page.getByRole('textbox', { name: 'Issue tracker ticket ID' });
    await f.waitFor({ state: 'visible', timeout: 5_000 });
    await f.fill(input.ticketId);
  }

  const submitBtn = page
    .locator('app-agenda-item-form-sheet')
    .getByRole('button', { name: /^(Add|Save) agenda item$/u });
  await submitBtn.waitFor({ state: 'visible', timeout: 5_000 });
  // Brief settle before submit to let Angular reactivity stabilize between rapid calls.
  await page.waitForTimeout(200);
  await submitBtn.click();
  await sheetTitle.waitFor({ state: 'hidden', timeout: 15_000 });
}

test.describe('agenda state screenshots', () => {
  test('desktop — all agenda states @host @layout', async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page } = await freshCtx(browser, { width: 1440, height: 900 });

    try {
      await onboard(page);
      await createSession(page);

      // 01 — empty agenda panel (host, desktop)
      await shot(page, '01-empty-agenda-host-desktop');

      // 02 — add sheet open (empty)
      const panel = page.locator('app-agenda-panel section.agenda-panel');
      const addBtn = panel.getByRole('button', { name: 'Add agenda item' });
      await addBtn.waitFor({ state: 'visible' });
      await addBtn.click();
      const sheetTitle = page.locator('app-agenda-item-form-sheet ion-title');
      await sheetTitle.waitFor({ state: 'visible', timeout: 10_000 });
      await shot(page, '02-agenda-add-sheet-open');

      // Fill and capture again
      await page.getByRole('textbox', { name: 'Story title' }).fill('Login redesign');
      await page.getByRole('textbox', { name: 'Issue tracker ticket ID' }).fill('AUTH-101');
      await shot(page, '03-agenda-add-sheet-filled');

      // Submit
      const submitBtn = page
        .locator('app-agenda-item-form-sheet')
        .getByRole('button', { name: /^Add agenda item$/u });
      await submitBtn.click();
      await sheetTitle.waitFor({ state: 'hidden', timeout: 5_000 });

      // Add 2 more items
      await addItem(page, { title: 'API rate limiting', ticketId: 'PROJ-99' });
      await addItem(page, { ticketId: 'PROJ-42' });

      // 04 — 3-item list (host desktop)
      await shot(page, '04-agenda-3-items-host-desktop');

      // 05 — edit sheet open for first item
      const list = page.locator('app-agenda-panel ion-list.agenda-list');
      const firstItem = list.locator('ion-item.agenda-item').first();
      const editBtn = firstItem.getByRole('button', { name: /^Edit /u });
      await editBtn.waitFor({ state: 'visible' });
      await editBtn.click();
      const editSheetTitle = page.locator('app-agenda-item-form-sheet ion-title');
      await editSheetTitle.waitFor({ state: 'visible', timeout: 10_000 });
      await shot(page, '05-agenda-edit-sheet-open');
      await page.keyboard.press('Escape');
      await editSheetTitle.waitFor({ state: 'hidden', timeout: 5_000 });

      // 06 — round-start modal pre-filled from item 1
      const startRoundBtn = page
        .locator('app-lobby:not(.ion-page-hidden) ion-button')
        .filter({ hasText: LOBBY.startRoundBtn });
      await startRoundBtn.waitFor({ state: 'visible' });
      await startRoundBtn.click();
      await expandRoundStartSheet(page);
      await shot(page, '06-round-start-modal-prefilled');

      // Start round, vote, and return to lobby
      await clickRoundStartSubmit(page);
      await page.locator('app-estimating:not(.ion-page-hidden)').waitFor({ state: 'visible' });
      await page
        .locator('app-estimating ion-card.card:has(ion-card-content:text-is("5"))')
        .first()
        .click();
      await page.waitForURL(/\/lobby/, { timeout: 15_000 });
      await page.locator(LOBBY.resultsSection).waitFor({ state: 'visible', timeout: 8_000 });

      // 07 — mid-session: item 1 consumed
      await shot(page, '07-agenda-mid-session-one-consumed');

      // Skip item 3 (index 2)
      const skipItem = list.locator('ion-item.agenda-item').nth(2);
      const skipBtn = skipItem.getByRole('button', { name: /^Skip /u });
      await skipBtn.waitFor({ state: 'visible' });
      await skipBtn.click();
      await page.waitForTimeout(300);

      // 08 — skipped badge
      await shot(page, '08-agenda-skipped-badge');

      // Cancel item 2 (now index 1)
      const cancelItem = list.locator('ion-item.agenda-item').nth(1);
      const cancelItemBtn = cancelItem.getByRole('button', { name: /^Cancel /u });
      await cancelItemBtn.waitFor({ state: 'visible' });
      await cancelItemBtn.click();
      await page.waitForTimeout(300);

      // 09 — cancelled item hidden
      await shot(page, '09-agenda-cancelled-hidden');
    } finally {
      await ctx.close();
    }
  });

  test('mobile — joiner chip collapsed + expanded @host @layout @participants', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    // Host session with items
    const { ctx: hostCtx, page: hostPage } = await freshCtx(browser, { width: 1440, height: 900 });
    // Joiner on mobile viewport
    const { ctx: joinerCtx, page: joinerPage } = await freshCtx(browser, {
      width: 375,
      height: 812,
    });

    try {
      await onboard(hostPage);
      const code = await createSession(hostPage);
      await addItem(hostPage, { title: 'Story Alpha' });
      await addItem(hostPage, { title: 'Story Beta', ticketId: 'BETA-1' });

      // Joiner joins
      await joinerPage.goto(`${BASE_URL}/home`);
      await joinerPage.waitForURL(/\/(home|onboarding)/);
      if (joinerPage.url().includes('/onboarding')) {
        await joinerPage
          .locator('ion-input[autocapitalize="words"]')
          .locator('input')
          .fill('Joiner');
        await joinerPage.locator('ion-button:has-text("Continue")').click();
        await joinerPage.waitForURL(/\/home/);
      }
      await joinerPage.locator(HOME.joinCard).click();
      await joinerPage.waitForURL(/\/join/);
      const firstTile = joinerPage.locator('app-segmented-code-input').locator('input').first();
      await firstTile.focus();
      await joinerPage.keyboard.type(code);
      await joinerPage.locator('ion-button:has-text("Join")').click();
      await joinerPage.waitForURL(/\/lobby/, { timeout: 15_000 });

      // 10 — joiner mobile collapsed (Next-up chip visible)
      const chip = joinerPage.locator('app-agenda-panel ion-chip.next-up-chip');
      await chip.waitFor({ state: 'visible', timeout: 10_000 });
      await shot(joinerPage, '10-agenda-joiner-mobile-collapsed');

      // 11 — joiner mobile expanded
      await chip.click();
      await joinerPage
        .locator('app-agenda-panel section.agenda-panel')
        .waitFor({ state: 'visible' });
      await shot(joinerPage, '11-agenda-joiner-mobile-expanded');
    } finally {
      await hostCtx.close();
      await joinerCtx.close();
    }
  });
});
