import React from 'react'
import { Box, Text, useInput } from 'ink'
import { ParticipantList } from './components/ParticipantList.js'
import type { DocProjection, Round } from '@hnch/shared'

interface Props {
  projection: DocProjection
  onlineIds: Set<string>
  isHost: boolean
  participantId: string
  rounds: readonly Round[]
  /** The latest revealed round (null if no rounds revealed yet). */
  currentRound: Round | null
  onStartRound: () => void
  onNewRound: () => void
  onRevote: () => void
}

function computeStats(votes: Record<string, string>): {
  average: string
  median: string
  agreement: string
} {
  const values = Object.values(votes)
    .map((v) => parseFloat(v))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b)

  if (values.length === 0) {
    return { average: '-', median: '-', agreement: '-' }
  }

  const sum = values.reduce((a, b) => a + b, 0)
  const avg = sum / values.length
  const mid = Math.floor(values.length / 2)
  const med =
    values.length % 2 === 0
      ? (values[mid - 1]! + values[mid]!) / 2
      : values[mid]!

  // Agreement = % of voters who picked the most common value
  const allVotes = Object.values(votes)
  const counts = new Map<string, number>()
  for (const v of allVotes) {
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const maxCount = Math.max(...counts.values())
  const agr = allVotes.length > 0 ? Math.round((maxCount / allVotes.length) * 100) : 0

  return {
    average: avg.toFixed(1),
    median: med.toFixed(1),
    agreement: `${agr}%`,
  }
}

function formatElapsed(startMs: number, endMs: number): string {
  const secs = Math.floor((endMs - startMs) / 1000)
  const min = Math.floor(secs / 60)
  const sec = secs % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function compactRoundSummary(round: Round, roundNum: number): string {
  // Build "card×count, ..." tally
  const counts = new Map<string, number>()
  for (const v of Object.values(round.votes)) {
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const tally = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([card, count]) => `${card}×${count}`)
    .join(', ')

  const title = round.title ? ` ${round.title}` : ''
  const elapsed =
    round.timerStartedAt !== undefined && round.revealedAt !== undefined
      ? ` — ${formatElapsed(round.timerStartedAt, round.revealedAt)}`
      : ''

  return `Round ${roundNum}:${title} — ${tally || '(no votes)'}${elapsed}`
}

export function Lobby({
  projection,
  onlineIds,
  isHost,
  participantId,
  rounds,
  currentRound,
  onStartRound,
  onNewRound,
  onRevote,
}: Props): React.ReactElement {
  useInput((input) => {
    if (isHost) {
      if (input === 's' || input === 'S') onStartRound()
      if (currentRound?.revealedAt !== undefined) {
        if (input === 'n' || input === 'N') onNewRound()
        if (input === 'v' || input === 'V') onRevote()
      }
    }
  })

  const hasRounds = rounds.length > 0
  const revealedRounds = rounds.filter((r) => r.revealedAt !== undefined)

  // Past rounds = all revealed rounds except the latest (shown in full)
  const pastRounds = currentRound !== null ? revealedRounds.slice(0, -1) : revealedRounds

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{hasRounds ? 'Session' : 'Waiting for participants...'}</Text>
      {!hasRounds && <Text dimColor>No rounds started yet.</Text>}

      <ParticipantList
        participants={projection.participants}
        onlineIds={onlineIds}
        hostId={projection.settings.hostParticipantId}
        votes={{}}
        revealed={false}
      />

      {currentRound?.revealedAt !== undefined && (
        <ResultsSection
          projection={projection}
          round={currentRound}
          rounds={rounds}
        />
      )}

      {pastRounds.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>── History ──</Text>
          {pastRounds.map((r) => {
            const roundNum = rounds.indexOf(r) + 1
            return (
              <Text key={r.id} dimColor>
                {compactRoundSummary(r, roundNum)}
              </Text>
            )
          })}
        </Box>
      )}

      <Box gap={2}>
        {isHost ? (
          <>
            {currentRound?.revealedAt !== undefined ? (
              <>
                <Text color="yellow">[v] Re-vote</Text>
                <Text color="yellow">[n] Next round</Text>
              </>
            ) : (
              <Text color="yellow">[s] Start round</Text>
            )}
          </>
        ) : (
          <Text dimColor>Waiting for host to start a round...</Text>
        )}
        <Text>[q] Quit</Text>
      </Box>
    </Box>
  )
}

interface ResultsSectionProps {
  projection: DocProjection
  round: Round
  rounds: readonly Round[]
}

function ResultsSection({
  projection,
  round,
  rounds,
}: ResultsSectionProps): React.ReactElement {
  const roundNum = rounds.indexOf(round) + 1
  const title = round.title ? ` — ${round.title}` : ''
  const stats = computeStats(round.votes)
  const nameMap = new Map(projection.participants.map((p) => [p.id, p.displayName]))

  const elapsed =
    round.timerStartedAt !== undefined && round.revealedAt !== undefined
      ? formatElapsed(round.timerStartedAt, round.revealedAt)
      : null

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>
        Round {roundNum}{title} — Results
      </Text>

      <Box flexDirection="column">
        <Box gap={2}>
          <Text bold underline>{'Name'.padEnd(20)}</Text>
          <Text bold underline>{'Estimate'.padEnd(10)}</Text>
        </Box>
        {Object.entries(round.votes).map(([pid, vote]) => (
          <Box key={pid} gap={2}>
            <Text>{(nameMap.get(pid) ?? pid).padEnd(20)}</Text>
            <Text color="cyan" bold>{vote.padEnd(10)}</Text>
          </Box>
        ))}
        {projection.participants
          .filter((p) => !(p.id in round.votes))
          .map((p) => (
            <Box key={p.id} gap={2}>
              <Text dimColor>{p.displayName.padEnd(20)}</Text>
              <Text dimColor>{'(no vote)'.padEnd(10)}</Text>
            </Box>
          ))}
      </Box>

      <Box gap={2}>
        <Text>Avg: <Text bold>{stats.average}</Text></Text>
        <Text>Med: <Text bold>{stats.median}</Text></Text>
        <Text>Agreement: <Text bold>{stats.agreement}</Text></Text>
        {elapsed !== null && <Text dimColor>⏱ {elapsed}</Text>}
      </Box>
    </Box>
  )
}
