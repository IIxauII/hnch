/**
 * Spec — Host actions on a phone (iPhone 13 viewport)
 *
 * The ⋯ button on a participant's row is the one way to the host actions on
 * every surface. What changes with the surface is how the menu is presented:
 * `SurfaceService` resolves `(min-width: 768px) and (pointer: fine)` to
 * desktop and gives a popover; iPhone 13 is 390 px wide with
 * `pointer: coarse`, so the same button opens an action sheet.
 *
 * It used to be a swipe on the row, with a line of text under the list
 * saying so. A button needs no explaining.
 *
 * Ordering invariant (menu → alert):
 * The menu item's handler creates and presents the ion-alert. The test awaits
 * alert visibility before confirm — same C7 serialisation as the desktop spec.
 */

import { test, expect, devices } from '@playwright/test';
import { Participant, clickMenuOption } from './fixtures/app.fixture';
import { KICK_AFFORDANCE, LOBBY } from './fixtures/helpers';

// Strip defaultBrowserType — Playwright otherwise tries to launch webkit even
// when the project is chromium, breaking CI runners that only install one browser.
const { defaultBrowserType: _iphoneDefaultBrowserType, ...IPHONE_13 } = devices['iPhone 13'];
test.use(IPHONE_13);

// ---------------------------------------------------------------------------
// Minimal two-context fixture (mirrors app.fixture.ts host+player pattern)
// ---------------------------------------------------------------------------

async function clearStorage(context: import('@playwright/test').BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      void localStorage.length;
    } catch {
      return;
    }
    const KEEP = new Set([
      'CapacitorStorage.hnch.displayName',
      'CapacitorStorage.hnch.participantId',
      '_capuid',
    ]);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && !KEEP.has(key)) localStorage.removeItem(key);
    }
  });
}

async function openPhone(
  browser: import('@playwright/test').Browser,
  name: string,
): Promise<{ context: import('@playwright/test').BrowserContext; participant: Participant }> {
  const context = await browser.newContext(IPHONE_13);
  await clearStorage(context);
  const page = await context.newPage();
  return { context, participant: new Participant(context, page, name) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Host actions on a phone (iPhone 13)', () => {
  test('the row menu is an action sheet, titled with the name; Remove works', async ({
    browser,
  }) => {
    const h = await openPhone(browser, 'Host');
    const p = await openPhone(browser, 'Player');
    const host = h.participant;

    try {
      const code = await host.createSession();
      await p.participant.joinSession(code);
      await host.expectParticipantCount(2);

      // The button is there without a swipe, and big enough to hit.
      const menuBtn = host.page.locator(KICK_AFFORDANCE.menuBtn('Player'));
      await expect(menuBtn).toBeVisible();
      const box = await menuBtn.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);

      await menuBtn.click();

      // A sheet, not a popover.
      const sheet = host.page.locator('ion-action-sheet');
      await sheet.waitFor({ state: 'visible', timeout: 5_000 });
      await expect(host.page.locator('ion-popover')).toHaveCount(0);
      await expect(sheet.locator('.action-sheet-title')).toContainText('Player');
      await expect(sheet.locator('button.action-sheet-button')).toHaveText([
        /Make host/,
        /Remove/,
        /Cancel/,
      ]);

      await clickMenuOption(host.page, 'Remove');
      await host.confirmAlert('Remove');

      await host.expectParticipantCount(1);
      await expect(host.page.locator(LOBBY.participantList)).not.toContainText('Player');
    } finally {
      await h.context.close();
      await p.context.close();
    }
  });

  test('Make host: host badge transfers to the other participant', async ({ browser }) => {
    const h = await openPhone(browser, 'Host');
    const p = await openPhone(browser, 'Player');
    const host = h.participant;

    try {
      const code = await host.createSession();
      await p.participant.joinSession(code);
      await host.expectParticipantCount(2);

      await host.makeHost('Player');

      // Player now carries the host badge in the former host's roster
      await expect(
        host.page.locator(KICK_AFFORDANCE.row('Player')).locator(LOBBY.hostIcon),
      ).toBeVisible({ timeout: 8_000 });

      // ...and the former host is a participant like any other: no round
      // button, no row menus, and a line saying who they are waiting for.
      await expect(host.page.locator(LOBBY.participantMenuBtn)).toHaveCount(0);
      await expect(host.page.locator(LOBBY.waitingNote)).toContainText('Player');
    } finally {
      await h.context.close();
      await p.context.close();
    }
  });

  test('Cancel closes the sheet and changes nothing', async ({ browser }) => {
    const h = await openPhone(browser, 'Host');
    const p = await openPhone(browser, 'Player');
    const host = h.participant;

    try {
      const code = await host.createSession();
      await p.participant.joinSession(code);
      await host.expectParticipantCount(2);

      await host.openParticipantMenu('Player');
      const sheet = host.page.locator('ion-action-sheet');
      await sheet.waitFor({ state: 'visible', timeout: 5_000 });
      await clickMenuOption(host.page, 'Cancel');
      await sheet.waitFor({ state: 'hidden', timeout: 5_000 });

      await expect(host.page.locator('ion-alert')).toHaveCount(0);
      await host.expectParticipantCount(2);
    } finally {
      await h.context.close();
      await p.context.close();
    }
  });

  test('a participant who is not the host has no row menus', async ({ browser }) => {
    const h = await openPhone(browser, 'Host');
    const p = await openPhone(browser, 'Player');

    try {
      const code = await h.participant.createSession();
      await p.participant.joinSession(code);
      await p.participant.expectParticipantCount(2);

      await expect(p.participant.page.locator(LOBBY.participantMenuBtn)).toHaveCount(0);
    } finally {
      await h.context.close();
      await p.context.close();
    }
  });
});
