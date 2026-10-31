/** PROTOTYPE (#643). Static data for the System sheet (plan §5.1, §5.2, §5.4, §5.7). */

export interface Pair {
  fg: string;
  bg: string;
  /** 'text' needs 4.5:1, 'ui' needs 3:1 */
  kind: 'text' | 'ui';
  note?: string;
  /** the plan's measured value (§5.1 "Measured contrast") */
  plan: { light: number; dark: number };
  ux: string;
}

export const PAIRS: Pair[] = [
  { fg: 'text', bg: 'bg', kind: 'text', plan: { light: 16.6, dark: 16.74 }, ux: 'UX-051' },
  { fg: 'text', bg: 'surface', kind: 'text', plan: { light: 17.98, dark: 15.24 }, ux: 'UX-051' },
  {
    fg: 'text-2',
    bg: 'surface',
    kind: 'text',
    note: 'Close, No votes',
    plan: { light: 10.31, dark: 10.56 },
    ux: 'UX-051',
  },
  {
    fg: 'text-3',
    bg: 'surface',
    kind: 'text',
    note: 'meta, stopwatch, avg',
    plan: { light: 5.99, dark: 6.61 },
    ux: 'UX-051',
  },
  { fg: 'text-3', bg: 'bg', kind: 'text', plan: { light: 5.53, dark: 7.26 }, ux: 'UX-051' },
  { fg: 'text-3', bg: 'surface-2', kind: 'text', plan: { light: 5.14, dark: 5.9 }, ux: 'UX-051' },
  {
    fg: 'text-3',
    bg: 'accent-soft',
    kind: 'text',
    note: 'Strip face on the mode column',
    plan: { light: 5.02, dark: 4.77 },
    ux: 'UX-051',
  },
  {
    fg: 'on-accent',
    bg: 'accent',
    kind: 'text',
    note: 'primary button label',
    plan: { light: 12.2, dark: 5.24 },
    ux: 'UX-052 UX-050',
  },
  {
    fg: 'on-accent-2',
    bg: 'accent',
    kind: 'text',
    note: 'keycap on a fill',
    plan: { light: 10.19, dark: 4.59 },
    ux: 'UX-050',
  },
  {
    fg: 'accent',
    bg: 'surface',
    kind: 'ui',
    note: 'primary vs stage',
    plan: { light: 12.21, dark: 3.27 },
    ux: 'UX-048',
  },
  { fg: 'accent', bg: 'bg', kind: 'ui', plan: { light: 11.26, dark: 3.58 }, ux: 'UX-048' },
  {
    fg: 'accent-text',
    bg: 'surface-2',
    kind: 'ui',
    note: 'selected-tile ring',
    plan: { light: 8.8, dark: 8.78 },
    ux: 'UX-048 UX-050',
  },
  {
    fg: 'accent-text',
    bg: 'surface',
    kind: 'text',
    note: 'links, chips, icons',
    plan: { light: 10.25, dark: 9.86 },
    ux: 'UX-048',
  },
  { fg: 'accent-text', bg: 'bg', kind: 'text', plan: { light: 9.47, dark: 10.82 }, ux: 'UX-048' },
  {
    fg: 'accent-text',
    bg: 'accent-soft',
    kind: 'text',
    note: 'tonal / disabled primary',
    plan: { light: 8.6, dark: 7.1 },
    ux: 'UX-048',
  },
  {
    fg: 'success',
    bg: 'surface',
    kind: 'text',
    note: '✓ Agreed',
    plan: { light: 5.43, dark: 9.09 },
    ux: 'UX-051',
  },
  {
    fg: 'success',
    bg: 'accent-soft',
    kind: 'text',
    note: 'Agreed on the mode column',
    plan: { light: 4.56, dark: 6.55 },
    ux: 'UX-051',
  },
  {
    fg: 'warning',
    bg: 'surface',
    kind: 'text',
    note: '↔ Split',
    plan: { light: 5.78, dark: 9.31 },
    ux: 'UX-051',
  },
  { fg: 'warning', bg: 'surface-2', kind: 'text', plan: { light: 4.97, dark: 8.3 }, ux: 'UX-051' },
  { fg: 'danger', bg: 'surface', kind: 'text', plan: { light: 6.57, dark: 6.99 }, ux: 'UX-051' },
  {
    fg: 'on-danger',
    bg: 'danger',
    kind: 'text',
    note: 'End for everyone',
    plan: { light: 6.58, dark: 7.33 },
    ux: 'UX-051',
  },
  {
    fg: 'line-strong',
    bg: 'surface',
    kind: 'ui',
    note: 'state borders',
    plan: { light: 3.38, dark: 3.34 },
    ux: 'UX-051',
  },
  {
    fg: 'focus',
    bg: 'surface',
    kind: 'ui',
    note: 'focus ring',
    plan: { light: 5.28, dark: 9.86 },
    ux: 'UX-071',
  },
  {
    fg: 'focus',
    bg: 'bg',
    kind: 'ui',
    note: 'focus ring',
    plan: { light: 4.87, dark: 10.82 },
    ux: 'UX-071',
  },
];

