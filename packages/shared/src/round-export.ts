import { isLikelyUrl } from './is-likely-url.js'

export interface RoundExportOptions {
  title?: string
  rounds: Array<{
    id: string
    title?: string
    ticketId?: string
    scale: { cards: string[] }
    votes: Record<string, string>
    revealedAt?: number
    parentRoundId?: string
  }>
  participants: Record<string, { displayName: string }>
}

/**
 * Escape markdown special characters.
 */
function escMd(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&')
}

/**
 * Escape text used in markdown link label: `]` (closes link) and `\` (escape char).
 */
function escMdLinkText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/]/g, '\\]')
}

/**
 * Pick a backtick fence longer than any backtick run in `s`.
 * Ensures inline code blocks can safely contain the string.
 */
function fenceFor(s: string): string {
  const matches = s.match(/`+/g) ?? []
  const maxRun = matches.reduce((m, r) => Math.max(m, r.length), 0)
  return '`'.repeat(maxRun + 1)
}

/**
 * Format ticketId for markdown output.
 * URL ticketIds become angle-bracket autolinks (permits parens in URL).
 * Plain IDs become backtick-quoted with dynamic fence to escape any backticks in content.
 */
function formatTicket(ticketId: string | undefined): string {
  if (!ticketId) return ''
  if (isLikelyUrl(ticketId)) {
    // Angle-bracket autolink form [label](<url>) permits parens in URL.
    return ` ([${escMdLinkText(ticketId)}](<${ticketId}>))`
  }
  // Plain ID: use dynamic backtick fence to escape any backticks in the ID.
  const fence = fenceFor(ticketId)
  return ` (${fence}${ticketId}${fence})`
}

/**
 * Export rounds as markdown.
 */
export function exportRoundsAsMarkdown(opts: RoundExportOptions): string {
  const { title, rounds, participants } = opts
  const lines: string[] = []

  if (title) {
    lines.push(`# ${escMd(title)}`)
    lines.push('')
  }

  // Group rounds by parentRoundId to identify root rounds vs revotes
  const rootRounds = rounds.filter((r) => !r.parentRoundId)
  const revotesByParent = new Map<string, typeof rounds>()

  for (const round of rounds) {
    if (round.parentRoundId) {
      if (!revotesByParent.has(round.parentRoundId)) {
        revotesByParent.set(round.parentRoundId, [])
      }
      revotesByParent.get(round.parentRoundId)!.push(round)
    }
  }

  rootRounds.forEach((root, rootIndex) => {
    const rootNum = rootIndex + 1
    const rootHeading = root.title
      ? `## Round ${rootNum} — ${escMd(root.title)}${formatTicket(root.ticketId)}`
      : `## Round ${rootNum}${formatTicket(root.ticketId)}`

    lines.push(rootHeading)
    lines.push('')

    if (root.revealedAt) {
      lines.push(buildVotesSection(root, participants))
      lines.push('')
    } else {
      lines.push('*Voting in progress...*')
      lines.push('')
    }

    const revotes = revotesByParent.get(root.id) || []
    revotes.forEach((revote, revoteIndex) => {
      const revoteNum = revoteIndex + 1
      const revoteHeading = `### Re-vote ${revoteNum}${formatTicket(revote.ticketId)}`

      lines.push(revoteHeading)
      lines.push('')

      if (revote.revealedAt) {
        lines.push(buildVotesSection(revote, participants))
        lines.push('')
      } else {
        lines.push('*Voting in progress...*')
        lines.push('')
      }
    })
  })

  return lines.join('\n').trimEnd() + '\n'
}

/**
 * Build the votes section for a round.
 */
function buildVotesSection(
  round: {
    scale: { cards: string[] }
    votes: Record<string, string>
  },
  participants: Record<string, { displayName: string }>,
): string {
  const votes = Object.entries(round.votes)
  const voteGroups = new Map<string, string[]>()

  for (const [participantId, vote] of votes) {
    const displayName = participants[participantId]?.displayName || participantId
    if (!voteGroups.has(vote)) {
      voteGroups.set(vote, [])
    }
    voteGroups.get(vote)!.push(displayName)
  }

  const lines: string[] = []
  for (const card of round.scale.cards) {
    const voters = voteGroups.get(card) || []
    if (voters.length > 0) {
      lines.push(`- **${card}**: ${voters.join(', ')}`)
    }
  }

  return lines.join('\n')
}
