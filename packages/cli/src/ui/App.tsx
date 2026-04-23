import React, { useState, useEffect, useCallback } from 'react'
import { Box, useApp, useInput } from 'ink'
import type { SessionHandle } from '../session.js'
import type { SyncStatus } from '../sync.js'
import type { DocProjection, Round } from '@hnch/shared'
import { currentRound } from '@hnch/shared'
import { StatusBar } from './components/StatusBar.js'
import { Lobby } from './Lobby.js'
import { Voting } from './Voting.js'

interface Props {
  session: SessionHandle
  participantId: string
}

type Screen = 'lobby' | 'voting'

function deriveScreen(projection: DocProjection): Screen {
  const round = currentRound(projection)
  if (!round) return 'lobby'
  if (round.revealedAt !== undefined) return 'lobby'
  return 'voting'
}

export function App({ session, participantId }: Props): React.ReactElement {
  const { exit } = useApp()
  const [projection, setProjection] = useState<DocProjection>(session.projection())
  const [status, setStatus] = useState<SyncStatus>('connecting')
  const [onlineIds, setOnlineIds] = useState<Set<string>>(session.onlineIds())
  const [elapsedMs, setElapsedMs] = useState<number | undefined>(undefined)

  useEffect(() => {
    const unsub1 = session.onChange(() => {
      setProjection(session.projection())
      setOnlineIds(session.onlineIds())
    })
    const unsub2 = session.onStatusChange(setStatus)

    // Poll awareness for online IDs and update elapsed time each second
    const awarenessInterval = setInterval(() => {
      setOnlineIds(session.onlineIds())
      const proj = session.projection()
      const round = currentRound(proj)
      if (round?.timerStartedAt !== undefined && round.revealedAt === undefined) {
        setElapsedMs(Date.now() - round.timerStartedAt)
      } else {
        setElapsedMs(undefined)
      }
    }, 1000)

    return () => {
      unsub1()
      unsub2()
      clearInterval(awarenessInterval)
    }
  }, [session])

  // Global quit handler
  useInput((input) => {
    if (input === 'q' || input === 'Q') {
      session.disconnect()
      exit()
    }
  })

  const screen = deriveScreen(projection)
  const round = currentRound(projection)
  const isHost = projection.settings.hostParticipantId === participantId

  const handleStartRound = useCallback(() => {
    session.newRound()
  }, [session])

  const handleVote = useCallback((card: string) => {
    session.vote(card)
  }, [session])

  const handleClearVote = useCallback(() => {
    session.unvote()
  }, [session])

  const handleReveal = useCallback(() => {
    session.reveal()
  }, [session])

  const handleNewRound = useCallback(() => {
    session.newRound()
  }, [session])

  const handleRevote = useCallback(() => {
    session.revote()
  }, [session])

  // The latest revealed round for results display in Lobby
  const revealedRounds = projection.rounds.filter((r) => r.revealedAt !== undefined)
  const latestRevealedRound: Round | null =
    revealedRounds.length > 0 ? revealedRounds[revealedRounds.length - 1]! : null

  return (
    <Box flexDirection="column">
      <StatusBar
        roomCode={session.roomCode}
        sessionName={projection.settings.name}
        status={status}
        isHost={isHost}
      />

      {screen === 'lobby' && (
        <Lobby
          projection={projection}
          onlineIds={onlineIds}
          isHost={isHost}
          participantId={participantId}
          rounds={projection.rounds}
          currentRound={latestRevealedRound}
          onStartRound={handleStartRound}
          onNewRound={handleNewRound}
          onRevote={handleRevote}
        />
      )}

      {screen === 'voting' && round && (
        <Voting
          projection={projection}
          round={round}
          onlineIds={onlineIds}
          isHost={isHost}
          myId={participantId}
          elapsedMs={elapsedMs}
          onVote={handleVote}
          onClearVote={handleClearVote}
          onReveal={handleReveal}
        />
      )}
    </Box>
  )
}
