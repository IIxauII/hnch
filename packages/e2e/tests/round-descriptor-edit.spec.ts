import { test, expect } from './fixtures/app.fixture';
import { LOBBY, ROUND_FIELD } from './fixtures/helpers';

// NOTE: `ion-button` is a web component — Ionic reflects `aria-label` onto
// the inner shadow <button>, not the host element. CSS attribute selectors
// ([aria-label="..."]) do not match. Use page.getByLabel() which uses ARIA
// and pierces shadow DOM, or scope by CSS class + container.
const ROUND_EDIT = {
  modal: 'app-round-edit-sheet',
  // The field is named by its label, which is also what is on screen.
  titleInputNative: `app-round-edit-sheet ion-input[label="${ROUND_FIELD.title}"] input`,
  saveBtn: 'app-round-edit-sheet ion-button:has-text("Save")',
  /** Pencil scoped to the inline results section (latest revealed round). */
  currentRoundPencil: '.results-descriptor-row ion-button.edit-btn',
  /** Pencil in history for round N — `n` is 1-based round number. */
  historyPencil: (n: number) =>
    `app-round-history li:has(.round-label:text-is("Round ${n}")) ion-button.edit-btn`,
} as const;

/** Open round-edit modal and return the title input locator. */
async function openCurrentRoundEdit(page: import('@playwright/test').Page) {
  const pencil = page.locator(ROUND_EDIT.currentRoundPencil);
  await pencil.waitFor({ state: 'visible', timeout: 5_000 });
  await pencil.click();
  const modal = page.locator(ROUND_EDIT.modal);
  await modal.waitFor({ state: 'visible', timeout: 5_000 });
  return modal;
}

async function saveTitleInModal(page: import('@playwright/test').Page, newTitle: string) {
  const titleInput = page.locator(ROUND_EDIT.titleInputNative);
  await titleInput.fill(newTitle);
  const saveBtn = page.locator(ROUND_EDIT.saveBtn);
  await saveBtn.waitFor({ state: 'visible' });
  await saveBtn.click();
  // Modal should dismiss
  await page.locator(ROUND_EDIT.modal).waitFor({ state: 'hidden', timeout: 5_000 });
}

// Shared setup: two clients, vote and reveal one round
async function revealOneRound(
  host: import('./fixtures/app.fixture').Participant,
  player: import('./fixtures/app.fixture').Participant,
  title: string,
) {
  const code = await host.createSession();
  await player.joinSession(code);
  await host.startRound(title);
  await player.waitForEstimating();
  await host.castVote('5');
  await player.castVote('8');
  await host.reveal();
  await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });
  return code;
}

test.describe('Round descriptor edit (post-reveal)', () => {
  test('host sees pencil; joiner does not', async ({ host, player }) => {
    await revealOneRound(host, player, 'Foo');

    // Host: pencil visible in results section
    await expect(host.page.locator(ROUND_EDIT.currentRoundPencil)).toBeVisible();

    // Joiner: pencil absent
    await expect(player.page.locator(ROUND_EDIT.currentRoundPencil)).not.toBeVisible();
  });

  test('modal pre-fills and save propagates to both clients', async ({ host, player }) => {
    await revealOneRound(host, player, 'Foo');

    // Open modal on host — verify pre-fill
    await openCurrentRoundEdit(host.page);
    const titleInput = host.page.locator(ROUND_EDIT.titleInputNative);
    await expect(titleInput).toHaveValue('Foo');

    // Edit and save
    await saveTitleInModal(host.page, 'Foo (backend)');

    // Both clients see updated descriptor within 3 s
    const descriptor = LOBBY.resultsSection + ' p.results-descriptor';
    await expect(host.page.locator(descriptor)).toHaveText('Foo (backend)', { timeout: 3_000 });
    await expect(player.page.locator(descriptor)).toHaveText('Foo (backend)', { timeout: 3_000 });
  });

  test('Save disabled when title empty; re-enabled when non-empty', async ({ host, player }) => {
    await revealOneRound(host, player, 'Foo');
    await openCurrentRoundEdit(host.page);

    const titleInput = host.page.locator(ROUND_EDIT.titleInputNative);
    // ion-button is a web component; toBeDisabled() checks ARIA but Playwright
    // doesn't always detect Ionic's disabled state via the host element.
    // Scope to the inner shadow <button> which carries the native disabled property.
    const saveBtnNative = host.page.locator(
      'app-round-edit-sheet ion-button:has-text("Save") button',
    );

    // Clear — Save must be disabled
    await titleInput.fill('');
    await expect(saveBtnNative).toBeDisabled();

    // Type non-empty — Save must re-enable
    await titleInput.fill('Something');
    await expect(saveBtnNative).toBeEnabled();
  });

  test('history row pencil edits past round; both clients see updated label', async ({
    host,
    player,
  }) => {
    // Round 1
    const code = await host.createSession();
    await player.joinSession(code);
    await host.startRound('RoundOne');
    await player.waitForEstimating();
    await host.castVote('5');
    await player.castVote('5');
    await host.reveal();
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // Round 2 — after this reveal, Round 1 moves to history
    await host.nextRound('RoundTwo');
    await player.waitForEstimating();
    await host.castVote('8');
    await player.castVote('8');
    await host.reveal();
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // Round 1 is now in history — click its pencil
    const historyPencil = host.page.locator(ROUND_EDIT.historyPencil(1));
    await historyPencil.waitFor({ state: 'visible', timeout: 5_000 });
    await historyPencil.click();
    const modal = host.page.locator(ROUND_EDIT.modal);
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    // Save edited title
    await saveTitleInModal(host.page, 'RoundOne edited');

    // Both clients see updated history row
    // The round-title span is inside app-round-history .round-title
    const hostHistoryTitle = host.page
      .locator('app-round-history .round-title')
      .filter({ hasText: 'RoundOne edited' });
    const playerHistoryTitle = player.page
      .locator('app-round-history .round-title')
      .filter({ hasText: 'RoundOne edited' });
    await expect(hostHistoryTitle).toBeVisible({ timeout: 3_000 });
    await expect(playerHistoryTitle).toBeVisible({ timeout: 3_000 });
  });

  test('cancel discards change — descriptor unchanged', async ({ host, player }) => {
    await revealOneRound(host, player, 'Original');
    await openCurrentRoundEdit(host.page);

    const titleInput = host.page.locator(ROUND_EDIT.titleInputNative);
    await titleInput.fill('Changed');

    // Dismiss via Escape (modal cancel)
    await host.page.keyboard.press('Escape');
    await host.page.locator(ROUND_EDIT.modal).waitFor({ state: 'hidden', timeout: 5_000 });

    // Descriptor still shows original value
    const descriptor = LOBBY.resultsSection + ' p.results-descriptor';
    await expect(host.page.locator(descriptor)).toHaveText('Original');
  });
});
