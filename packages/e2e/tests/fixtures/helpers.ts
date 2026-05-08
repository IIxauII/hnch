/**
 * Centralized selectors and constants for hnch e2e tests.
 *
 * Every UI selector lives here so that template changes only
 * require a single-file update.
 */

import type { Page } from '@playwright/test';

export async function expectToast(
  page: Page,
  message: RegExp | string,
  opts?: { timeout?: number },
): Promise<void> {
  await page.waitForFunction(
    ({ pattern, flags, isRegex }: { pattern: string; flags: string; isRegex: boolean }) => {
      const toasts = Array.from(document.querySelectorAll('ion-toast:not(.overlay-hidden)'));
      return toasts.some((t) => {
        const msg = (t as unknown as { message?: string }).message ?? '';
        if (isRegex) return new RegExp(pattern, flags).test(msg);
        return msg === pattern || msg.includes(pattern);
      });
    },
    {
      pattern: typeof message === 'string' ? message : message.source,
      flags: message instanceof RegExp ? message.flags : '',
      isRegex: message instanceof RegExp,
    },
    { timeout: opts?.timeout ?? 5_000 },
  );
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------
export const ONBOARDING = {
  nameInput: 'ion-input[autocapitalize="words"]',
  continueBtn: 'ion-button:has-text("Continue")',
} as const;

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
export const HOME = {
  // Phase D: home uses ion-button CTAs inside hnch-section-card (no ion-item/h2).
  // Match by visible text content (Playwright sees shadow-pierced text via :has-text).
  createCard: 'ion-button:has-text("Create room")',
  joinCard: 'ion-button:has-text("Join room")',
} as const;

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------
export const JOIN = {
  /**
   * Segmented 6-tile code input. Each tile is `<input maxlength="1">`,
   * so use {@link fillRoomCode} to type characters one at a time —
   * native `.fill()` is clamped to one tile by the maxlength attribute.
   */
  codeInput: 'app-segmented-code-input',
  passwordInput: 'ion-input[type="password"]',
  // Phase D: scan QR is now ion-button.scan-btn in footer (not ion-item).
  // Use class selector since aria-label CSS selector doesn't reliably match Ionic web components.
  scanQrBtn: 'app-join ion-button.scan-btn',
  // Scoped to app-join to avoid matching the home page "Join room" button
  // which is kept in the Ionic DOM stack during navigation
  joinBtn: 'app-join ion-button:has-text("Join")',
} as const;

/**
 * Type a room code into the segmented join-code input. Focuses the
 * first tile and types characters one at a time so the component's
 * onInput handler advances focus to the next tile after each character.
 */
export async function fillRoomCode(page: Page, code: string): Promise<void> {
  const firstTile = page.locator(JOIN.codeInput).locator('input').first();
  await firstTile.focus();
  await page.keyboard.type(code);
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------
export const LOBBY = {
  // Phase D: code lives in .code-text inside mobile code-card (ion-hide-lg-up).
  // The element is CSS-hidden at desktop (≥1024px) but is always in DOM — use
  // { state: 'attached' } when reading textContent, not toBeVisible().
  roomCode: 'span.code-text',
  // Always-visible signal that the lobby page has fully rendered.
  // Use this instead of roomCode for "lobby loaded" assertions at desktop viewports.
  lobbyReady: 'app-lobby:not(.ion-page-hidden) ion-list.participants-list',
  // Phase D: scale button in Scale SectionCard — used to verify scale label
  subtitle: 'button.scale-btn',
  // Phase D: flat list, no accordion
  participantList: 'ion-list.participants-list',
  participantItems: 'app-lobby:not(.ion-page-hidden) hnch-participant-row',
  // Phase D: participant count shown as text in .participants-footer ("N online")
  // Tests that need to assert count should use participantItems count or participantsSummary.
  participantCount: 'app-lobby:not(.ion-page-hidden) .participants-footer',
  hostIcon: '.host-badge',
  startRoundBtn: /Start Round \d+/,
  /** Results section: now a hnch-section-card with class results-card */
  resultsSection: 'hnch-section-card.results-card',
  resultsHeading: 'hnch-section-card.results-card .results-heading',
  // Phase D: vote groups are hnch-vote-result-card inside app-vote-results
  voteGroups: 'app-vote-results hnch-vote-result-card',
  groupCard: 'app-vote-results hnch-vote-result-card .card-glyph',
  voterChips: 'app-vote-results ion-chip ion-label',
  didntVoteGroup: 'app-vote-results ion-item-group.didnt-vote',
  revoteBtn: 'ion-button:has-text("Re-vote")',
  nextRoundBtn: /Next Round \d+/,
} as const;

// ---------------------------------------------------------------------------
// QR display modal
// ---------------------------------------------------------------------------
export const QR_MODAL = {
  // Phase D: QR button is inside mobile code-card (ion-hide-lg-up hidden at desktop).
  // Use evaluate() with waitFor({ state: 'attached' }) to click hidden element.
  showBtn: 'hnch-section-card.code-card ion-button:has-text("QR code")',
  img: 'app-qr-display-sheet img',
  codeText: 'app-qr-display-sheet .room-code',
  doneBtn: 'app-qr-display-sheet ion-button:has-text("Done")',
} as const;

// ---------------------------------------------------------------------------
// Round-start modal
// ---------------------------------------------------------------------------
export const ROUND_START = {
  titleInput: 'app-round-start-sheet ion-input',
  startBtn: 'app-round-start-sheet ion-button:has-text("Start")',
} as const;

// ---------------------------------------------------------------------------
// Estimating
// ---------------------------------------------------------------------------
export const ESTIMATING = {
  // Phase D: "Round N" is in ion-title span.round-title (toolbar); h1 is the descriptor/subject
  roundTitle: 'ion-title span.round-title',
  roundSubject: 'h1.subject-title',
  elapsed: 'p.elapsed',
  cardGrid: 'div.grid',
  card: (value: string) => `app-estimating ion-card.card:has(ion-card-content:text-is("${value}"))`,
  selectedCard: 'ion-card.card.selected',
  voteDots: 'app-avatar-vote-row .dot',
  votedDots: 'app-avatar-vote-row .dot.voted',
  voteCount: 'app-estimating:not(.ion-page-hidden) app-avatar-vote-row .count',
  revealBtn: 'ion-button:has-text("Reveal Votes")',
  roleChip: 'app-estimating:not(.ion-page-hidden) ion-header ion-chip',
} as const;

// ---------------------------------------------------------------------------
// Session settings
// ---------------------------------------------------------------------------
export const SETTINGS_SHEET = {
  scaleRow: 'app-session-settings-sheet ion-item:has(h3:text-is("Scale"))',
  accessRow: 'app-session-settings-sheet ion-item:has(h3:text-is("Access"))',
  scaleValue: 'app-session-settings-sheet ion-item:has(h3:text-is("Scale")) ion-note',
  accessValue: 'app-session-settings-sheet ion-item:has(h3:text-is("Access")) ion-note',
  doneBtn: 'app-session-settings-sheet ion-button:has-text("Done")',
} as const;

export const SCALE_PICKER = {
  option: (label: string) => `app-scale-picker-sheet ion-item:has(h3:text-is("${label}"))`,
  doneBtn: 'app-scale-picker-sheet ion-button:has-text("Done")',
} as const;

export const ACCESS_PICKER = {
  option: (label: string) => `app-access-picker-sheet ion-item:has(h3:text-is("${label}"))`,
  passwordInput: 'app-access-picker-sheet ion-input[type="password"]',
  doneBtn: 'app-access-picker-sheet ion-button:has-text("Done")',
} as const;

// ---------------------------------------------------------------------------
// App settings (settings page, not session settings)
// ---------------------------------------------------------------------------
// Display name + default session name use inline ion-input (blur-save).
// Theme + accent use ion-select interface="popover" — Ionic auto-creates
// an ion-select-popover with ion-radio rows when the trigger is clicked.
export const APP_SETTINGS = {
  nameInput: 'app-settings ion-input[label="Display name"]',
  themeSelect: 'app-settings ion-select[label="Theme"]',
  accentSelect: 'app-settings ion-select[label="Accent"]',
  defaultScaleRow: 'app-settings ion-item:has(ion-label:text-is("Default scale"))',
  defaultScaleValue: 'app-settings ion-item:has(ion-label:text-is("Default scale")) ion-note',
  versionValue: 'app-settings ion-item:has(ion-label:text-is("Version")) ion-note',
} as const;

/** ion-select-popover option row, addressed by the visible label text. */
export const SELECT_POPOVER = {
  option: (label: string) => `ion-select-popover ion-radio:has-text("${label}")`,
} as const;

// ---------------------------------------------------------------------------
// App settings scale picker (picker mode - builtin scales only)
// ---------------------------------------------------------------------------
// Selectors use display label text (h3) because Angular [value] bindings set
// DOM properties, not HTML attributes, so CSS [value="..."] doesn't match.
export const APP_SETTINGS_SCALE_PICKER = {
  scaleRadio: (label: string) => `app-scale-picker-sheet ion-radio:has(h3:text-is("${label}"))`,
  scaleItem: (label: string) => `app-scale-picker-sheet ion-item:has(h3:text-is("${label}"))`,
  editBtn: (label: string) =>
    `app-scale-picker-sheet ion-item:has(h3:text-is("${label}")) ion-button`,
  doneBtn: 'app-scale-picker-sheet ion-button:has-text("Done")',
} as const;

// ---------------------------------------------------------------------------
// Preset card toggle editor (scale-editor-sheet)
// ---------------------------------------------------------------------------
export const PRESET_CARD_EDITOR = {
  cardToggle: (cardFace: string) =>
    `app-scale-editor-sheet ion-item:has(h3:text-is("${cardFace}")) ion-toggle`,
  doneBtn: 'app-scale-editor-sheet ion-button:has-text("Done")',
  cardList: 'app-scale-editor-sheet ion-list',
} as const;

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
export const BASE_URL =
  process.env['PLAYWRIGHT_BASE_URL'] ?? `http://localhost:${process.env['CLIENT_PORT'] ?? 4200}`;
