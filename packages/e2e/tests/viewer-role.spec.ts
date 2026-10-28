import { test, expect } from './fixtures/app.fixture';
import { ESTIMATING, KICK_AFFORDANCE, LOBBY } from './fixtures/helpers';

test.describe('Viewer role', () => {
  test('can toggle between voter and observer roles', async ({ player }) => {
    await player.createSession();

    // Start round
    await player.startRound();

    // Initially should show "Voter"
    await expect(
      player.page.locator(ESTIMATING.roleChip).filter({ hasText: 'Voter' }).first(),
    ).toBeVisible();

    // Toggle to observer
    await player.toggleRole();
    await expect(
      player.page.locator(ESTIMATING.roleChip).filter({ hasText: 'Observer' }).first(),
    ).toBeVisible();

    // Toggle back to voter
    await player.toggleRole();
    await expect(
      player.page.locator(ESTIMATING.roleChip).filter({ hasText: 'Voter' }).first(),
    ).toBeVisible();
  });

  test('observer excluded from vote denominator: count shows voters only', async ({
    host,
    player,
    createParticipant,
  }) => {
    const observer = await createParticipant('Observer');

    const code = await host.createSession();
    await player.joinSession(code);
    await observer.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();
    await observer.waitForEstimating();

    // Observer toggles to viewer role — excluded from denominator
    await observer.toggleRole();
    await expect(
      observer.page.locator(ESTIMATING.roleChip).filter({ hasText: 'Observer' }).first(),
    ).toBeVisible();

    // Player votes — host has not, so auto-reveal won't fire (2 online voters)
    await player.castVote('5');

    // Count should show "1 of 2 voted" — observer not in denominator
    await expect(host.page.locator(ESTIMATING.voteCount).first()).toContainText('1 of 2');
    await expect(player.page.locator(ESTIMATING.voteCount).first()).toContainText('1 of 2');
    await expect(observer.page.locator(ESTIMATING.voteCount).first()).toContainText('1 of 2');
  });

  test('observer excluded from auto-reveal: auto-reveals when only voter (host) votes', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    // Start round — both land on /estimating
    await host.startRound();
    await player.waitForEstimating();

    // Player toggles to observer role — now excluded from the voter count
    await player.toggleRole();
    await expect(
      player.page.locator(ESTIMATING.roleChip).filter({ hasText: 'Observer' }).first(),
    ).toBeVisible();

    // Host votes — host is now the ONLY online voter.
    // Auto-reveal should fire immediately (all online voters have voted).
    await host.castVote('5');

    // Both navigate to /lobby without any manual Reveal tap
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // Only host's vote appears — observer's non-vote is not in results
    await host.expectRevealedVotes(['5']);
    await player.expectRevealedVotes(['5']);

    // ...and is not held against them: nobody was waiting for an observer's
    // vote, so they are not listed under "Didn't vote" (ADR-0041 §3).
    await expect(host.page.locator(LOBBY.didntVoteGroup)).toHaveCount(0);
    await expect(player.page.locator(LOBBY.didntVoteGroup)).toHaveCount(0);

    // The roster says who is observing
    await expect(host.page.locator(`${KICK_AFFORDANCE.row('Player')} ion-note`)).toHaveText(
      'Observer',
    );
  });

  test('the role can be switched from the lobby as well', async ({ host, player }) => {
    const code = await host.createSession();
    await player.joinSession(code);
    await host.expectParticipantCount(2);

    const toggle = player.page.locator(
      'app-lobby:not(.ion-page-hidden) app-role-toggle ion-button',
    );
    await expect(toggle).toHaveText(/Voter/);
    await toggle.click();
    await expect(toggle).toHaveText(/Observer/);
    await expect(host.page.locator(`${KICK_AFFORDANCE.row('Player')} ion-note`)).toHaveText(
      'Observer',
    );

    // It carries into the round
    await host.startRound();
    await player.waitForEstimating();
    await expect(
      player.page.locator(ESTIMATING.roleChip).filter({ hasText: 'Observer' }).first(),
    ).toBeVisible();
    await expect(player.page.locator(ESTIMATING.cardGrid)).toHaveCount(0);
    await expect(host.page.locator(ESTIMATING.voteCount)).toContainText('0 of 1');
  });
});
