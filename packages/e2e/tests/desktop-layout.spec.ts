import { test, expect } from './fixtures/app.fixture'
import { BASE_URL } from './fixtures/helpers'

/**
 * Desktop viewport smoke test for split-pane + ion-grid layout.
 *
 * Verifies that at lg breakpoint (992px; viewport 1440x900):
 * - ion-split-pane renders the side menu
 * - ion-grid wraps content to constrained width
 * - no horizontal overflow on body
 */
test.describe('Desktop layout', () => {
  test('split-pane menu visible and content constrained at 1440x900', async ({ host }) => {
    // Set viewport to lg breakpoint (1440 > 992px)
    await host.page.setViewportSize({ width: 1440, height: 900 })

    // Navigate to home (may hit onboarding first)
    await host.page.goto(`${BASE_URL}/home`)
    await host.page.waitForURL(/\/(home|onboarding)/)
    if (host.page.url().includes('/onboarding')) {
      await host.onboard()
    }

    // Assert side menu is visible: locate Settings link in ion-split-pane area
    const splitPane = host.page.locator('ion-split-pane')
    await expect(splitPane).toBeVisible()

    // Side menu contains Settings, Home, and (when active) Active Session links
    const settingsLink = host.page.locator('ion-menu').locator('ion-item').filter({ hasText: 'Settings' })
    await expect(settingsLink).toBeVisible()

    // Assert page content is constrained: get main content column bounding box
    // Scope to active page (not hidden in routing stack) to avoid strict-mode errors
    const pageGrid = host.page.locator('app-home:not(.ion-page-hidden) ion-grid.page-grid')
    await expect(pageGrid).toBeVisible()

    const gridBounds = await pageGrid.boundingBox()
    if (!gridBounds) {
      throw new Error('Could not measure ion-grid bounding box')
    }

    // On 1440px viewport, constrained column width should be well below 1100px
    // (sm: 100%, md: 80% w/ offsets, lg: 80% w/ offsets)
    if (gridBounds.width >= 1100) {
      throw new Error(
        `Expected ion-grid width < 1100px but measured ${gridBounds.width}px on 1440px viewport`
      )
    }

    // Assert no horizontal overflow on body
    const bodyOverflow = await host.page.evaluate(() => {
      const body = document.body
      const viewport = window.innerWidth
      return {
        scrollWidth: body.scrollWidth,
        viewport,
        hasHorizontalScroll: body.scrollWidth > viewport + 1, // +1 for rounding tolerance
      }
    })

    if (bodyOverflow.hasHorizontalScroll) {
      throw new Error(
        `Horizontal overflow detected: body.scrollWidth=${bodyOverflow.scrollWidth} > viewport=${bodyOverflow.viewport}`
      )
    }
  })
})
