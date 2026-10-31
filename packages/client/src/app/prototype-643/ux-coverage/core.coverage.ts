/** PROTOTYPE (#643). Coverage entries owned by the core area (docs, CI, cross-cutting). */
import type { CoverageEntry } from './coverage';

export const CORE_COVERAGE: CoverageEntry[] = [
  {
    ux: 'UX-107',
    kind: 'note',
    how: 'Not visual. With #643, docs/ux.md, project.md and ADR-0043 are rewritten in the same PRs as the Room (rule R-53): Lobby/Estimating become "Room (waiting / voting / revealed)", "Agenda" becomes "Stories", "Abstain" becomes "Pass". The words this prototype uses are the target vocabulary.',
    scene: 'host-close',
  },
  {
    ux: 'UX-108',
    kind: 'note',
    how: 'Not visual. The frames this prototype renders (Phone SE 320, Phone 390, Tablet, Desktop, Wide; light and dark) are the baselines the plan adds for iOS, touch and light. A Room on one route has no mid-transition frames to capture.',
    scene: 'small-phone-close',
    try: 'Switch Device and Theme in the lab panel: each combination is one baseline.',
  },
  {
    ux: 'UX-109',
    kind: 'note',
    how: 'Not visual. docs/cli.md is regenerated from the interaction registry (prototype-643/interaction.ts, shared by web and CLI), so the documented keys cannot drift from the real ones; the stale local CLI dist is a build hygiene fix.',
    try: 'Compare the web "?" keys sheet with the CLI "?" overlay: both come from the same registry.',
  },
];
