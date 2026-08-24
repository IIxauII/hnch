/* eslint-disable max-lines-per-function -- long linear tour script; splitting would obscure capture order */
/**
 * Screenshot capture for docs/screenshots/<sha>/.
 *
 * Drives a single host through the full UI tour at desktop (1440) and
 * mobile (390) viewports, writing PNGs organised under docs/screenshots/<sha>/.
 *
 * SHA defaults to 'local' when SCREENSHOT_SHA env is unset — manual runs
 * land in docs/screenshots/local/ without requiring git.
 *
 * Run with:
 *   SCREENSHOT_CAPTURE=1 pnpm --filter @hnch/e2e exec playwright test \
 *     --project=chromium --workers=1 --reporter=list tests/_screenshots/capture.spec.ts
 */
import path from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { resolveOutDir } from './_helpers/out-dir';
import {
  BASE_URL,
  ONBOARDING,
  HOME,
  JOIN,
  LOBBY,
  ROUND_START,
  ESTIMATING,
  SETTINGS_SHEET,
  APP_SETTINGS,
  APP_SETTINGS_SCALE_PICKER,
  PRESET_CARD_EDITOR,
  CONNECTION_CHIP,
  expandRoundStartSheet,
  clickRoundStartSubmit,
  fillRoomCode,
} from '../fixtures/helpers';

const OUT_DIR = resolveOutDir('baseline');
const NAME = 'Alex';
const ROUND_TITLE = 'Implement OAuth flow';

// Disable HTML report viewer for this spec (we just want files).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

