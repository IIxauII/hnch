/**
 * Shared helper: open a half-sheet on a 375px-wide mobile context and
 * return the page for visibility assertions.
 *
 * Used by the 375px sheet guards in `sheet-actions-mobile.spec.ts` (issues
 * #445–#448) and by the round-start and agenda-item-form screenshot specs.
 * Import this rather than copy-pasting the freshCtx + onboard + sheet-open
 * dance into every spec.
 *
 * Not a Playwright test file (no .spec.ts suffix) — the default testMatch
 * glob does not pick it up.
 */
import type { Browser, BrowserContext, Page } from '@playwright/test';

export const MOBILE_VIEWPORT = { width: 375, height: 812 } as const;

/**
 * Create a fresh 375px-wide browser context with a dark colour scheme.
 * The caller is responsible for closing `ctx` in a finally block.
 */
export async function freshMobileCtx(
  browser: Browser,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: MOBILE_VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  return { ctx, page };
}

/**
 * Navigate to /home (or /onboarding) and complete onboarding if needed.
 * Leaves the page on the Home screen.
 */
export async function onboardMobile(
  page: Page,
  baseUrl: string,
  name = 'MobileHost',
): Promise<void> {
  await page.goto(`${baseUrl}/home`);
  await page.waitForURL(/\/(home|onboarding)/);
  if (page.url().includes('/onboarding')) {
    await page.locator('ion-input[autocapitalize="words"]').locator('input').fill(name);
    await page.locator('ion-button:has-text("Continue")').click();
    await page.waitForURL(/\/home/);
  }
}

/**
 * Create a session and navigate to the Lobby. Returns the 6-char room code.
 * Waits until the host "Start round N" button is visible so callers know
 * host authority has been established.
 */
export async function createSessionMobile(page: Page): Promise<string> {
  await page.locator('ion-item:has(h3:text-is("New session"))').click();
  await page.waitForURL(/\/lobby/);
  await page.locator('ion-list.participants').waitFor({ state: 'visible' });
  await page
    .locator('app-lobby:not(.ion-page-hidden) ion-button')
    .filter({ hasText: /Start round \d+/ })
    .waitFor({ state: 'visible', timeout: 12_000 });
  const code = (await page.locator('button.room-code span').textContent()) ?? '';
  return code.replaceAll(/[^A-Z0-9]/gi, '');
}

/**
 * Open the round-start half-sheet on a mobile page already on the Lobby
 * screen. Returns a locator scoped to the sheet element once it is visible.
 *
 * On mobile the sheet opens at the `0.6` breakpoint (buttons in a footer
 * would be off-screen here). After this call the sheet is visible at its
 * natural 0.6 breakpoint — DO NOT expand it to 0.95, because the whole
 * point of these tests is to assert button visibility at the initial
 * breakpoint.
 */
export async function openRoundStartSheetMobile(page: Page) {
  const startRoundBtn = page
    .locator('app-lobby:not(.ion-page-hidden) ion-button')
    .filter({ hasText: /Start round \d+/ });
  await startRoundBtn.waitFor({ state: 'visible' });
  await startRoundBtn.click();
  const sheet = page.locator('app-round-start-sheet');
  await sheet.waitFor({ state: 'visible', timeout: 10_000 });
  return sheet;
}

/**
 * Turn on "Ask for a password" in app settings, then return to Home and
 * create a session so the session-password half-sheet opens. Returns a
 * locator scoped to the sheet element once it is visible.
 *
 * Precondition: `page` is on the Home screen (after `onboardMobile`).
 * The caller is responsible for closing the browser context in a finally block.
 * DO NOT expand the sheet to 0.95 — assert button visibility at the natural
 * 0.6 breakpoint.
 */
export async function openSetPasswordSheetMobile(page: Page, baseUrl: string) {
  // Turn on the "Ask for a password" toggle in app settings.
  await page.goto(`${baseUrl}/settings`);
  await page.waitForURL(/\/settings/);
  const toggle = page.locator('app-settings ion-toggle:has-text("Ask for a password")');
  await toggle.waitFor({ state: 'visible' });
  const isChecked = await toggle.evaluate(
    (el: HTMLElement & { checked?: boolean }) => el.checked === true,
  );
  if (!isChecked) {
    await toggle.click();
    await page.waitForTimeout(300);
  }

  // Return to Home.
  await page.goto(`${baseUrl}/home`);
  await page.waitForURL(/\/home/);

  // New session — the password-prompt sheet opens automatically.
  await page.locator('ion-item:has(h3:text-is("New session"))').click();
  const sheet = page.locator('app-password-prompt-sheet');
  await sheet.waitFor({ state: 'visible', timeout: 15_000 });
  return sheet;
}

