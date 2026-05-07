export type AccentKey =
  | 'racing-green'
  | 'dijon'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'pink'
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'teal'
  | 'graphite';

export interface AccentDef {
  base: string; // hex
  soft: string; // rgba (≈14% alpha)
  ink: string; // text color over base ('#fff' | '#000')
  label: string; // UI label
}

export const ACCENTS: Record<AccentKey, AccentDef> = {
  'racing-green': {
    base: '#0B3D2E',
    soft: 'rgba(11,61,46,0.14)',
    ink: '#fff',
    label: 'Racing Green',
  },
  dijon: { base: '#C9A227', soft: 'rgba(201,162,39,0.18)', ink: '#000', label: 'Dijon' },
  blue: { base: '#0A84FF', soft: 'rgba(10,132,255,0.14)', ink: '#fff', label: 'Blue' },
  indigo: { base: '#5E5CE6', soft: 'rgba(94,92,230,0.14)', ink: '#fff', label: 'Indigo' },
  violet: { base: '#BF5AF2', soft: 'rgba(191,90,242,0.14)', ink: '#fff', label: 'Violet' },
  pink: { base: '#FF375F', soft: 'rgba(255,55,95,0.14)', ink: '#fff', label: 'Pink' },
  red: { base: '#FF453A', soft: 'rgba(255,69,58,0.14)', ink: '#fff', label: 'Red' },
  orange: { base: '#FF9F0A', soft: 'rgba(255,159,10,0.16)', ink: '#000', label: 'Orange' },
  amber: { base: '#FFD60A', soft: 'rgba(255,214,10,0.18)', ink: '#000', label: 'Amber' },
  green: { base: '#30D158', soft: 'rgba(48,209,88,0.14)', ink: '#000', label: 'Green' },
  teal: { base: '#40C8E0', soft: 'rgba(64,200,224,0.14)', ink: '#000', label: 'Teal' },
  graphite: { base: '#1C1C1E', soft: 'rgba(28,28,30,0.10)', ink: '#fff', label: 'Graphite' },
};

export const ACCENTS_DARK_OVERRIDE: Partial<Record<AccentKey, AccentDef>> = {
  graphite: { base: '#F2F2F7', soft: 'rgba(242,242,247,0.16)', ink: '#000', label: 'Graphite' },
  'racing-green': {
    base: '#1F6B4F',
    soft: 'rgba(31,107,79,0.20)',
    ink: '#fff',
    label: 'Racing Green',
  },
};

export const DEFAULT_ACCENT: AccentKey = 'racing-green';
