import { test, expect } from './fixtures/app.fixture';
import { JOIN, LOBBY } from './fixtures/helpers';

/**
 * Password-protected room reload
 *
 * A device keeps the password hash of a session it got into (ADR-0044), so a
 * reload of `/lobby/:code` reconnects without asking again. That holds for the
 * host who set the password as much as for a joiner who typed it: the host
 * used to be asked for the password they had just chosen.
 *
 * A device that does not hold the hash — it never had it, or the entry was
 * written before the session was locked — is sent through the
 * sessionResumeGuard's `password-required` branch to `/join?code=<CODE>`. The
 * Join page fills in the code and shows the password field; the right
 * password lands back in `/lobby/:code`.
 *
 * Ordering: create → set password (await relay PATCH) → confirm in lobby →
 * reload. The relay PATCH await ensures the access-mode change is committed
 * before the reload triggers the guard.
 */
test.describe('Password-room reload', () => {
  async function createLockedSession(
    host: import('./fixtures/app.fixture').Participant,
    password: string,
  ): Promise<{ code: string; lobbyUrl: string }> {
    const code = await host.createSession();
    await host.page.waitForURL(/\/lobby\//);

    const lobbyUrl = host.page.url();
    expect(lobbyUrl).toMatch(/\/lobby\/[A-Z0-9]+/i);

    // Set a password — await relay PATCH so access-mode is committed
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    );
    await host.openSettings();
    await host.setPassword(password);
    await patchDone;
    await host.closeSettings();

    // Still on lobby (confirming state before reload)
    await host.page.waitForURL(/\/lobby\//);
    await expect(host.page.locator(LOBBY.subtitle)).toContainText('Password protected');
    return { code, lobbyUrl };
  }

  test('the host who set the password reloads straight back into the lobby', async ({ host }) => {
    const { lobbyUrl } = await createLockedSession(host, 'secret99');

    await host.page.reload();

    // No detour through /join: the hash this device holds gets it back in.
    await host.page.locator(LOBBY.roomCode).waitFor({ state: 'visible', timeout: 15_000 });
    expect(host.page.url()).toBe(lobbyUrl);
    await expect(host.page.locator(JOIN.passwordInput)).toHaveCount(0);

    // Still the host, and the session still reads as locked.
    await host.expectIsHost();
    await expect(host.page.locator(LOBBY.subtitle)).toContainText('Password protected');
  });

  test('a device without the password is sent to /join?code=CODE with the password field', async ({
    host,
  }) => {
    const { code, lobbyUrl } = await createLockedSession(host, 'secret99');

    // Forget the hash, keep the entry — what a device holds when the session
    // was locked after it last got in.
    await host.page.evaluate(() => {
      const key = 'CapacitorStorage.hnch.lastSession';
      const raw = localStorage.getItem(key);
      if (raw === null) throw new Error('no cached session to edit');
      const cache = JSON.parse(raw) as { entries: Record<string, { passwordHash?: string }> };
      for (const entry of Object.values(cache.entries)) delete entry.passwordHash;
      localStorage.setItem(key, JSON.stringify(cache));
    });

    // Reload — guard detects password-required → redirects to /join?code=CODE
    await host.page.reload();

    // Guard redirect: should land on /join with the code in the query string
    await host.page.waitForURL(/\/join/, { timeout: 15_000 });
    const joinUrl = host.page.url();
    expect(joinUrl).toContain(`code=${code}`);

    // The join page auto-submits the resolve step when ?code= is in the URL and the user
    // has a display name (shouldAutoSubmitDeepLink). For a password room, that step resolves
    // the room, sets needsPassword=true, and surfaces the password field automatically —
    // no manual Join click needed.
    const pwInput = host.page.locator(JOIN.passwordInput).locator('input');
    await pwInput.waitFor({ state: 'visible', timeout: 10_000 });

    // Enter the correct password
    await pwInput.fill('secret99');

    await host.page.locator(JOIN.joinBtn).click();
    await host.page.waitForURL(/\/lobby\//, { timeout: 15_000 });

    // Lands on the same lobby
    expect(host.page.url()).toBe(lobbyUrl);

    // Room code visible and host controls present
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible();
  });
});
