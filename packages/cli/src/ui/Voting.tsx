import React from 'react'
import { Box, Text, useInput } from 'ink'
import { ParticipantList } from './components/ParticipantList.js'
import { CardPicker } from './components/CardPicker.js'
import type { DocProjection, Round } from '@hnch/shared'

interface Props {
  projection: DocProjection
  round: Round
  onlineIds: Set<string>
  isHost: boolean
  myId: string
  elapsedMs?: number
  onVote: (card: string) => void
  onClearVote: () => void
  onReveal: () => void
  confirmingQuit: boolean
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000)
  const min = Math.floor(secs / 60)
  const sec = secs % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export function Voting({
  projection,
  round,
  onlineIds,
  isHost,
  myId,
  elapsedMs,
  onVote,
  onClearVote,
  onReveal,
  confirmingQuit,
}: Props): React.ReactElement {
  useInput(
    (input) => {
      if (isHost && (input === 'r' || input === 'R')) {
        onReveal()
      }
    },
    { isActive: !confirmingQuit },
  )

  const myVote = round.votes[myId]
  const roundNum = projection.rounds.indexOf(round) + 1
  const title = round.title ? ` — ${round.title}` : ''

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={2}>
        <Text bold>Round {roundNum}{title}</Text>
        {elapsedMs !== undefined && (
          <Text dimColor>⏱ {formatElapsed(elapsedMs)}</Text>
        )}
      </Box>

      <Box gap={4}>
        <ParticipantList
          participants={projection.participants}
          onlineIds={onlineIds}
          hostId={projection.settings.hostParticipantId}
          votes={round.votes}
          revealed={false}
        />

        <CardPicker
          scale={round.scale}
          selected={myVote}
          onSelect={onVote}
          onClear={onClearVote}
          disabled={confirmingQuit}
        />
      </Box>

      <Box gap={2}>
        {isHost && <Text color="yellow">[r] Reveal</Text>}
        <Text>[q] Quit</Text>
      </Box>
    </Box>
  )
}
