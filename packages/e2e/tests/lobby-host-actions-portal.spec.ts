/**
 * Spec — Desktop host-actions popover (ellipsis overflow button on participant row)
 *
 * Surface condition: the overflow button renders only when
 * `surface.mode() === 'desktop'`, which SurfaceService resolves to
 * `(min-width: 768px) and (pointer: fine)`. Desktop Chrome (the default
 * chromium project) satisfies both.
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
 *   (the `@if (isHost() && p.id !== myId())` guard in lobby.page.ts).
 */

import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

// ---------------------------------------------------------------------------
// Helper: open the accordion so participant rows are accessible
// ---------------------------------------------------------------------------

async function ensureAccordionOpen(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const group = document.querySelector('ion-accordion-group') as
      | (HTMLElement & { value?: string | null })
      | null;
    if (group) group.value = 'open';
  });
}

// ---------------------------------------------------------------------------
// Helper: click the overflow button for a named participant (desktop)
// ---------------------------------------------------------------------------

async function clickOverflow(
  page: import('@playwright/test').Page,
  participantName: string,
): Promise<void> {
  await ensureAccordionOpen(page);
  const btn = page.getByRole('button', { name: `Host actions for ${participantName}` });
  await btn.waitFor({ state: 'visible', timeout: 5_000 });
  await btn.evaluate((el: HTMLElement) => el.click());
}

// ---------------------------------------------------------------------------
// Helper: click a named item inside the MenuPopover
// ---------------------------------------------------------------------------

async function clickPopoverItem(
  page: import('@playwright/test').Page,
  itemText: string,
): Promise<void> {
  const popover = page.locator('ion-popover');
  await popover.waitFor({ state: 'visible', timeout: 5_000 });
  const item = popover.getByRole('button', { name: itemText });
  await item.waitFor({ state: 'visible', timeout: 5_000 });
  await item.evaluate((el: HTMLElement) => el.click());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Desktop host-actions popover', () => {
  test('Remove via overflow: row disappears after confirm', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // The overflow button's aria-label must match "Host actions for Player"
    await ensureAccordionOpen(host.page);
    const overflowBtn = host.page.getByRole('button', { name: 'Host actions for Player' });
    await expect(overflowBtn).toBeVisible();
    await expect(overflowBtn).toHaveAttribute('aria-label', 'Host actions for Player');

    // Open popover
    await overflowBtn.evaluate((el: HTMLElement) => el.click());

    // Click Remove
    await clickPopoverItem(host.page, 'Remove');

    // Ordering invariant: wait for alert BEFORE confirm (C7 guard)
    const alert = host.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });
    const confirmBtn = host.page.locator('ion-alert button:has-text("Remove")');
    await confirmBtn.evaluate((el: HTMLElement) => el.click());

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

    // Verify host icon is on Host, not on Player (initial state)
    await ensureAccordionOpen(host.page);
    const hostParticipantList = host.page.locator(LOBBY.participantList);
    // Host's row is the non-sliding item (self); Player's row has the overflow btn
    await expect(host.page.getByRole('button', { name: 'Host actions for Player' })).toBeVisible();

    // Open popover, click Make host
    await clickOverflow(host.page, 'Player');
    await clickPopoverItem(host.page, 'Make host');

    // Ordering invariant (C7): alert must appear before confirm click
    const alert = host.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });

    // Confirm exactly once (guard against double-fire from popover→alert race)
    const confirmBtn = host.page.locator('ion-alert button:has-text("Confirm")');
    await expect(confirmBtn).toHaveCount(1);
    await confirmBtn.evaluate((el: HTMLElement) => el.click());

    // Host badge (star icon) should now appear on Player's row in host's view.
    // The former host (Host) is still present, no longer host.
    // Wait for Yjs sync: hostId field propagates; host-icon appears on Player's row.
    await expect(
      hostParticipantList.locator('ion-label').filter({ hasText: 'Player' }).locator('.host-icon'),
    ).toBeVisible({ timeout: 8_000 });

    // Host controls (Start Round) should now be gone for the former host
    // because they are no longer the host — verify via player's page instead:
    // Player now sees host controls
    await expect(
      player.page.locator('app-lobby:not(.ion-page-hidden) ion-button').filter({
        hasText: LOBBY.startRoundBtn,
      }),
    ).toBeVisible({ timeout: 8_000 });
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
    await backdrop.evaluate((el: HTMLElement) => el.click());

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

    await ensureAccordionOpen(host.page);

    // Host's own row (self) has no overflow button
    await expect(
      host.page.getByRole('button', { name: 'Host actions for Host' }),
    ).not.toBeVisible();

    // Swipe-hint paragraph is NOT visible on desktop (mobile-only guard in template)
    const swipeHint = host.page.locator('p.swipe-hint');
    await expect(swipeHint).not.toBeVisible();

    // Non-host participant (Player's context) sees no overflow button on any row
    await ensureAccordionOpen(player.page);
    await expect(
      player.page.getByRole('button', { name: /^Host actions for /u }),
    ).not.toBeVisible();
  });
});
