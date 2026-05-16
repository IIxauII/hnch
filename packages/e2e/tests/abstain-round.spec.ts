/**
 * Per-round abstain — e2e coverage (ADR-0041, plan: docs/plans/abstain-per-round.md, #120).
 * Phase 4 of 4.
 *
 * Four cases:
 *  1. Abstain + numeric vote → auto-reveal fires (denominator reduced by abstainer).
 *  2. Three clients: abstain + one numeric + one non-voter → auto-reveal blocked until
 *     third client votes.
 *  3. Cross-client: Abstained group visible on player's page after host abstains (Yjs sync).
 *  4. Abstain → toggle abstain off (click button again) → tap card → casts numeric; auto-reveal fires.
 *
 * NOTE on expectRevealedVotes: the existing fixture helper reads
 * `.group:not(.didnt-vote)`, which also matches `.group.abstained` because
 * `.abstained` doesn't carry `.didnt-vote`. Cases that have abstainers therefore
 * assert numeric votes directly rather than via expectRevealedVotes, to avoid
 * pulling the "Abstained" card label into the expected list.
 */

import { test, expect } from './fixtures/app.fixture';
import { ESTIMATING, LOBBY } from './fixtures/helpers';

/** Assert that the numeric (non-abstained) vote groups show exactly the given card values. */
async function expectNumericVotes(
  page: import('@playwright/test').Page,
  expected: string[],
): Promise<void> {
  await page.waitForURL(/\/lobby/);
  const resultsSection = page.locator(LOBBY.resultsSection);
  await resultsSection.waitFor({ state: 'visible', timeout: 10_000 });
  // Wait for at least one numeric group card to appear.
  const numericGroups = page.locator(
    'section.results-section ion-item-group.group:not(.didnt-vote):not(.abstained)',
  );
  await numericGroups.first().waitFor({ state: 'visible', timeout: 10_000 });
  const allChips: string[] = [];
  const groupCount = await numericGroups.count();
  for (let i = 0; i < groupCount; i++) {
    const group = numericGroups.nth(i);
    const cardValue = await group.locator('.card').textContent();
    const chipLabels = await group.locator('ion-chip ion-label').allTextContents();
    for (const _ of chipLabels) {
      allChips.push(cardValue?.trim() ?? '');
    }
  }
  const sorted = [...allChips].toSorted();
  const expectedSorted = [...expected].toSorted();
  if (sorted.join(',') !== expectedSorted.join(',')) {
    throw new Error(`Expected numeric votes [${expectedSorted}] but got [${sorted}]`);
  }
}

