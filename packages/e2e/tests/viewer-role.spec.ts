import { test, expect } from './fixtures/app.fixture'

test.describe('Viewer role', () => {
  test('can toggle between voter and observer roles', async ({ player }) => {
    const code = await player.createSession()

    // Start round
    await player.startRound()

    // Initially should show "Voter"
    await expect(
      player.page.locator('ion-chip').filter({ hasText: 'Voter' })
    ).toBeVisible()

    // Toggle to observer
    await player.toggleRole()
    await expect(
      player.page.locator('ion-chip').filter({ hasText: 'Observing' })
    ).toBeVisible()

    // Toggle back to voter
    await player.toggleRole()
    await expect(
      player.page.locator('ion-chip').filter({ hasText: 'Voter' })
    ).toBeVisible()
  })

  test('observer excluded from auto-reveal: auto-reveals when only voter (host) votes', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Start round — both land on /estimating
    await host.startRound()
    await player.waitForEstimating()

    // Player toggles to observer role — now excluded from the voter count
    await player.toggleRole()
    await expect(
      player.page.locator('ion-chip').filter({ hasText: 'Observing' }),
    ).toBeVisible()

    // Host votes — host is now the ONLY online voter.
    // Auto-reveal should fire immediately (all online voters have voted).
    await host.castVote('5')

    // Both navigate to /lobby without any manual Reveal tap
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 })
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 })

    // Only host's vote appears — observer's non-vote is not in results
    await host.expectRevealedVotes(['5'])
    await player.expectRevealedVotes(['5'])
  })
})
