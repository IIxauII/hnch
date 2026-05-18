/**
 * Re-export of the shared accent palette (ADR-0043). The canonical
 * definitions live in `@hnch/shared/avatar-palette` so the CLI can use
 * the same keys + definitions for its avatar color picker. Theme
 * accent (this client) and avatar color (per-participant) are
 * independent settings that happen to share keys.
 */
export type { AccentKey, AccentDef } from '@hnch/shared';
export { ACCENTS, ACCENTS_DARK_OVERRIDE, DEFAULT_ACCENT } from '@hnch/shared';