test.describe('Per-round abstain (ADR-0041)', () => {
  /**
   * Case 1 — Ordering invariant: host abstains BEFORE player votes.
   * Auto-reveal must fire because the denominator is 1 (host excluded as abstainer)
   * and player's numeric vote covers it.
   */
  test('abstainer reduces denominator; remaining voter triggers auto-reveal', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();

    // Host abstains first — denominator drops to 1 (player only).
    await host.abstain();

    // Player casts numeric → unanimous auto-reveal fires immediately.
    await player.castVote('5');

    // Both clients auto-navigate to /lobby.
    await host.page.waitForURL(/\/lobby/, { timeout: 8_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 8_000 });

    // Numeric group: player with 5 (exclude abstained group from assertion).
    await expectNumericVotes(host.page, ['5']);
    await expectNumericVotes(player.page, ['5']);

    // Abstained group: host listed.
    await host.expectAbstained(['Host']);
    await player.expectAbstained(['Host']);

    // Didn't vote group must be absent.
    await expect(host.page.locator(LOBBY.didntVoteGroup)).not.toBeVisible();
    await expect(player.page.locator(LOBBY.didntVoteGroup)).not.toBeVisible();
  });

  /**
   * Case 2 — Three clients: abstain does not unblock reveal when a third voter
   * hasn't voted yet.
   *
   * Ordering invariant:
   * 1. host abstains, player casts numeric — auto-reveal must NOT fire
   *    because third client (player2) hasn't voted (denominator = 2: player + player2).
   * 2. player2 casts numeric — now all non-abstaining voters have voted;
   *    auto-reveal fires.
   */
  test('abstain with three clients: third voter still required for auto-reveal', async ({
    host,
    player,
    createParticipant,
  }) => {
    const player2 = await createParticipant('Player2');

    const code = await host.createSession();
    await player.joinSession(code);
    await player2.joinSession(code);

    await host.expectParticipantCount(3);

    await host.startRound();
    await player.waitForEstimating();
    await player2.waitForEstimating();

    // Host abstains. Denominator: 2 (player + player2). One numeric vote isn't enough.
    await host.abstain();

    // Player votes — denominator is 2, only 1 numeric cast → must NOT reveal yet.
    await player.castVote('5');

    // Assert no navigation for ~3 s — auto-reveal must NOT have fired.
    // Promise.race: if any client reaches /lobby within 3 s the test fails.
    const noEarlyReveal = await Promise.race([
      host.page
        .waitForURL(/\/lobby/, { timeout: 3_000 })
        .then(() => 'revealed')
        .catch(() => 'ok'),
      player.page
        .waitForURL(/\/lobby/, { timeout: 3_000 })
        .then(() => 'revealed')
        .catch(() => 'ok'),
      player2.page
        .waitForURL(/\/lobby/, { timeout: 3_000 })
        .then(() => 'revealed')
        .catch(() => 'ok'),
    ]);
    expect(noEarlyReveal).toBe('ok');

    // player2 votes — now denominator (2) is satisfied → auto-reveal fires.
    await player2.castVote('5');

    await host.page.waitForURL(/\/lobby/, { timeout: 8_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 8_000 });
    await player2.page.waitForURL(/\/lobby/, { timeout: 8_000 });

    // Numeric group: player + player2 with 5 (exclude abstained from assertion).
    await expectNumericVotes(host.page, ['5', '5']);

    // Abstained group: host.
    await host.expectAbstained(['Host']);

    // Didn't vote group must be absent.
    await expect(host.page.locator(LOBBY.didntVoteGroup)).not.toBeVisible();
  });

  /**
   * Case 3 — Cross-client convergence: player's page shows Abstained group
   * with host's name after Yjs sync. Proves the sentinel propagates correctly.
   *
   * Ordering invariant: auto-reveal fires (host abstains + player votes),
   * then we assert from player's page specifically.
   */
  test('cross-client: Abstained group visible on player page with host name', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();

    await host.abstain();
    await player.castVote('8');

    // Both land on /lobby after auto-reveal.
    await host.page.waitForURL(/\/lobby/, { timeout: 8_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 8_000 });

    // Assert from player's page specifically — cross-client convergence.
    const abstainedGroup = player.page.locator(LOBBY.abstainedGroup);
    await abstainedGroup.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(abstainedGroup.getByText('Host', { exact: false })).toBeVisible();

    // Numeric group on player's page: only player with 8.
    await expectNumericVotes(player.page, ['8']);
  });

  /**
   * Case 4 — Tap card while abstained clears the abstention and casts that vote
   * (ADR-0041 §5). Grid is dimmed (opacity 0.4) but remains interactive.
   *
   * Ordering invariant: host abstains → grid dimmed asserted → host taps card 3
   * directly while still in dimmed state → abstain cleared + numeric 3 cast →
   * grid un-dims → player votes → auto-reveal fires. Results: numeric 3 group only.
   */
  test('tapping a card while abstained clears abstain and casts the numeric vote', async ({
    host,
    player,
  }) => {
    const code = await host.createSession();
    await player.joinSession(code);

    await host.startRound();
    await player.waitForEstimating();

    // Host abstains → grid should become dimmed but remain interactive.
    await host.abstain();
    await expect(host.page.locator(ESTIMATING.cardGridAbstained)).toBeVisible();

    // Tap card 3 directly while abstained — overwrites the sentinel with the numeric vote.
    await host.castVote('3');

    // Grid should no longer carry the abstained class.
    await expect(host.page.locator(ESTIMATING.cardGridAbstained)).not.toBeVisible();

    // Player votes → auto-reveal fires (both voters numeric, denominator = 2).
    await player.castVote('3');

    await host.page.waitForURL(/\/lobby/, { timeout: 8_000 });
    await player.page.waitForURL(/\/lobby/, { timeout: 8_000 });

    // Only numeric group; no Abstained group; no Didn't vote group.
    await host.expectRevealedVotes(['3', '3']);
    await expect(host.page.locator(LOBBY.abstainedGroup)).not.toBeVisible();
    await expect(host.page.locator(LOBBY.didntVoteGroup)).not.toBeVisible();
  });
});
