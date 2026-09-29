import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, JOIN, LOBBY } from './fixtures/helpers';

test.describe('Deep-link join with pw=1 hint', () => {
  test('pw=1 shows password field before resolve fetch completes', async ({ host, player }) => {
    const code = await host.createSession();

    // Host sets a password
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('hunter2');
    await patchDone;
    await host.closeSettings();

    // Intercept the resolve fetch so it never completes — lets us assert
    // the password field is visible purely from the pw=1 hint, not from a
    // resolve round-trip.
    // Ordering invariant: route is registered before navigation; the
    // password input must be visible without any resolve response arriving.
    await player.page.route('**/rooms/**', (route) => route.abort());

    await player.page.goto(`${BASE_URL}/join?code=${code}&pw=1`);
    await player.page.waitForURL(/\/(join|onboarding)/);
    if (player.page.url().includes('/onboarding')) {
      const nameInput = player.page.locator('ion-input[autocapitalize="words"]').locator('input');
      await nameInput.fill('Player');
      await player.page.locator('ion-button:has-text("Continue")').click();
      await player.page.waitForURL(/\/join/);
    }

    // Critical AC: field must appear within 500 ms — synchronously from
    // the pw=1 hint, not after any network response.
    const passwordInput = player.page.locator(JOIN.passwordInput);
    await expect(passwordInput).toBeVisible({ timeout: 500 });
  });

  test('no pw param delays password field until resolve response', async ({ host, player }) => {
    const code = await host.createSession();

    // Host sets a password
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword('hunter2');
    await patchDone;
    await host.closeSettings();

    // Hold the resolve fetch until we have asserted the field is absent.
    // Ordering invariant: route registered before navigation; field must be
    // invisible while the resolve is pending (no pw=1 hint in the URL).
    let unblockResolve!: () => void;
    const resolveBlocked = new Promise<void>((resolve) => {
      unblockResolve = resolve;
    });
    await player.page.route('**/rooms/**', async (route) => {
      await resolveBlocked;
      await route.continue();
    });

    await player.page.goto(`${BASE_URL}/join?code=${code}`);
    await player.page.waitForURL(/\/(join|onboarding)/);
    if (player.page.url().includes('/onboarding')) {
      const nameInput = player.page.locator('ion-input[autocapitalize="words"]').locator('input');
      await nameInput.fill('Player');
      await player.page.locator('ion-button:has-text("Continue")').click();
      await player.page.waitForURL(/\/join/);
    }

    // While resolve is held, field must not be visible (no pw hint).
    const passwordInput = player.page.locator(JOIN.passwordInput);
    await expect(passwordInput).not.toBeVisible({ timeout: 500 });

    // Unblock resolve — relay returns accessMode=password → field appears.
    unblockResolve();
    await expect(passwordInput).toBeVisible({ timeout: 8_000 });

    // Fill password and join.
    await passwordInput.locator('input').fill('hunter2');
    await player.page.locator(JOIN.joinBtn).click();
    await player.page.locator(LOBBY.roomCode).waitFor({ state: 'visible', timeout: 10_000 });

    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);
  });

  test('stale pw=1 on open room shows field then clears it and joins without password', async ({
    host,
    player,
  }) => {
    // Open room — no password set.
    const code = await host.createSession();

    // Hold resolve so we can assert the stale hint shows the field before
    // the open-room branch fires its needsPassword.set(false) reset.
    // Ordering invariant: field visible (from hint) while resolve pending;
    // field gone after resolve returns open; lobby reached without password.
    let unblockResolve!: () => void;
    const resolveBlocked = new Promise<void>((resolve) => {
      unblockResolve = resolve;
    });
    await player.page.route('**/rooms/**', async (route) => {
      await resolveBlocked;
      await route.continue();
    });

    await player.page.goto(`${BASE_URL}/join?code=${code}&pw=1`);
    await player.page.waitForURL(/\/(join|onboarding)/);
    if (player.page.url().includes('/onboarding')) {
      const nameInput = player.page.locator('ion-input[autocapitalize="words"]').locator('input');
      await nameInput.fill('Player');
      await player.page.locator('ion-button:has-text("Continue")').click();
      // After onboarding the guard resumes the pending join URL (/join?code=…&pw=1).
      // Auto-submit fires once the page activates — wait for join or lobby.
      await player.page.waitForURL(/\/(join|lobby)/);
    }

    // Field visible from hint while resolve is still held.
    const passwordInput = player.page.locator(JOIN.passwordInput);
    await expect(passwordInput).toBeVisible({ timeout: 500 });

    // Unblock resolve — open-room branch fires needsPassword.set(false).
    unblockResolve();

    // Field disappears; join proceeds without password — lobby is success signal.
    await expect(passwordInput).not.toBeVisible({ timeout: 8_000 });
    await player.page.locator(LOBBY.roomCode).waitFor({ state: 'visible', timeout: 10_000 });

    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);
  });
});
