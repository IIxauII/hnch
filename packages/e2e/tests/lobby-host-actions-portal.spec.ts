/**
 * Spec — Desktop host-actions popover (ellipsis overflow button on participant row)
 *
 * Surface condition: the overflow button renders on every surface; with
 * `surface.mode() === 'desktop'`, which SurfaceService resolves to
 * `(min-width: 768px) and (pointer: fine)`, it opens a popover. Desktop
 * Chrome (the default chromium project) satisfies both. The action-sheet
 * side is covered in lobby-host-actions-mobile.spec.ts.
 *
 * Ordering invariant (popover→alert race, plan C7):
 * openSheetOrPopover() resolves before the popover dismisses. The handler
 * inside the popover item calls onHandoffTap / onRemoveTap synchronously,
 * which creates and presents the ion-alert. The test waits for the alert to
 * be visible BEFORE any further action, ensuring the popover→alert hand-off
 * is complete. Clicking the confirm button then happens causally after the
 * alert is fully present — this serialisation is the ordering invariant.
 *
 * Sanity assertions (self-row / non-host rows):
 * - Host's own row has NO overflow button (aria-label "Host actions for Host" absent).
 * - On a non-host participant's own view, the overflow button is absent
 *   (rows get one only for the host, and never the host's own row).
 */

import { test, expect } from './fixtures/app.fixture';
import { KICK_AFFORDANCE, LOBBY, watchForToast } from './fixtures/helpers';

// Helper: click the overflow button for a named participant (desktop)

async function clickOverflow(
  page: import('@playwright/test').Page,
  participantName: string,
): Promise<void> {
  const btn = page.getByRole('button', { name: `Host actions for ${participantName}` });
  await btn.waitFor({ state: 'visible', timeout: 5_000 });
  await btn.click();
}

// Helper: click a named item inside the MenuPopover

async function clickPopoverItem(
  page: import('@playwright/test').Page,
  itemText: string,
): Promise<void> {
  const popover = page.locator('ion-popover');
  await popover.waitFor({ state: 'visible', timeout: 5_000 });
  const item = popover.getByRole('button', { name: itemText });
  await item.waitFor({ state: 'visible', timeout: 5_000 });
  await item.click();
}

test.describe('Desktop host-actions popover', () => {
  test('Remove via overflow: row disappears after confirm', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // The overflow button's aria-label must match "Host actions for Player"
    const overflowBtn = host.page.getByRole('button', { name: 'Host actions for Player' });
    await expect(overflowBtn).toBeVisible();
    await expect(overflowBtn).toHaveAttribute('aria-label', 'Host actions for Player');

    // Open popover
    await overflowBtn.click();

    // Click Remove
    await clickPopoverItem(host.page, 'Remove');

    // Ordering invariant: wait for alert BEFORE confirm (C7 guard)
    const alert = host.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });
    const confirmBtn = host.page.locator('ion-alert button:has-text("Remove")');
    await confirmBtn.click();

    // Player row gone
    await host.expectParticipantCount(1);
    await expect(host.page.locator(LOBBY.participantList)).not.toContainText('Player');
  });

  test('Make host via overflow: host badge transfers to other participant', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // Initial state: the badge is on Host's row, the overflow button on Player's
    const hostParticipantList = host.page.locator(LOBBY.participantList);
    await expect(hostParticipantList.locator(LOBBY.hostIcon)).toHaveCount(1);
    await expect(
      host.page.locator(KICK_AFFORDANCE.row('You (Host)')).locator(LOBBY.hostIcon),
    ).toBeVisible();
    await expect(host.page.getByRole('button', { name: 'Host actions for Player' })).toBeVisible();

    // Open popover, click Make host
    await clickOverflow(host.page, 'Player');
    await clickPopoverItem(host.page, 'Make host');

    // Ordering invariant (C7): alert must appear before confirm click
    const alert = host.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });

    // The alert says what is about to happen, and its button says it again
    await expect(alert).toContainText('Make Player the host?');

    // What everyone is told about it — and what nobody is: the host that
    // was is still here, so nobody has disconnected.
    const toldPlayer = await watchForToast(player.page, 'You are now the host');
    const toldHost = await watchForToast(host.page, 'Player is now the host');
    const alarms = [
      await watchForToast(player.page, 'disconnected'),
      await watchForToast(host.page, 'disconnected'),
    ];

    // Confirm exactly once (guard against double-fire from popover→alert race)
    const confirmBtn = host.page.locator('ion-alert button:has-text("Make host")');
    await expect(confirmBtn).toHaveCount(1);
    await confirmBtn.click();

    // The host badge should now be on Player's row in host's view, and only there.
    // The former host (Host) is still present, no longer host.
    // Wait for Yjs sync: hostId field propagates; the badge moves to Player's row.
    await expect(
      host.page.locator(KICK_AFFORDANCE.row('Player')).locator(LOBBY.hostIcon),
    ).toBeVisible({ timeout: 8_000 });
    await expect(hostParticipantList.locator(LOBBY.hostIcon)).toHaveCount(1);

    // Host controls (Start Round) should now be gone for the former host
    // because they are no longer the host — verify via player's page instead:
    // Player now sees host controls
    await expect(
      player.page.locator('app-lobby:not(.ion-page-hidden) ion-button').filter({
        hasText: LOBBY.startRoundBtn,
      }),
    ).toBeVisible({ timeout: 8_000 });

    await expect.poll(() => toldPlayer.seen()).toBe(true);
    await expect.poll(() => toldHost.seen()).toBe(true);
    for (const alarm of alarms) expect(await alarm.seen()).toBe(false);
  });

  test('Popover dismisses on backdrop tap', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    await clickOverflow(host.page, 'Player');
    const popover = host.page.locator('ion-popover');
    await popover.waitFor({ state: 'visible', timeout: 5_000 });

    // Tap the backdrop scoped to the active popover overlay.
    // Multiple ion-backdrop elements exist in the DOM (Ionic keeps old overlay
    // shadow roots). Scope to the specific popover overlay to get exactly one.
    const backdrop = popover.locator('ion-backdrop');
    await backdrop.waitFor({ state: 'visible', timeout: 3_000 });
    await backdrop.click();

    await popover.waitFor({ state: 'hidden', timeout: 5_000 });
  });

  test('Popover dismisses on Escape key', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    await clickOverflow(host.page, 'Player');
    const popover = host.page.locator('ion-popover');
    await popover.waitFor({ state: 'visible', timeout: 5_000 });

    await host.page.keyboard.press('Escape');

    await popover.waitFor({ state: 'hidden', timeout: 5_000 });
  });

  test('Sanity: self-row has no overflow button; non-host sees no overflow button', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // Host's own row (self) has no overflow button
    await expect(
      host.page.getByRole('button', { name: 'Host actions for Host' }),
    ).not.toBeVisible();

    // Exactly one overflow button: Player's
    await expect(host.page.locator(LOBBY.participantMenuBtn)).toHaveCount(1);

    // Non-host participant (Player's context) sees no overflow button on any row
    await player.expectParticipantCount(2);
    await expect(
      player.page.getByRole('button', { name: /^Host actions for /u }),
    ).not.toBeVisible();
    await expect(player.page.locator(LOBBY.participantMenuBtn)).toHaveCount(0);
  });
});
