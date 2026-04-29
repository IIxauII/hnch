import React from 'react'
import { Box, Text, useInput } from 'ink'
import { ParticipantList } from './components/ParticipantList.js'
import { CardPicker } from './components/CardPicker.js'
import { SharePicker } from './components/SharePicker.js'
import type { DocProjection, Round } from '@hnch/shared'

interface Props {
  projection: DocProjection
  round: Round
  onlineIds: Set<string>
  isHost: boolean
  myId: string
  myRole: 'voter' | 'viewer'
  elapsedMs?: number
  roomCode: string
  shareOpen: boolean
  settingsOpen: boolean
  onVote: (card: string) => void
  onClearVote: () => void
  onReveal: () => void
  onToggleRole: () => void
  onShare: (kind: 'code' | 'url' | 'npx') => void
  onSetShareOpen: (open: boolean) => void
  onOpenSettings: () => void
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
  myRole,
  elapsedMs,
  roomCode,
  shareOpen,
  settingsOpen,
  onVote,
  onClearVote,
  onReveal,
  onToggleRole,
  onShare,
  onSetShareOpen,
  onOpenSettings,
  confirmingQuit,
}: Props): React.ReactElement {
  useInput(
    (input) => {
      if (input === 'e' || input === 'E') {
        onOpenSettings()
        return
      }
      if (input === 'c' || input === 'C') {
        onSetShareOpen(true)
        return
      }
      if (isHost && (input === 'r' || input === 'R')) {
        onReveal()
      }
      if (input === 'w' || input === 'W') {
        onToggleRole()
      }
    },
    { isActive: !confirmingQuit && !settingsOpen && !shareOpen },
  )

  if (shareOpen) {
    return (
      <SharePicker
        roomCode={roomCode}
        onPick={(kind) => {
          onSetShareOpen(false)
          onShare(kind)
        }}
        onClose={() => onSetShareOpen(false)}
      />
    )
  }

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

        {myRole === 'viewer' ? (
          <Box flexDirection="column">
            <Text dimColor>You're observing</Text>
          </Box>
        ) : (
          <CardPicker
            scale={round.scale}
            selected={myVote}
            onSelect={onVote}
            onClear={onClearVote}
            disabled={confirmingQuit}
          />
        )}
      </Box>

      <Box gap={2}>
        {isHost && <Text color="yellow">[r] Reveal</Text>}
        <Text color="yellow">[w] {myRole === 'viewer' ? 'Vote' : 'Observe'}</Text>
        <Text>[e] Settings</Text>
        <Text>[c] Share</Text>
        <Text>[q] Quit</Text>
      </Box>
    </Box>
  )
}
