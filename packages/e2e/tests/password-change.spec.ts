/**
 * Mid-session password change scenarios.
 *
 * Verifies that a host can add, change, or remove a password while a session
 * is already live, and that subsequent joiners are governed by the new
 * access mode immediately.
 */

import { test, expect } from './fixtures/app.fixture'
import { JOIN } from './fixtures/helpers'

test.describe('Mid-session password change', () => {
  test('host adds password mid-session; new joiner must provide it', async ({
    host,
    player,
    createParticipant,
  }) => {
    const lateJoiner = await createParticipant('LateJoiner')

    // Host creates open session, player joins without password
    const code = await host.createSession()
    await player.joinSession(code)
    await host.expectParticipantCount(2)

    // Host adds password while session is live
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    )
    await host.openSettings()
    await host.changeAccess('Password', 'midpass')
    await patchDone
    await host.closeSettings()

    // Late joiner must now provide the password to join
    await lateJoiner.joinSessionWithPassword(code, 'midpass')

    // All three are in the session
    await host.expectParticipantCount(3)
    await player.expectParticipantCount(3)
    await lateJoiner.expectParticipantCount(3)
  })

  test('new joiner rejected with wrong password after mid-session lock', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()

    // Host adds password mid-session
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    )
    await host.openSettings()
    await host.changeAccess('Password', 'correctpw')
    await patchDone
    await host.closeSettings()

    // Player tries to join with wrong password
    await player.page.goto('http://localhost:4200/home')
    await player.page.waitForURL(/\/(home|onboarding)/)
    if (player.page.url().includes('/onboarding')) {
      await player.onboard()
    }
    await player.page.locator('ion-card:has(strong:text-is("Join Room"))').click()
    await player.page.waitForURL(/\/join/)
    const codeInput = player.page.locator(JOIN.codeInput).locator('input')
    await codeInput.fill(code)
    await player.page.locator(JOIN.joinBtn).click()

    const pwInput = player.page.locator(JOIN.passwordInput).locator('input')
    await pwInput.waitFor({ state: 'visible', timeout: 5_000 })
    await pwInput.fill('wrongpassword')
    await player.page.locator(JOIN.joinBtn).click()

    // Should remain on join page — never navigates to lobby
    await player.page.waitForTimeout(2_000)
    expect(player.page.url()).toContain('/join')
  })

  test('host changes password mid-session; old password rejected, new password accepted', async ({
    host,
    player,
    createParticipant,
  }) => {
    const joinerOldPw = await createParticipant('JoinerOldPw')
    const joinerNewPw = await createParticipant('JoinerNewPw')

    const code = await host.createSession()

    // Set initial password
    const firstPatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    )
    await host.openSettings()
    await host.changeAccess('Password', 'oldpassword')
    await firstPatch
    await host.closeSettings()

    // Change to a new password
    const secondPatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    )
    await host.openSettings()
    await host.changeAccess('Password', 'newpassword')
    await secondPatch
    await host.closeSettings()

    // Joiner with old password is rejected — stays on join page
    await joinerOldPw.page.goto('http://localhost:4200/home')
    await joinerOldPw.page.waitForURL(/\/(home|onboarding)/)
    if (joinerOldPw.page.url().includes('/onboarding')) {
      await joinerOldPw.onboard()
    }
    await joinerOldPw.page.locator('ion-card:has(strong:text-is("Join Room"))').click()
    await joinerOldPw.page.waitForURL(/\/join/)
    await joinerOldPw.page.locator(JOIN.codeInput).locator('input').fill(code)
    await joinerOldPw.page.locator(JOIN.joinBtn).click()
    const pwInputOld = joinerOldPw.page.locator(JOIN.passwordInput).locator('input')
    await pwInputOld.waitFor({ state: 'visible', timeout: 5_000 })
    await pwInputOld.fill('oldpassword')
    await joinerOldPw.page.locator(JOIN.joinBtn).click()
    await joinerOldPw.page.waitForTimeout(2_000)
    expect(joinerOldPw.page.url()).toContain('/join')

    // Joiner with new password succeeds
    await joinerNewPw.joinSessionWithPassword(code, 'newpassword')
    await host.expectParticipantCount(2) // host + joinerNewPw (joinerOldPw never got in)
  })

  test('host removes password mid-session; new joiner enters without password', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()

    // Set password initially
    const setPatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    )
    await host.openSettings()
    await host.changeAccess('Password', 'temppass')
    await setPatch
    await host.closeSettings()

    // Remove password while session is live
    const removePatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    )
    await host.openSettings()
    await host.changeAccess('Open')
    await removePatch
    await host.closeSettings()

    // Player joins with no password — should succeed immediately
    await player.joinSession(code)
    await host.expectParticipantCount(2)
    await player.expectParticipantCount(2)
  })
})
