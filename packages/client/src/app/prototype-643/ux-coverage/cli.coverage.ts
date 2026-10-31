/** PROTOTYPE (#643). Coverage entries owned by the cli area (the terminal Room, `room-tui.tsx`). */
import type { CoverageEntry } from './coverage';

const J = 'pnpm proto:643:cli join K7P-9MR --as ana --name Ana';
const C = 'pnpm proto:643:cli create --as hana';

export const CLI_COVERAGE: CoverageEntry[] = [
  // ── owned ────────────────────────────────────────────────────────────────
  {
    ux: 'UX-010',
    kind: 'cli',
    how: 'The terminal Room watches your own participant record: when the host removes you it shows "Hana removed you from Sprint 42" and exits cleanly (reason removed). Leave is in the menu and writes leftAt; the story line always shows the story key and title like the web.',
    try: `${J} --fixture voting-partial, then ctrl+l, 6 (Hana removes you). Leave: m, l`,
  },
  {
    ux: 'UX-011',
    kind: 'cli',
    how: 'The Room re-renders on every model change, stories included: stories someone else adds appear in "Up next" at once and the host\'s ⏎ starts the next one with no title prompt.',
    try: `${J}, then ctrl+l, 8 (Ana adds 3 stories) and watch After this go from 4 to 7`,
  },
  {
    ux: 'UX-012',
    kind: 'cli',
    how: 'The header shows ◌ connecting for 600 ms, then ● live once synced, password rooms included; it only changes again when degraded (◌ reconnecting, ✗ offline).',
    try: 'pnpm proto:643:cli join Q2M-4TT (password retro42) and watch the header; then ctrl+l, 4 (you go offline)',
  },
  {
    ux: 'UX-015',
    kind: 'cli',
    how: 'You vote by typing the card face: a unique prefix commits at once (8), 2 waits 450 ms because 21 exists (dashed boxes, footer "⏎ vote 2"), - passes. Arrows wrap and start on your vote; no prompt per vote and none per story when the queue has one.',
    try: `${C} --fixture waiting, ⏎ (keep the name), ⏎ (Start · PROJ-101), 8; next story: type 2 and wait, or 21`,
  },
  {
    ux: 'UX-083',
    kind: 'cli',
    how: 'No config editors in the Room: the menu has Room settings with Scale and Password only (and your name); a line says scales, avatar colour and defaults live in `hnch config`.',
    try: `${C} --fixture waiting, then m, e`,
  },
  {
    ux: 'UX-094',
    kind: 'cli',
    how: 'Settings → Password opens a plain masked input (•••) that Esc always cancels back to Settings; ⏎ sets it. Every layer keeps a key handler, so nothing freezes.',
    try: `${C} --fixture waiting, then m, e, ↓, ⏎, type abc, esc, esc`,
  },
  {
    ux: 'UX-095',
    kind: 'cli',
    how: 'The frame is exactly rows − 1 tall (Ink 5 clears the screen at rows or more), the clock changes once a minute, and identical frames write nothing: measured 0 clears and 0 idle bytes on a pty at 80×24. 60×20 drops the session name, collapses presence and truncates names with …',
    try: `${C} --fixture voting-partial in an 80×24, then a 60×20 terminal (resize it)`,
  },
  {
    ux: 'UX-096',
    kind: 'cli',
    how: 'The footer is one row generated from the registry: ≤5 hints (≤3 under 72 columns) + ? help + q leave, dropped by priority, never wrapped.',
    try: `${C} --fixture revealed-close at 60, 80 and 100 columns`,
  },
  {
    ux: 'UX-097',
    kind: 'cli',
    how: 'One key = one intent on every screen (from the shared registry); while voting a key that starts a card face is a vote first. Skip story has a 5 s Undo; End for everyone needs a two-option confirm that defaults to Cancel.',
    try: `${C} --fixture revealed-close, then s (skip, see the undo bar), u; then m, End for everyone…`,
  },
  {
    ux: 'UX-098',
    kind: 'cli',
    how: 'One mode stack: Esc closes the top layer only and never quits (a second Esc within 400 ms is ignored), q acts only at the base outside voting, confirms pop themselves, and People/Stories lists scroll past 10.',
    try: `${C} --fixture voting-partial, then esc (menu), p (people), ↓ ↓, x on Sam (confirm), esc, esc`,
  },
  {
    ux: 'UX-099',
    kind: 'cli',
    how: 'Presence row under the deck: ● voted · ○ waiting · ◌ reconnecting · ✗ offline · – watching, "you" for yourself, and "3 of 5 voted" on the right (at 60 columns: "3 of 5 · waiting Sam, Bob").',
    try: `${J} --fixture voting-partial, then ctrl+l, 2 (Sam reloads: ◌)`,
  },
  {
    ux: 'UX-101',
    kind: 'cli',
    how: 'The invite (inline when the host is alone, or i) shows the code, the web link, the npx line and a QR; c copies the link, and with no clipboard the toast row prints the link to copy by hand.',
    try: `${C}, ⏎ (keep the name), then c; or i for the invite overlay`,
  },
  {
    ux: 'UX-105',
    kind: 'cli',
    how: 'Settings opened while voting is a box in the stage band: the story line, the status line (progress and the reveal) and the presence row stay visible above and below it.',
    try: `${J} --fixture voting-partial, then 8, esc, e`,
  },
  {
    ux: 'UX-106',
    kind: 'cli',
    how: 'Export results is in the menu only when a revealed story exists; it shows the summary text with c to copy.',
    try: `${C} (no Export in m), then ${C} --fixture revealed-close (m shows Export results)`,
  },

  // ── cross-surface ids the terminal Room also demonstrates ─────────────────
  {
    ux: 'UX-001',
    kind: 'cli',
    how: 'Auto-reveal waits until every counted voter is in and synced: when Sam reloads he shows ◌ and the round stays hidden until he is back.',
    try: `${C} --fixture voting-partial, then ctrl+l, 2 (Sam reloads), ctrl+l, 1 (everyone votes)`,
  },
  {
    ux: 'UX-003',
    kind: 'cli',
    how: 'A second Start while a story is being voted is refused: the toast row says "A story is already being voted on" and the round is untouched.',
    try: `${C} --fixture voting-partial, then ctrl+l, 5`,
  },
  {
    ux: 'UX-005',
    kind: 'cli',
    how: 'Skip story (s or the menu) takes effect with a 5 s Undo in the toast row ("Skipped PROJ-101 · u undo ▰▰▰▰▰"), never on a bare key without a way back.',
    try: `${C} --fixture revealed-close, then s, u`,
  },
  {
    ux: 'UX-008',
    kind: 'cli',
    how: 'Counts and "didn\'t vote" use the people counted for the round: viewers show as "– Eve watching" and are not in "3 of 5 voted".',
    try: `${C} --fixture voting-partial and read the presence row`,
  },
  {
    ux: 'UX-014',
    kind: 'cli',
    how: 'When everyone is in, a short settle window runs ("Everyone\'s in · you can still change your card") before the auto-reveal, and a changed card restarts it.',
    try: `${J} --fixture voting-all-in, then type 8 quickly`,
  },
  {
    ux: 'UX-023',
    kind: 'cli',
    how: 'Typing the face you already voted keeps the vote (a hint says ⌫ clears it); ⌫ is the explicit clear, with an Undo toast.',
    try: `${J} --fixture voting-fresh, then 5, 5, ⌫, u`,
  },
  {
    ux: 'UX-033',
    kind: 'cli',
    how: 'After the reveal the host\'s ⏎ is "accept 8 · Next: PROJ-102": it records the agreed value on the story and starts the next one; Stories (t) lists Done → 8.',
    try: `${C} --fixture revealed-close, then ⏎, then t`,
  },
  {
    ux: 'UX-035',
    kind: 'cli',
    how: 'The reveal is a named histogram in scale order (empty rows kept) with the suggested row marked ▲, low/high labels and a "Low 5 Ana · High 13 Dev" line; ←→ or typing a face picks another value (▸).',
    try: `${C} --fixture revealed-close, then ← and →`,
  },
  {
    ux: 'UX-036',
    kind: 'cli',
    how: 'The status line uses the shared words with a glyph: ≈ Close · range 5–13 · avg 8.4, ⇄ Split · … hear them out, ✓ Agreed; one vote says "1 vote" and never claims agreement.',
    try: `${C} --fixture revealed-split (also revealed-agreed, revealed-one)`,
  },
  {
    ux: 'UX-038',
    kind: 'cli',
    how: 'A re-vote is labelled "2nd vote" on the story line and shows "Re-vote · last time: 3 ×1 · 8 ×3 · 21 ×1" above the deck.',
    try: `${C} --fixture revote`,
  },
  {
    ux: 'UX-077',
    kind: 'cli',
    how: 'The story line is "Story 2 of 6 · PROJ-101 · Login form validation", the same formatter as the web; re-votes add "· 2nd vote" instead of a new number.',
    try: `${C} --fixture voting-partial`,
  },
  {
    ux: 'UX-078',
    kind: 'cli',
    how: 'A hand-off from People (h) reads "Hana made Ana the host"; a dropped host reads "Hana dropped. Ana is host now".',
    try: `${C} --fixture waiting, then p, ↓, h; or ctrl+l, 3`,
  },
  {
    ux: 'UX-081',
    kind: 'cli',
    how: 'Room settings cycles scales by their names (Fibonacci, T-shirt, Team hours…) with the faces beside them; the change applies from the next story.',
    try: `${C} --fixture waiting, then m, e, →, ⏎`,
  },
  {
    ux: 'UX-084',
    kind: 'cli',
    how: 'No single-item host menu: one menu (m, or esc while voting) holds Skip story, Re-vote, Invite, People, Stories, Watch, Export, Settings, Help, Leave and End for everyone.',
    try: `${C} --fixture revealed-close, then m`,
  },
];