/**
 * Open the story form sheet (Add mode) on a mobile page already on the Lobby
 * screen. Returns a locator scoped to the sheet element once visible.
 *
 * The agenda is a card on the Lobby with the same layout on every surface:
 * the list (or a line saying there is none yet), then the host's "Add story"
 * button. Nothing to expand first.
 *
 * The sheet opens at the `0.6` initial breakpoint — do NOT expand it, because
 * the regression guard is specifically about visibility at that breakpoint.
 */
export async function openAgendaItemSheetMobile(page: Page) {
  const sheet = page.locator('app-agenda-item-form-sheet');
  const addBtn = page.locator(
    'app-lobby:not(.ion-page-hidden) app-agenda-panel ion-button.add-btn',
  );
  await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  await sheet.waitFor({ state: 'visible', timeout: 10_000 });
  return sheet;
}

/**
 * Open the ⋯ menu of the nth story on the agenda (0-based) and pick an
 * action. On a phone the menu is an action sheet.
 */
export async function agendaItemActionMobile(
  page: Page,
  index: number,
  action: string,
): Promise<void> {
  const item = page
    .locator('app-lobby:not(.ion-page-hidden) app-agenda-panel ion-item.agenda-item')
    .nth(index);
  const menuBtn = item.locator('ion-button.item-menu-btn');
  await menuBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await menuBtn.scrollIntoViewIfNeeded();
  await menuBtn.click();
  const option = page.locator(`ion-action-sheet button:has-text("${action}")`);
  await option.waitFor({ state: 'visible', timeout: 5_000 });
  await option.click();
}

/**
 * Open the round-edit half-sheet on a mobile page already on the Lobby
 * screen after at least one round has been revealed.
 *
 * Drives the full single-host flow to produce a revealed round:
 *   1. Clicks "Start round N" and submits the sheet (with an optional title).
 *   2. Waits for /estimating, casts a vote — auto-reveal fires for a solo host.
 *   3. Waits for the Lobby results section to appear.
 *   4. Clicks the pencil ("Edit round descriptor") button.
 *   5. Returns a locator scoped to the open `app-round-edit-sheet`.
 *
 * After this call the sheet is visible at its natural 0.6 breakpoint — DO NOT
 * expand it programmatically; the whole point of these tests is to assert
 * button visibility at the initial breakpoint.
 */
export async function openRoundEditSheetMobile(page: Page, roundTitle = 'Test round') {
  // 1. Open the round-start sheet and submit it.
  const startRoundBtn = page
    .locator('app-lobby:not(.ion-page-hidden) ion-button')
    .filter({ hasText: /Start round \d+/ });
  await startRoundBtn.waitFor({ state: 'visible' });
  await startRoundBtn.click();
  const startSheet = page.locator('app-round-start-sheet');
  await startSheet.waitFor({ state: 'visible', timeout: 10_000 });
  // Fill the title so the round has a descriptor to edit later.
  await startSheet.locator('ion-input').first().locator('input').fill(roundTitle);
  const startBtn = startSheet.getByRole('button', { name: 'Start round' });
  await startBtn.waitFor({ state: 'visible' });
  await startBtn.dispatchEvent('click');
  await startSheet.waitFor({ state: 'hidden', timeout: 10_000 });

  // 2. Wait for /estimating, then cast a vote (solo host — auto-reveal fires).
  await page.waitForURL(/\/estimating/, { timeout: 15_000 });
  const active = page.locator('app-estimating:not(.ion-page-hidden):not(.ion-page-invisible)');
  await active.waitFor({ timeout: 10_000 });
  // Pick any card from the Fibonacci scale (default).
  const card = page.locator('app-estimating ion-card.card').first();
  await card.waitFor({ state: 'visible', timeout: 10_000 });
  await card.click();

  // 3. Auto-reveal navigates back to /lobby; wait for the results section.
  await page.waitForURL(/\/lobby/, { timeout: 15_000 });
  await page.locator('.results-section').waitFor({ state: 'visible', timeout: 10_000 });

  // 4. Click the pencil button to open the round-edit sheet.
  const pencil = page.locator('.results-descriptor-row ion-button.edit-btn');
  await pencil.waitFor({ state: 'visible', timeout: 5_000 });
  await pencil.click();

  // 5. Return the scoped sheet locator once it is visible.
  const sheet = page.locator('app-round-edit-sheet');
  await sheet.waitFor({ state: 'visible', timeout: 10_000 });
  return sheet;
}
