import { devices } from '@playwright/test';
import { test, expect, Participant } from './fixtures/app.fixture';
import { clippedControls } from './fixtures/layout';
import { LOBBY } from './fixtures/helpers';

/**
 * No control is cut off by its container.
 *
 * A layout guard over the two screens a session is spent on, with every
 * section filled: roster with a row menu, agenda with a row menu, the newest
 * result with its copy button, history with an edit button. See
 * `fixtures/layout.ts` for what counts as clipped and why it matters.
 */

/** Host + player, two stories queued, two rounds played. Host ends in the Lobby. */
async function playTwoRounds(host: Participant, player: Participant): Promise<void> {
  const code = await host.createSession();
  await player.joinSession(code);
  await host.expectParticipantCount(2);

  await host.addAgendaItem({ title: 'Login form', ticketId: 'PROJ-101' });
  await host.addAgendaItem({ title: 'Password reset email' });

  await host.startRound();
  await player.waitForEstimating();
  await expectNothingClipped(host, 'Estimating, host');
  await expectNothingClipped(player, 'Estimating, participant');
  await host.castVote('5');
  await player.castVote('8');
  await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
  await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });

  await host.nextRound('Audit log export');
  await player.waitForEstimating();
  await host.castVote('3');
  await player.castVote('5');
  await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
  await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
  await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });
}

/** Retried, so a page still sliding in has time to settle. */
async function expectNothingClipped(who: Participant, screen: string): Promise<void> {
  await expect(async () => {
    expect(await clippedControls(who.page), screen).toEqual([]);
  }).toPass({ timeout: 5_000 });
}

test.describe('Controls are not clipped', () => {
  test('desktop: Lobby and Estimating, host and participant', async ({ host, player }) => {
    await playTwoRounds(host, player);

    await expectNothingClipped(host, 'Lobby, host');
    await expectNothingClipped(player, 'Lobby, participant');
  });

  test('opening a row menu leaves the row where it was', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    const name = host.page
      .locator(LOBBY.participantItems)
      .filter({ hasText: 'Player' })
      .locator('.participant-name');
    const before = await name.boundingBox();

    await host.openParticipantMenu('Player');
    const menu = host.page.locator('ion-popover, ion-action-sheet').first();
    await menu.waitFor({ state: 'visible' });
    expect((await name.boundingBox())?.x).toBe(before?.x);

    // A clipped button is scrolled into view by the click, which pulls the
    // row sideways — and the row stays there once the menu has closed.
    // Dismissed through the overlay: with a second browser context open, a
    // key press is not guaranteed to reach it.
    await menu.evaluate((el: HTMLElement & { dismiss?: () => Promise<boolean> }) => el.dismiss?.());
    await menu.waitFor({ state: 'hidden', timeout: 5_000 });
    expect((await name.boundingBox())?.x).toBe(before?.x);
  });
});

test.describe('Controls are not clipped on a phone', () => {
  // Strip defaultBrowserType — see lobby-host-actions-mobile.spec.ts.
  const { defaultBrowserType: _defaultBrowserType, ...IPHONE_13 } = devices['iPhone 13'];

  test('Lobby and Estimating, host and participant', async ({ browser }) => {
    const hostCtx = await browser.newContext(IPHONE_13);
    const playerCtx = await browser.newContext(IPHONE_13);
    const host = new Participant(hostCtx, await hostCtx.newPage(), 'Host');
    const player = new Participant(playerCtx, await playerCtx.newPage(), 'Player');

    try {
      await playTwoRounds(host, player);

      await expectNothingClipped(host, 'Lobby, host');
      await expectNothingClipped(player, 'Lobby, participant');
    } finally {
      await hostCtx.close();
      await playerCtx.close();
    }
  });
});
