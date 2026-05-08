/**
 * Spec 3 — Auto-reveal denominator excludes left voter (ADR-0036 + ADR-0018 + ADR-0020)
 *
 * Ordering invariant enforced by this test:
 * B leaves BEFORE the round starts (or before voting). C and A vote.
 * Auto-reveal MUST fire — the denominator is online active voters,
 * and B is no longer active (leftAt set). If the denominator still
 * included B, the round would never auto-reveal because B has no vote.
 *
 * Three clients: A (host), B (voter who leaves), C (voter who stays).
 * All are voters (default role). Round created by A. B leaves before voting.
 * A and C vote. Round auto-reveals. A and C land on /lobby with results.
 * B is on /home throughout (left before round).
 */

import { test, expect } from './fixtures/app.fixture';

test.describe('Auto-reveal denominator excludes left voter (ADR-0036 + ADR-0018)', () => {
  test('voter leaves before voting; remaining voters trigger unanimous auto-reveal', async ({
    host,
    player,
    createParticipant,
  }) => {
    // Ordering: B leave must be fully flushed (leftAt written to doc) before
    // A starts the round. We wait for B to land on /home before proceeding.
    const playerB = player; // leaves before voting
    const playerC = await createParticipant('PlayerC');

    const code = await host.createSession();
    await playerB.joinSession(code);
    await playerC.joinSession(code);

    // All three in lobby
    await host.expectParticipantCount(3);

    // B leaves BEFORE the round starts — leftAt written, denominator shrinks to A+C
    await playerB.leaveSession();
    await playerB.page.waitForURL(/\/home/, { timeout: 5_000 });

    // Host and C confirm: active count is now 2
    await host.expectParticipantCount(2);

    // Start round (A + C are the active voters now)
    await host.startRound();
    await playerC.waitForEstimating();

    // A and C both vote — this must trigger unanimous auto-reveal since B is excluded
    await host.castVote('5');
    await playerC.castVote('5');

    // Both active clients land on /lobby — auto-reveal fired
    // Ordering invariant: C navigates to lobby iff auto-reveal counted only A+C
    await host.page.waitForURL(/\/lobby/, { timeout: 8_000 });
    await playerC.page.waitForURL(/\/lobby/, { timeout: 8_000 });

    // Results visible on both
    await host.expectRevealedVotes(['5', '5']);
    await playerC.expectRevealedVotes(['5', '5']);

    // B remains on /home — not on lobby or estimating
    const bUrl = playerB.page.url();
    expect(bUrl).toContain('/home');
  });
});
