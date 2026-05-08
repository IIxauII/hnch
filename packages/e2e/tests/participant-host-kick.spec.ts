/**
 * Spec 2 — Host kick participant via swipe drawer (ADR-0036)
 *
 * Ordering invariant:
 * Host writes `leftAt` + `removedBy = hostId` to B's record.
 * ParticipantRemovalService on B's context observes the undefined→defined
 * transition, shows toast, clears cache, navigates Home. That observation
 * must happen after the host confirms the alert — the test enforces this by
 * awaiting A's alert confirm before asserting B's toast/navigation.
 *
 * Swipe: ion-item-sliding has no Playwright-native gesture API. We open the
 * sliding item programmatically via `element.open('end')` on the DOM node so
 * the drawer is guaranteed to be in the open state before tapping the option.
 * This avoids pointer-drag flakiness on headless Chromium.
 *
 * The `ion-item-option` for Remove carries
 * `aria-label="Remove {name} from session"` (lobby.page.ts line ~237).
 */

import { test, expect } from './fixtures/app.fixture';
import { LOBBY, expectToast } from './fixtures/helpers';

/** Open the swipe drawer for a participant row (end side) by participant name. */
async function openSwipeDrawer(
  page: import('@playwright/test').Page,
  participantName: string,
): Promise<void> {
  // Wait until the participant's row is in the DOM and contains the name text.
  // Uses ion-label text content rather than aria-label because Ionic web
  // components may not reflect host-element aria-label attributes reliably
  // when queried from page.evaluate before hydration settles.
  // Phase D: participant rows are in ion-list.participants-list inside hnch-participant-row.
  // Name is in span.participant-name inside ion-label; use :has(span.participant-name) for match.
  const rowLocator = page.locator(
    `ion-list.participants-list hnch-participant-row ion-item-sliding:has(span.participant-name:text-is("${participantName}"))`,
  );
  await rowLocator.waitFor({ state: 'visible', timeout: 5_000 });

  // Programmatically open the sliding drawer.
  // Note: using evaluate() because Playwright has no first-class swipe gesture API.
  // open('end') is the stable web-component API on IonItemSliding.
  await rowLocator.evaluate((el: Element) => {
    (el as unknown as { open(side: string): void }).open('end');
  });

  // Wait for the option button to become visible
  const removeOption = page.locator(
    `ion-item-option[aria-label="Remove ${participantName} from session"]`,
  );
  await removeOption.waitFor({ state: 'visible', timeout: 5_000 });
}

test.describe('Host kick participant (ADR-0036)', () => {
  test('host removes player via swipe drawer; player gets toast and lands on Home', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // Open swipe drawer for Player row
    await openSwipeDrawer(host.page, 'Player');

    // Tap "Remove Player from session" option
    const removeBtn = host.page.locator('ion-item-option[aria-label="Remove Player from session"]');
    await removeBtn.evaluate((el: HTMLElement) => el.click());

    // Confirm in alert
    const alert = host.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });
    const confirmBtn = host.page.locator('ion-alert button:has-text("Remove")');
    await confirmBtn.evaluate((el: HTMLElement) => el.click());

    // Host sees count decrement and Player gone from list
    await host.expectParticipantCount(1);
    await expect(host.page.locator(LOBBY.participantList)).not.toContainText('Player');

    // Kicked player sees "Removed by host" toast and navigates Home
    // Ordering invariant: toast must appear after host confirm (causally after leftAt write)
    await expectToast(player.page, /removed by host/i, { timeout: 8_000 });
    await player.page.waitForURL(/\/home/, { timeout: 8_000 });
  });

  test("kicked player's vote still shows by name in revealed round results on host screen", async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Run a round: player votes 8, host votes 5
    await host.startRound();
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('8');

    // Host reveals
    await host.reveal();
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // Now kick player
    await openSwipeDrawer(host.page, 'Player');
    const removeBtn = host.page.locator('ion-item-option[aria-label="Remove Player from session"]');
    await removeBtn.evaluate((el: HTMLElement) => el.click());
    const alert = host.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });
    const confirmBtn = host.page.locator('ion-alert button:has-text("Remove")');
    await confirmBtn.evaluate((el: HTMLElement) => el.click());

    // Wait for host to see the active list update
    await host.expectParticipantCount(1);

    // Results section still shows Player's vote chip by name
    const resultsSection = host.page.locator(LOBBY.resultsSection);
    await resultsSection.waitFor({ state: 'visible', timeout: 5_000 });
    const chips = host.page.locator(LOBBY.voterChips);
    const chipTexts = await chips.allTextContents();
    const hasPlayerName = chipTexts.some((t) => t.trim() === 'Player');
    expect(hasPlayerName).toBe(true);
  });

  test('after kick, no Jump-back-in banner for that room on kicked player Home', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Kick player
    await openSwipeDrawer(host.page, 'Player');
    const removeBtn = host.page.locator('ion-item-option[aria-label="Remove Player from session"]');
    await removeBtn.evaluate((el: HTMLElement) => el.click());
    const alert = host.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });
    const confirmBtn = host.page.locator('ion-alert button:has-text("Remove")');
    await confirmBtn.evaluate((el: HTMLElement) => el.click());

    await player.page.waitForURL(/\/home/, { timeout: 8_000 });
    // Give Angular time to render
    await player.page.waitForTimeout(500);

    // No banner (cache cleared per ADR-0036 §5)
    const banner = player.page.locator('app-jump-back-in-banner');
    const visible = await banner.isVisible().catch(() => false);
    expect(visible).toBe(false);

    const homeContent = await player.page.textContent('body');
    expect(homeContent).not.toContain(code);
  });

  test('kicked player can rejoin: host sees participant reappear in active roster (ADR-0036 §6)', async ({
    host,
    player,
  }) => {
    // Full ADR-0036 §6 contract: a kicked participant re-enters the room code,
    // the post-sync leftAt clear (onSynced hook in DocService.connectWithPersistence)
    // runs AFTER the relay snapshot merges so the delete op carries a higher
    // Lamport clock than the snapshot's set('leftAt', ...) and wins the LWW merge.
    // The host's active roster increments back to 2 and shows Player's name.
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    // Kick player
    await openSwipeDrawer(host.page, 'Player');
    const removeBtn = host.page.locator('ion-item-option[aria-label="Remove Player from session"]');
    await removeBtn.evaluate((el: HTMLElement) => el.click());
    const alert = host.page.locator('ion-alert');
    await alert.waitFor({ state: 'visible', timeout: 5_000 });
    const confirmBtn = host.page.locator('ion-alert button:has-text("Remove")');
    await confirmBtn.evaluate((el: HTMLElement) => el.click());

    await player.page.waitForURL(/\/home/, { timeout: 8_000 });

    // Player re-enters the room code (no relay-side ban per ADR-0036 §6).
    await player.joinSession(code);

    // Assert: player reaches lobby — relay accepted the connection.
    await expect(player.page.locator(LOBBY.lobbyReady)).toBeVisible({ timeout: 10_000 });
    expect(player.page.url()).toMatch(/\/lobby/);

    // Assert: host sees count back at 2 and Player's name in the active roster.
    // This confirms the post-sync leftAt clear resolved the LWW race.
    await host.expectParticipantCount(2);
    await expect(host.page.locator(LOBBY.participantList)).toContainText('Player');
  });
});
