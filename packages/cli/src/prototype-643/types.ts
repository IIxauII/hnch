/**
 * PROTOTYPE (#643), throwaway. The seam between the two CLI prototype halves:
 *   main.ts      command surface (launcher, create/join/resume/config, one-shots, exit summary)
 *   room-tui.tsx the alternate-screen Room (waiting / voting / revealed) on the shared RoomModel
 * Run: `pnpm proto:643:cli [command] [flags]` from the repo root.
 */
import type { FixtureName, RoomModel } from './room-model.js';

export interface TuiOptions {
  /** The in-memory room, already loaded with a fixture and `selfId`. */
  model: RoomModel;
  /** `--plain` / screen-reader mode: no boxes, no animation, one line per change (UX-104). */
  plain: boolean;
  /** false under NO_COLOR, --no-color or FORCE_COLOR=0 (UX-100): drop colour, keep glyph + word. */
  color: boolean;
  /** HNCH_ASCII=1 or TERM=linux: ASCII glyph fallbacks (§5.8 table). */
  ascii: boolean;
  /** Web link for this room (invite overlay, UX-101). */
  webUrl: string;
}

/** What the Room returns when it closes, so main.ts can print the summary (UX-103). */
export interface TuiExit {
  reason: 'quit' | 'leave' | 'ended' | 'removed';
}

export type RunRoomTui = (opts: TuiOptions) => Promise<TuiExit>;

export interface ProtoLaunch {
  fixture: FixtureName;
  selfId: string;
}