async function freshContext(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(200); // settle animations
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function onboard(page: Page): Promise<void> {
  await page.locator(ONBOARDING.nameInput).locator('input').fill(NAME);
  await page.locator(ONBOARDING.continueBtn).click();
  await page.waitForURL(/\/home/);
}

async function gotoFresh(page: Page, urlPath: string): Promise<void> {
  await page.goto(`${BASE_URL}${urlPath}`);
}

async function createSession(page: Page): Promise<string> {
  await page.locator(HOME.createCard).click();
  await page.waitForURL(/\/lobby/);
  const codeEl = page.locator(LOBBY.roomCode);
  await codeEl.waitFor({ state: 'visible' });
  const code = (await codeEl.textContent()) ?? '';
  return code.replaceAll(/[^A-Z0-9]/gi, '');
}

async function openHeaderMenu(page: Page): Promise<void> {
  const headerBtn = page.locator('ion-header').locator('ion-button').last();
  await headerBtn.click();
  // Either popover (desktop) or action-sheet (mobile) appears.
  await page
    .locator('ion-popover, ion-action-sheet')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
}

async function closeOverlay(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/**
 * Join an existing session as a second voter — present only so the host's
 * lone vote in the "estimating with card 5 selected" scene can't unanimously
 * auto-reveal (packages/shared/src/auto-reveal.ts: numeric votes >= online
 * voter count). Without a second voter the card grid — bound to
 * `activeRound()` — unmounts in the same tick the round goes `revealed`,
 * before `ESTIMATING.selectedCard` ever renders. Call `castCoVote` right
 * after the selected-card shot to let the pre-existing auto-reveal-driven
 * flow (navigate to /lobby, results section) continue unchanged.
 */
async function joinAsCoVoter(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`${BASE_URL}/home`);
  await page.waitForURL(/\/onboarding/);
  await page.locator(ONBOARDING.nameInput).locator('input').fill(name);
  await page.locator(ONBOARDING.continueBtn).click();
  await page.waitForURL(/\/(home|lobby|estimating)/);
  if (page.url().includes('/home')) {
    await page.goto(`${BASE_URL}/join`);
    await fillRoomCode(page, code);
    await page.locator(JOIN.joinBtn).click();
    await page.waitForURL(/\/(lobby|estimating)/);
  }
}

async function castCoVote(page: Page, value: string): Promise<void> {
  await page.locator(ESTIMATING.card(value)).first().click();
}

test.describe.configure({ mode: 'serial' });

// Opt-in via env var so normal `playwright test` runs skip this spec.
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');

test.describe('screenshot capture', () => {
  test('desktop 1440 @all @layout @theming @home', async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await freshContext(browser, { width: 1440, height: 900 });
    // Co-voter — joins after step 06 so the host's lone vote in step 14
    // can't unanimously auto-reveal before the card-selected shot. See
    // joinAsCoVoter doc comment. Never itself screenshotted.
    const { ctx: coVoterCtx, page: coVoterPage } = await freshContext(browser, {
      width: 1440,
      height: 900,
    });
    try {
      // 01 — onboarding (pre-onboard)
      await gotoFresh(page, '/home');
      await page.waitForURL(/\/onboarding/);
      await shot(page, '01-onboarding-1440');

      // 02 — home
      await onboard(page);
      await shot(page, '02-home-1440');

      // 03 — home overflow menu
      await openHeaderMenu(page);
      await shot(page, '03-home-overflow-1440');
      await closeOverlay(page);

      // 04 — settings page
      await gotoFresh(page, '/settings');
      await page.waitForURL(/\/settings/);
      await page.locator('app-settings').waitFor({ state: 'visible' });
      await shot(page, '04-settings-1440');

      // 05 — join page
      await gotoFresh(page, '/join');
      await page.waitForURL(/\/join/);
      await page.locator(JOIN.codeInput).waitFor({ state: 'visible' });
      await shot(page, '05-join-1440');

      // 06 — lobby (single host)
      await gotoFresh(page, '/home');
      await page.waitForURL(/\/home/);
      const code = await createSession(page);
      // Wait for participant list to render
      await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });
      await shot(page, '06-lobby-1440');

      // Co-voter joins now — after the solo-host lobby shot above so it
      // keeps its original single-participant composition. Present only to
      // hold the auto-reveal denominator at 2 once voting starts, so the
      // host's lone vote in step 14 can't unanimously auto-reveal before
      // the card-selected shot. See joinAsCoVoter doc comment.
      // Waiting for the second roster row on the HOST page (not just the
      // co-voter's own navigation) confirms Yjs awareness has propagated
      // before the round starts — otherwise the host's vote below could
      // still race an awareness update that hasn't landed yet.
      await joinAsCoVoter(coVoterPage, code, 'Sam');
      await page.locator(LOBBY.participantItems).nth(1).waitFor({ state: 'visible' });

      // 07 — session-settings sheet (open via subtitle)
      await page.locator(LOBBY.subtitleHostBtn).click();
      await page.locator('app-session-settings-sheet').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '07-session-settings-sheet');

      // 08 — scale picker sheet (from settings sheet → tap Scale)
      await page.locator(SETTINGS_SHEET.scaleRow).click();
      await page.locator('app-scale-picker-sheet').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '08-scale-picker-sheet');
      // Dismiss scale picker → back to settings sheet
      await page.locator('app-scale-picker-sheet ion-button:has-text("Done")').click();
      await page.locator('app-scale-picker-sheet').waitFor({ state: 'hidden' });

      // 09 — access picker sheet (from settings sheet → tap Access)
      await page.locator(SETTINGS_SHEET.accessRow).click();
      await page.locator('app-access-picker-sheet').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '09-access-sheet');
      await page.locator('app-access-picker-sheet ion-button:has-text("Done")').click();
      await page.locator('app-access-picker-sheet').waitFor({ state: 'hidden' });
      // Close settings sheet
      await page.locator(SETTINGS_SHEET.doneBtn).click();
      await page.locator('app-session-settings-sheet').waitFor({ state: 'hidden' });

      // 10 — QR modal
      await page.locator('ion-item:has-text("Show QR code")').click();
      await page.locator('app-qr-display-sheet').waitFor({ state: 'visible' });
      await page.locator('app-qr-display-sheet img').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '10-qr-modal');
      await page.locator('app-qr-display-sheet ion-button:has-text("Done")').click();
      await page.locator('app-qr-display-sheet').waitFor({ state: 'hidden' });

      // 11 — lobby overflow menu
      await openHeaderMenu(page);
      await shot(page, '11-lobby-overflow');
      await closeOverlay(page);

      // 12 — round-start modal (Round 1)
      const startBtn1 = page
        .locator('app-lobby:not(.ion-page-hidden) ion-button')
        .filter({ hasText: LOBBY.startRoundBtn });
      await startBtn1.click();
      await expandRoundStartSheet(page);
      await shot(page, '12-round-start-modal');

      // 13 — estimating (after typing title + confirming)
      await page.locator(ROUND_START.titleInput).locator('input').fill(ROUND_TITLE);
      await page.locator(ROUND_START.titleInput).locator('input').blur();
      await clickRoundStartSubmit(page);
      await page.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
      await page.waitForTimeout(600);
      await shot(page, '13-estimating-1440');

      // Guard the exact race: app-avatar-vote-row is bound to
      // onlineVoterParticipants() (estimating.page.ts), the same signal
      // shouldAutoReveal reads for its denominator. Asserting 2 dots here
      // — right before the host votes — confirms the co-voter is counted,
      // rather than relying on the earlier lobby-roster wait as a proxy.
      await expect(page.locator(ESTIMATING.voteDots)).toHaveCount(2, { timeout: 15_000 });

      // 14 — estimating with card 5 selected
      await page.locator(ESTIMATING.card('5')).first().click();
      await page.locator(ESTIMATING.selectedCard).first().waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '14-estimating-card-selected');

      // Co-voter now casts a vote too, so the pre-existing auto-reveal flow
      // (2 online voters, both numeric) fires and navigates to /lobby as before.
      await castCoVote(coVoterPage, '3');
      await page.waitForURL(/\/lobby/, { timeout: 10_000 });
      await page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });
      await page.waitForTimeout(500);

      // 15 — lobby with revealed results
      await shot(page, '15-lobby-results-1440');

      // 4a — round history empty placeholder
      // Round history (app-round-history) renders only when entries exist.
      // After a single round the history list is absent (the current round shows
      // in VoteResultsComponent, not history). No empty-state element rendered.
      // This shot captures lobby pre-next-round (equivalent to 06-lobby-1440 with results).
      // Note: redundant with 15-lobby-results-1440; kept per plan §4a for completeness.
      await shot(page, '4a-lobby-no-history-yet-1440');

      // 6a — custom scale editor sheet
      // Path: App Settings → Default scale row → Edit button on a preset.
      await gotoFresh(page, '/settings');
      await page.waitForURL(/\/settings/);
      await page.locator('app-settings').waitFor({ state: 'visible' });
      await page.locator(APP_SETTINGS.defaultScaleRow).click();
      await page.locator('app-scale-picker-sheet').waitFor({ state: 'visible' });
      await page.waitForTimeout(300);
      // Click Edit on Fibonacci to open the preset card editor
      await page.locator(APP_SETTINGS_SCALE_PICKER.editBtn('Fibonacci')).click();
      await page.locator('app-scale-editor-sheet').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await shot(page, '6a-custom-scale-editor-sheet');

      // 6b — preset overrides toggle (one card toggled off)
      const toggle = page.locator(PRESET_CARD_EDITOR.cardToggle('21'));
      const toggleExists = await toggle.isVisible().catch(() => false);
      if (toggleExists) {
        await toggle.click();
        await page.waitForTimeout(300);
      } else {
        // Fall back to first available card toggle
        await page.locator(PRESET_CARD_EDITOR.cardList).locator('ion-toggle').first().click();
        await page.waitForTimeout(300);
      }
      await shot(page, '6b-preset-override-card-toggled');
      // Close editor + picker
      await page.locator(PRESET_CARD_EDITOR.doneBtn).click();
      await page.locator('app-scale-editor-sheet').waitFor({ state: 'hidden' });
      await page.locator(APP_SETTINGS_SCALE_PICKER.doneBtn).click();
      await page.locator('app-scale-picker-sheet').waitFor({ state: 'hidden' });

      // 9 — empty home (first-run, fresh context, no last-session, no onboarding done)
      // Uses a fresh browser context so localStorage is empty → onboarding shows.
      const { ctx: freshCtx, page: freshPage } = await freshContext(browser, {
        width: 1440,
        height: 900,
      });
      try {
        await freshPage.goto(`${BASE_URL}/home`);
        await freshPage.waitForURL(/\/onboarding/);
        await shot(freshPage, '09-empty-home-onboarding');
      } finally {
        await freshCtx.close();
      }

      void code;
    } finally {
      await coVoterCtx.close();
      await ctx.close();
    }
  });

  test('mobile 390 @all @layout @theming @home', async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await freshContext(browser, { width: 390, height: 844 });
    try {
      // 23 — onboarding
      await gotoFresh(page, '/home');
      await page.waitForURL(/\/onboarding/);
      await shot(page, '23-onboarding-390');

      // 17 — home
      await onboard(page);
      await shot(page, '17-home-390');

      // 18 — settings
      await gotoFresh(page, '/settings');
      await page.locator('app-settings').waitFor({ state: 'visible' });
      await shot(page, '18-settings-390');

      // 19 — join
      await gotoFresh(page, '/join');
      await page.locator(JOIN.codeInput).waitFor({ state: 'visible' });
      await shot(page, '19-join-390');

      // 20 — lobby
      await gotoFresh(page, '/home');
      await page.waitForURL(/\/home/);
      await createSession(page);
      await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });
      await shot(page, '20-lobby-390');

      // 22 — estimating
      const startBtn = page
        .locator('app-lobby:not(.ion-page-hidden) ion-button')
        .filter({ hasText: LOBBY.startRoundBtn });
      await startBtn.click();
      await expandRoundStartSheet(page);
      await page.locator(ROUND_START.titleInput).locator('input').fill(ROUND_TITLE);
      await page.locator(ROUND_START.titleInput).locator('input').blur();
      await clickRoundStartSubmit(page);
      await page.locator(ESTIMATING.cardGrid).waitFor({ state: 'visible' });
      await page.waitForTimeout(600);
      await shot(page, '22-estimating-390');

      // Cast vote → unanimous auto-reveal → /lobby results
      await page.locator(ESTIMATING.card('5')).first().click();
      await page.waitForURL(/\/lobby/, { timeout: 10_000 });
      await page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });
      await page.waitForTimeout(500);

      // 16 — lobby results mobile
      await shot(page, '16-lobby-results-390');

      // 21 — round-start modal for Round 2
      const nextBtn = page.locator('ion-button').filter({ hasText: LOBBY.nextRoundBtn });
      await nextBtn.click();
      await expandRoundStartSheet(page);
      await shot(page, '21-round-start-390');
    } finally {
      await ctx.close();
    }
  });

  /**
   * Connection chip states — offline then reconnected.
   *
   * Ordering invariant: setOffline(true) fires before screenshot; setOffline(false)
   * fires and we poll for chip disappearance before reconnected shot. The chip only
   * renders after the 5 s DISCONNECTED_WARNING_DELAY_MS debounce, so we sustain
   * offline for ≥5,500 ms. Reconnected state: chip returns to null → absent from DOM.
   *
   * TODO Phase 1 verification: confirm app-connection-chip appears in lobby header
   * and that ion-chip.connection-chip selector matches after 5.5 s offline.
   */
  test('connection chip — offline + reconnected @connection', async ({ browser }) => {
    test.setTimeout(60_000);
    const { ctx, page } = await freshContext(browser, { width: 1440, height: 900 });
    try {
      await gotoFresh(page, '/home');
      await page.waitForURL(/\/onboarding/);
      await onboard(page);
      // Create a session so we're on /lobby (connection chip lives there)
      await page.locator(HOME.createCard).click();
      await page.waitForURL(/\/lobby/);
      await page.locator(LOBBY.participantList).waitFor({ state: 'visible' });

      // 8a — connection chip offline
      // Sustain offline for 5.5 s so DISCONNECTED_WARNING_DELAY_MS debounce fires.
      await ctx.setOffline(true);
      await page.waitForTimeout(5_500);
      await shot(page, '8a-connection-chip-reconnecting');

      // 8c — connection chip reconnected
      await ctx.setOffline(false);
      // Wait for chip to disappear (status returns to 'connected' → null display)
      const chip = page.locator(CONNECTION_CHIP.chip);
      // Chip may take a moment to clear; poll up to 10 s
      await chip.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {
        // If chip stays visible, still capture the current state
      });
      await page.waitForTimeout(500);
      await shot(page, '8c-connection-chip-reconnected');
    } finally {
      await ctx.close();
    }
  });
});
