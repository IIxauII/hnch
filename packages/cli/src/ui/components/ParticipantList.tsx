import React from 'react'
import { Box, Text } from 'ink'
import type { ParticipantSnapshot } from '@hnch/shared'

interface Props {
  participants: readonly ParticipantSnapshot[]
  onlineIds: Set<string>
  hostId?: string
  votes: Record<string, string>
  revealed: boolean
}

export function ParticipantList({ participants, onlineIds, hostId, votes, revealed }: Props): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>Participants ({participants.length})</Text>
      {participants.map((p) => {
        const online = onlineIds.has(p.id)
        const dot = online ? '●' : '○'
        const dotColor = online ? 'green' : 'gray'
        const isHost = p.id === hostId
        const voted = p.id in votes
        const voteIndicator = revealed
          ? (votes[p.id] ? ` → ${votes[p.id]}` : '')
          : (voted ? ' ✓' : ' ·')

        return (
          <Box key={p.id} gap={1}>
            <Text color={dotColor}>{dot}</Text>
            <Text>{p.displayName}{isHost ? ' (host)' : ''}</Text>
            <Text color={voted ? 'green' : 'gray'}>{voteIndicator}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
