import type { Participant, Round } from './doc.js'
import { computeRoundStats } from './round-stats.js'
import { formatElapsed } from './format-time.js'

/** Escape pipe characters in Markdown table cell content. */
function escMd(s: string): string {
  return s.replace(/\|/g, '\\|')
}

export interface RoundExportInput {
  readonly rounds: readonly Round[]
  readonly participants: ReadonlyMap<string, Participant> | Record<string, Participant>
}

/** Resolve participants map to a uniform ReadonlyMap. */
function toMap(
  participants: ReadonlyMap<string, Participant> | Record<string, Participant>,
): ReadonlyMap<string, Participant> {
  if (participants instanceof Map) return participants
  return new Map(Object.entries(participants))
}

/**
 * Group rounds by chain root: walk parentRoundId to terminal ancestor.
 * Preserves in-array order within each bucket (ADR-0013).
 */
function groupByChainRoot(rounds: readonly Round[]): Map<string, Round[]> {
  const idToRound = new Map<string, Round>()
  for (const r of rounds) idToRound.set(r.id, r)

  function findRoot(round: Round): Round {
    if (!round.parentRoundId) return round
    const parent = idToRound.get(round.parentRoundId)
    return parent ? findRoot(parent) : round
  }

  const buckets = new Map<string, Round[]>()
  for (const r of rounds) {
    const root = findRoot(r)
    const bucket = buckets.get(root.id)
    if (bucket) {
      bucket.push(r)
    } else {
      buckets.set(root.id, [r])
    }
  }
  return buckets
}

/**
 * Build vote-group table rows sorted by count desc, then scale-card index asc.
 * Matches sort order in vote-results.component.ts:381-384.
 */
function buildVoteTable(round: Round, nameById: ReadonlyMap<string, string>): string {
  const scaleOrder = new Map<string, number>()
  round.scale.cards.forEach((card, i) => scaleOrder.set(card, i))

  const byCard = new Map<string, string[]>()
  for (const [participantId, card] of Object.entries(round.votes)) {
    const name = nameById.get(participantId) ?? participantId
    const bucket = byCard.get(card)
    if (bucket) {
      bucket.push(name)
    } else {
      byCard.set(card, [name])
    }
  }

  const groups = [...byCard.entries()].map(([card, voters]) => ({
    card,
    scaleIndex: scaleOrder.get(card) ?? Number.MAX_SAFE_INTEGER,
    voters: [...voters].sort().map(escMd),
  }))

  groups.sort((a, b) => {
    const byCount = b.voters.length - a.voters.length
    return byCount !== 0 ? byCount : a.scaleIndex - b.scaleIndex
  })

  const rows = groups.map((g) => `| ${escMd(g.card)} | ${g.voters.join(', ')} |`)
  return ['| Vote | Voters |', '|------|--------|', ...rows].join('\n')
}

function buildStatsLine(round: Round): string {
  const stats = computeRoundStats(round.votes, round.scale)
  const elapsed =
    round.timerStartedAt != null && round.revealedAt != null
      ? formatElapsed(round.revealedAt - round.timerStartedAt)
      : null

  const parts: string[] = []

  if (stats?.kind === 'numeric') {
    parts.push(`Avg ${stats.mean.toFixed(1)} · Med ${stats.median}`)
  } else if (stats?.kind === 'categorical') {
    parts.push(`Most common: ${stats.mode}`)
  }

  if (elapsed != null) {
    parts.push(`Elapsed ${elapsed}`)
  }

  return parts.join(' · ')
}

/**
 * Render revealed rounds as a Markdown summary.
 * Returns '' when no rounds have been revealed.
 *
 * Chain grouping follows ADR-0013 (flat list + parentRoundId lineage).
 * Participant names read from raw map without leftAt filter per ADR-0036.
 */
export function roundsToMarkdown(input: RoundExportInput): string {
  const { rounds } = input
  // Read raw participants (no leftAt filter) so departed names still resolve — ADR-0036
  const participantsMap = toMap(input.participants)
  const nameById = new Map<string, string>()
  for (const [id, p] of participantsMap) {
    nameById.set(id, p.displayName)
  }

  const revealedRounds = rounds.filter((r) => r.revealedAt != null)
  if (revealedRounds.length === 0) return ''

  // Only group revealed rounds; index into original full rounds array for numbering
  const roundIndex = new Map<string, number>()
  rounds.forEach((r, i) => roundIndex.set(r.id, i + 1)) // 1-based

  // Group by chain root (ADR-0013), preserving original array order within buckets
  const buckets = groupByChainRoot(revealedRounds)

  // Determine chain-root order: order roots by their position in original array
  const seenRoots = new Set<string>()
  const rootOrder: string[] = []
  for (const r of revealedRounds) {
    // Walk to root in buckets keys
    for (const [rootId, members] of buckets) {
      if (members.includes(r) && !seenRoots.has(rootId)) {
        seenRoots.add(rootId)
        rootOrder.push(rootId)
        break
      }
    }
  }

  const sections: string[] = []

  for (const rootId of rootOrder) {
    const chain = buckets.get(rootId)!
    const root = chain.find(r => r.id === rootId)!
    const revotes = chain.filter(r => r.id !== rootId)
    const rootNum = roundIndex.get(root.id) ?? 0

    const rootHeading = root.title
      ? `## Round ${rootNum} — ${root.title}`
      : `## Round ${rootNum}`

    const rootTable = buildVoteTable(root, nameById)
    const rootStats = buildStatsLine(root)

    const rootBlock = rootStats
      ? `${rootHeading}\n\n${rootTable}\n\n${rootStats}`
      : `${rootHeading}\n\n${rootTable}`

    sections.push(rootBlock)

    // Subsequent re-votes in the chain — render as ### Re-vote (ADR-0013)
    for (const revote of revotes) {
      const revoteNum = roundIndex.get(revote.id) ?? 0
      const revoteHeading = `### Re-vote ${revoteNum}`
      const revoteTable = buildVoteTable(revote, nameById)
      const revoteStats = buildStatsLine(revote)

      const revoteBlock = revoteStats
        ? `${revoteHeading}\n\n${revoteTable}\n\n${revoteStats}`
        : `${revoteHeading}\n\n${revoteTable}`

      sections.push(revoteBlock)
    }
  }

  return sections.join('\n\n') + '\n'
}
