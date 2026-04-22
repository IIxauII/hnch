import { test, expect } from './fixtures/app.fixture'
import { BASE_URL, JOIN, ONBOARDING } from './fixtures/helpers'

test.describe('Deep-link join (/join?code=...)', () => {
  test('pre-fills code and joins when navigating via deep link', async ({ host, player }) => {
    const code = await host.createSession()

    // Player joins via deep link
    await player.joinViaDeepLink(code)

    // Both see each other
    await host.expectParticipantCount(2)
    await player.expectParticipantCount(2)
  })

  test('code input is pre-filled from query param', async ({ host, player }) => {
    const code = await host.createSession()

    // Navigate to /join?code=... but don't click Join yet
    await player.page.goto(`${BASE_URL}/join?code=${code}`)
    await player.page.waitForURL(/\/(join|onboarding)/)
    if (player.page.url().includes('/onboarding')) {
      // Onboard inline — the pending-join-URL flow resumes to /join, not /home
      const input = player.page.locator(ONBOARDING.nameInput).locator('input')
      await input.fill('Player')
      await player.page.locator(ONBOARDING.continueBtn).click()
      await player.page.waitForURL(/\/join/)
    }

    // Verify the code input is pre-filled with the formatted code
    const input = player.page.locator(JOIN.codeInput).locator('input')
    const value = await input.inputValue()
    // Should contain the code characters (possibly dash-formatted)
    expect(value.replace(/[^A-Z0-9]/gi, '')).toBe(code)
  })
})
