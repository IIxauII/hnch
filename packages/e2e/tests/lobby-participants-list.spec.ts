import { test, expect } from './fixtures/app.fixture';
import { LOBBY } from './fixtures/helpers';

// ---------------------------------------------------------------------------
// Selectors specific to the flat participants list (Phase D, no accordion)
// ---------------------------------------------------------------------------
const PARTICIPANTS = {
  // Scoped to active lobby page to avoid matching hidden pages in the DOM stack
  list: 'app-lobby:not(.ion-page-hidden) ion-list.participants-list',
  rows: 'app-lobby:not(.ion-page-hidden) hnch-participant-row',
  footerSummary: 'app-lobby:not(.ion-page-hidden) .participants-footer',
  hostBadge: '.host-badge',
  // Role chip lives on the current user's own row only (canEditRole = isMe)
  roleChip: 'hnch-participant-row ion-chip.role-chip',
} as const;

test.describe('Lobby participants list (flat, Phase D)', () => {
  test('list renders flat rows — no accordion collapse', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Both participants visible immediately — flat list, never collapsed
    await host.expectParticipantCount(2);
    const firstRow = host.page.locator(PARTICIPANTS.rows).first();
    await expect(firstRow).toBeVisible();

    const secondRow = host.page.locator(PARTICIPANTS.rows).nth(1);
    await expect(secondRow).toBeVisible();
  });

  test('host badge shown on host row', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // At least one row has a host badge (the host's own row)
    await expect(host.page.locator(PARTICIPANTS.hostBadge).first()).toBeVisible();
  });

  test('footer summary shows N online', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Footer contains participant count text (e.g. "2 online")
    const footer = host.page.locator(PARTICIPANTS.footerSummary);
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('online');
  });

  test('own row shows role chip; toggling chip switches between Voter and Observing', async ({
    host,
    player,
  }) => {
    // Only the host's own row gets canEditRole=true (isMe binding)
    const code = await host.createSession();
    await player.joinSession(code);

    // Host sees role chip on their own row — initially "Voter"
    const roleChip = host.page.locator(PARTICIPANTS.roleChip);
    await expect(roleChip).toBeVisible();
    await expect(roleChip).toContainText('Voter');

    // Tap chip → switches to observer / "Observing"
    await roleChip.evaluate((el: HTMLElement) => el.click());
    await expect(roleChip).toContainText('Observing', { timeout: 3_000 });

    // Tap again → back to voter
    await roleChip.evaluate((el: HTMLElement) => el.click());
    await expect(roleChip).toContainText('Voter', { timeout: 3_000 });
  });

  test('post-reveal: rows still visible (no accordion collapse)', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('5');

    // Auto-reveal on unanimous (ADR-0018)
    await host.page.waitForURL(/\/lobby/u, { timeout: 10_000 });
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' });

    // Phase D: flat list — rows remain visible after reveal (no accordion behavior)
    const firstRow = host.page.locator(PARTICIPANTS.rows).first();
    await expect(firstRow).toBeVisible();

    // Results section also visible (both coexist in the flat layout)
    await expect(host.page.locator(LOBBY.resultsSection)).toBeVisible();
  });
});
