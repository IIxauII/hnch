/**
 * PROTOTYPE (#643). Coverage: how the prototype answers each of the 109 register
 * entries. Each area owner writes its own file; this one merges them. The lab
 * panel lists all 109 and flags any entry with no coverage in red.
 */
import { CHROME_COVERAGE } from './chrome.coverage';
import { CLI_COMMANDS_COVERAGE } from './cli-commands.coverage';
import { CLI_COVERAGE } from './cli.coverage';
import { CORE_COVERAGE } from './core.coverage';
import { ENTRY_COVERAGE } from './entry.coverage';
import { STAGE_COVERAGE } from './stage.coverage';

export interface CoverageEntry {
  /** e.g. 'UX-034' */
  ux: string;
  /** One or two plain sentences: what the prototype does about it (the "after"). */
  how: string;
  /** Scene id that shows it (from scenes.ts or an area scenes file). */
  scene?: string;
  /** What to press or look at once the scene is open. */
  try?: string;
  /**
   * 'shown' = visible/clickable in the web prototype; 'cli' = in the terminal
   * prototype (`pnpm proto:643:cli`); 'note' = not visual (docs, relay, CI),
   * described only.
   */
  kind: 'shown' | 'cli' | 'note';
}

export const COVERAGE: CoverageEntry[] = [
  ...STAGE_COVERAGE,
  ...CHROME_COVERAGE,
  ...ENTRY_COVERAGE,
  ...CLI_COVERAGE,
  ...CLI_COMMANDS_COVERAGE,
  ...CORE_COVERAGE,
];
