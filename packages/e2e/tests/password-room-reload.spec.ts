import { test, expect } from './fixtures/app.fixture';
import { JOIN, LOBBY } from './fixtures/helpers';

/**
 * Password-protected room reload
 *
 * Invariant: reloading `/lobby/:code` for a password-protected room must NOT
 * reconnect directly (cache stores no credentials, ADR-0022 §3). The
 * sessionResumeGuard's `password-required` branch must fire and redirect to
 * `/join?code=<CODE>`. The Join page auto-fills the code and shows the
 * password field. Submitting the correct password lands back in `/lobby/:code`.
 *
 * Ordering: create → set password (await relay PATCH) → confirm in lobby →
 * reload → assert redirect to /join?code=... → enter password → assert lobby.
 * The relay PATCH await ensures the access-mode change is committed before the
 * reload triggers the guard.
 */
test.describe('Password-room reload', () => {
  test('reload on /lobby/:code for password room redirects to /join?code=CODE with password field', async ({
    host,
  }) => {
    const code = await host.createSession();
    await host.page.waitForURL(/\/lobby\//);

    const lobbyUrl = host.page.url();
    expect(lobbyUrl).toMatch(/\/lobby\/[A-Z0-9]+/i);

    // Set a password — await relay PATCH so access-mode is committed
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.changeAccess('Password', 'secret99');
    await patchDone;
    await host.closeSettings();

    // Still on lobby (confirming state before reload)
    await host.page.waitForURL(/\/lobby\//);

    // Reload — guard detects password-required → redirects to /join?code=CODE
    await host.page.reload();

    // Guard redirect: should land on /join with the code in the query string
    await host.page.waitForURL(/\/join/, { timeout: 15_000 });
    const joinUrl = host.page.url();
    expect(joinUrl).toContain(`code=${code}`);

    // The join page auto-submits phase 1 when ?code= is in the URL and the user has
    // a display name (shouldAutoSubmitDeepLink). For a password room, phase 1 resolves
    // the room, sets needsPassword=true, and surfaces the password field automatically —
    // no manual Join click needed.
    const pwInput = host.page.locator(JOIN.passwordInput).locator('input');
    await pwInput.waitFor({ state: 'visible', timeout: 10_000 });

    // Enter the correct password
    await pwInput.fill('secret99');

    // Submit — evaluate to bypass Ionic pointer-event interception
    await host.page.locator(JOIN.joinBtn).click();
    await host.page.waitForURL(/\/lobby\//, { timeout: 15_000 });

    // Lands on the same lobby
    expect(host.page.url()).toBe(lobbyUrl);

    // Room code visible and host controls present
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible();
  });
});
