/**
 * Centralized selectors and constants for hnch e2e tests.
 *
 * Every UI selector lives here so that template changes only
 * require a single-file update.
 */

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------
export const ONBOARDING = {
  nameInput: 'ion-input[autocapitalize="words"]',
  continueBtn: 'ion-button:has-text("Continue")',
} as const

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
export const HOME = {
  createCard: 'ion-card:has(strong:text-is("Create Room"))',
  joinCard: 'ion-card:has(strong:text-is("Join Room"))',
} as const

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------
export const JOIN = {
  codeInput: 'ion-input.code-input',
  passwordInput: 'ion-input[type="password"]',
  scanQrBtn: 'ion-item:has-text("Scan QR code")',
  joinBtn: 'ion-button:has-text("Join")',
} as const

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------
export const LOBBY = {
  roomCode: 'h1.room-code',
  subtitle: 'button.subtitle',
  participantList: 'ion-list.participants',
  participantItems: 'ion-list.participants ion-item',
  participantCount: 'ion-list.participants ion-list-header ion-label',
  hostIcon: '.host-icon',
  startRoundBtn: /Start Round \d+/,
} as const

// ---------------------------------------------------------------------------
// QR display modal
// ---------------------------------------------------------------------------
export const QR_MODAL = {
  showBtn: 'ion-item:has-text("Show QR code")',
  img: 'app-qr-display-sheet img',
  codeText: 'app-qr-display-sheet .room-code',
  doneBtn: 'app-qr-display-sheet ion-button:has-text("Done")',
} as const

// ---------------------------------------------------------------------------
// Round-start modal
// ---------------------------------------------------------------------------
export const ROUND_START = {
  titleInput: 'app-round-start-sheet ion-input',
  startBtn: 'app-round-start-sheet ion-button:has-text("Start")',
} as const

// ---------------------------------------------------------------------------
// Estimating
// ---------------------------------------------------------------------------
export const ESTIMATING = {
  roundTitle: 'h1.title',
  timer: 'p.timer',
  timerUrgent: 'p.timer.urgent',
  cardGrid: 'div.grid',
  card: (value: string) => `ion-card.card:has(ion-card-content:text-is("${value}"))`,
  selectedCard: 'ion-card.card.selected',
  voteDots: 'app-avatar-vote-row .dot',
  votedDots: 'app-avatar-vote-row .dot.voted',
  voteCount: 'app-avatar-vote-row .count',
  revealBtn: 'ion-button:has-text("Reveal Votes")',
} as const

// ---------------------------------------------------------------------------
// Revealed
// ---------------------------------------------------------------------------
export const REVEALED = {
  resultsTitle: 'h1.title',
  voteGroups: 'ion-item-group.group:not(.didnt-vote)',
  groupCard: 'ion-item-group .card',
  groupCount: 'ion-item-group .count',
  voterChips: 'ion-chip ion-label',
  revoteBtn: 'ion-button:has-text("Re-vote")',
  nextRoundBtn: 'ion-button:has-text("Next Round")',
  didntVoteGroup: 'ion-item-group.didnt-vote',
} as const

// ---------------------------------------------------------------------------
// Session settings
// ---------------------------------------------------------------------------
export const SETTINGS_SHEET = {
  scaleRow: 'app-session-settings-sheet ion-item:has(h3:text-is("Scale"))',
  timerRow: 'app-session-settings-sheet ion-item:has(h3:text-is("Timer"))',
  accessRow: 'app-session-settings-sheet ion-item:has(h3:text-is("Access"))',
  scaleValue: 'app-session-settings-sheet ion-item:has(h3:text-is("Scale")) ion-note',
  timerValue: 'app-session-settings-sheet ion-item:has(h3:text-is("Timer")) ion-note',
  accessValue: 'app-session-settings-sheet ion-item:has(h3:text-is("Access")) ion-note',
  doneBtn: 'app-session-settings-sheet ion-button:has-text("Done")',
} as const

export const SCALE_PICKER = {
  option: (label: string) => `app-scale-picker-sheet ion-item:has(h3:text-is("${label}"))`,
  doneBtn: 'app-scale-picker-sheet ion-button:has-text("Done")',
} as const

export const TIMER_PICKER = {
  option: (label: string) => `app-timer-picker-sheet ion-item:has(ion-label:text-is("${label}"))`,
  doneBtn: 'app-timer-picker-sheet ion-button:has-text("Done")',
} as const

export const ACCESS_PICKER = {
  option: (label: string) => `app-access-picker-sheet ion-item:has(h3:text-is("${label}"))`,
  passwordInput: 'app-access-picker-sheet ion-input[type="password"]',
  doneBtn: 'app-access-picker-sheet ion-button:has-text("Done")',
} as const

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
export const BASE_URL = 'http://localhost:4200'

/** Default Fibonacci scale card values. */
export const FIBONACCI_CARDS = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕']

/** T-shirt scale card values. */
export const TSHIRT_CARDS = ['XS', 'S', 'M', 'L', 'XL', '?', '☕']