export const TOKENS = [
  'bg',
  'surface',
  'surface-2',
  'line',
  'line-strong',
  'text',
  'text-2',
  'text-3',
  'accent',
  'on-accent',
  'on-accent-2',
  'accent-text',
  'accent-soft',
  'focus',
  'success',
  'warning',
  'danger',
  'on-danger',
];

/** Today's values the register measured (fixed hexes, computed live below). */
export const BEFORE: { label: string; fg: string; bg: string; kind: 'text' | 'ui'; ux: string }[] =
  [
    {
      label: 'Secondary text #8E8E93 on #F2F2F7 ("N of M voted")',
      fg: '#8E8E93',
      bg: '#F2F2F7',
      kind: 'text',
      ux: 'UX-051',
    },
    {
      label: 'Secondary text #8E8E93 on dark #1C1C1E',
      fg: '#8E8E93',
      bg: '#1C1C1E',
      kind: 'text',
      ux: 'UX-051',
    },
    {
      label: 'Dark accent #1F6B4F as text on #1C1C1E (Voter chip, Re-vote)',
      fg: '#1F6B4F',
      bg: '#1C1C1E',
      kind: 'text',
      ux: 'UX-048',
    },
    {
      label: 'Dark focus ring #1F6B4F on #1C1C1E',
      fg: '#1F6B4F',
      bg: '#1C1C1E',
      kind: 'ui',
      ux: 'UX-071',
    },
    {
      label: 'Dark focus ring #1F6B4F on #2C2C2E',
      fg: '#1F6B4F',
      bg: '#2C2C2E',
      kind: 'ui',
      ux: 'UX-071',
    },
  ];

export const TYPE_SCALE: { token: string; spec: string; use: string; sample: string }[] = [
  {
    token: 'caption',
    spec: '12/16 · 500',
    use: 'meta row, keycaps, badges',
    sample: 'Story 3 of 12 · PROJ-101 · 0:42',
  },
  {
    token: 'small',
    spec: '14/20 · 400',
    use: 'status line, chips',
    sample: 'You voted 8 · waiting on Sam, Bob',
  },
  {
    token: 'body',
    spec: '16/24 · 400',
    use: 'body, inputs (no iOS zoom)',
    sample: 'Quick story pointing. No accounts.',
  },
  {
    token: 'label',
    spec: '15/20 · 600',
    use: 'buttons, list titles',
    sample: 'Accept 8 · Next: PROJ-102',
  },
  {
    token: 'title',
    spec: '20/28 · 600',
    use: 'story H1 (phone), sheet titles',
    sample: 'Login form validation',
  },
  {
    token: 'headline',
    spec: '28/34 · 700',
    use: 'story H1 (desktop), 3-char faces',
    sample: 'Join Sprint 42',
  },
  { token: 'numeral', spec: '40/40 · 700 · tnum', use: 'card faces ≤2 chars', sample: '13' },
  {
    token: 'display',
    spec: '64/64 · 750 · tnum',
    use: 'revealed hero, summary totals',
    sample: '8',
  },
];

export const SPACE = [1, 2, 3, 4, 5, 6, 7, 8];
export const RADII = ['sm', 'md', 'lg', 'pill'];

export const MOTION: { token: string; ease: string; use: string }[] = [
  { token: 'press', ease: 'std', use: 'press scale .97, card lift 4 px' },
  { token: 'state', ease: 'std', use: 'presence dot fills, chips, toasts' },
  { token: 'enter', ease: 'out', use: 'phase cross-fade, sheet, stamp' },
  { token: 'cap', ease: 'std', use: 'max in the loop; reveal morph total' },
  { token: 'delight', ease: 'spring', use: "hnch'd burst only (never blocks)" },
];

export const ICONS: { concept: string; icon: string | null; text?: string }[] = [
  { concept: 'Step out (back)', icon: 'chevron-back-outline' },
  { concept: 'Overflow', icon: 'ellipsis-horizontal' },
  { concept: 'Invite', icon: 'person-add-outline' },
  { concept: 'Copy link', icon: 'copy-outline' },
  { concept: 'Share', icon: 'share-outline' },
  { concept: 'QR', icon: 'qr-code-outline' },
  { concept: 'Stopwatch', icon: null, text: '0:42 (tabular text, no icon, no emoji)' },
  { concept: 'Re-vote', icon: 'refresh-outline' },
  { concept: 'Skip story', icon: 'play-skip-forward-outline' },
  { concept: 'Remove story', icon: 'close-outline' },
  { concept: 'End for everyone', icon: 'power-outline' },
  { concept: 'Leave', icon: 'exit-outline' },
  { concept: 'Offline', icon: 'cloud-offline-outline' },
  { concept: 'Reconnecting', icon: 'sync-outline' },
  { concept: 'Watch only', icon: 'eye-outline' },
  { concept: 'Add stories', icon: 'add-outline' },
  { concept: 'Paste stories', icon: 'clipboard-outline' },
  { concept: 'Undo', icon: 'arrow-undo-outline' },
  { concept: 'People', icon: 'people-outline' },
  { concept: 'Profile', icon: 'person-circle-outline' },
  { concept: 'Help / keys', icon: 'help-circle-outline' },
  { concept: 'Host', icon: null, text: 'text badge "host" (no star, no crown)' },
];
