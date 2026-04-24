import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import type { SessionHandle } from '../session.js'
import type { SyncStatus } from '../sync.js'
import type { DocProjection, Round, Scale, PresetOverrides, CustomScale } from '@hnch/shared'
import { currentRound } from '@hnch/shared'
import { StatusBar } from './components/StatusBar.js'
import { Lobby } from './Lobby.js'
import { Voting } from './Voting.js'

interface Props {
  session: SessionHandle
  participantId: string
  displayName: string
  accessMode: 'open' | 'password' | 'invite'
  presetOverrides?: PresetOverrides
  customScales?: CustomScale[]
}

type Screen = 'lobby' | 'voting'

function deriveScreen(projection: DocProjection): Screen {
  const round = currentRound(projection)
  if (!round) return 'lobby'
  if (round.revealedAt !== undefined) return 'lobby'
  return 'voting'
}

export function App({ session, participantId, displayName, accessMode: initialAccessMode, presetOverrides, customScales }: Props): React.ReactElement {
  const { exit } = useApp()
  const [projection, setProjection] = useState<DocProjection>(session.projection())
  const [status, setStatus] = useState<SyncStatus>('connecting')
  const [onlineIds, setOnlineIds] = useState<Set<string>>(session.onlineIds())
  const [elapsedMs, setElapsedMs] = useState<number | undefined>(undefined)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [accessMode, setAccessMode] = useState<'open' | 'password'>(
    initialAccessMode === 'password' ? 'password' : 'open',
  )
  const [displayNameLocal, setDisplayNameLocal] = useState(displayName)
  const [confirmingQuit, setConfirmingQuit] = useState(false)
  const [hostNotification, setHostNotification] = useState<string | null>(null)
  const hostNotificationTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const unsub1 = session.onChange(() => {
      setProjection(session.projection())
      setOnlineIds(session.onlineIds())
    })
    const unsub2 = session.onStatusChange(setStatus)
    const unsub3 = session.onHostChange((newHostId) => {
      // Clear previous timeout if any
      if (hostNotificationTimeoutRef.current) {
        clearTimeout(hostNotificationTimeoutRef.current)
      }

      const proj = session.projection()
      const newHost = proj.participants.find((p) => p.id === newHostId)
      const message = newHostId === participantId
        ? 'You are now the host'
        : `${newHost?.displayName || 'Unknown'} is now the host`

      setHostNotification(message)

      // Auto-clear after 3s
      hostNotificationTimeoutRef.current = setTimeout(() => {
        setHostNotification(null)
        hostNotificationTimeoutRef.current = null
      }, 3000)
    })

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
      unsub3()
      clearInterval(awarenessInterval)
      if (hostNotificationTimeoutRef.current) {
        clearTimeout(hostNotificationTimeoutRef.current)
      }
    }
  }, [session, participantId])

  // Global quit handler — inactive when settings panel is open
  useInput(
    (input) => {
      if (input === 'q' || input === 'Q') {
        setConfirmingQuit(true)
      }
    },
    { isActive: !settingsOpen && !confirmingQuit },
  )

  // Confirm quit handler — active only during confirmation
  useInput(
    (input, key) => {
      if (input === 'y' || input === 'Y') {
        session.disconnect()
        exit()
      } else if (input === 'n' || input === 'N' || key.escape) {
        setConfirmingQuit(false)
      }
    },
    { isActive: confirmingQuit },
  )

  const screen = deriveScreen(projection)

  // Reset settings panel if screen leaves lobby (e.g. another client starts a round)
  useEffect(() => {
    if (screen !== 'lobby') setSettingsOpen(false)
  }, [screen])
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

  const handleChangeName = useCallback((name: string | undefined) => {
    session.updateName(name)
  }, [session])

  const handleChangeScale = useCallback((scale: Scale) => {
    session.updateScale(scale)
  }, [session])

  const handleChangeDisplayName = useCallback((name: string) => {
    session.updateDisplayName(name)
    setDisplayNameLocal(name)
  }, [session])

  const handleChangeAccess = useCallback(async (mode: 'open' | 'password', password?: string) => {
    await session.updateAccess(mode, password)
    setAccessMode(mode)
  }, [session])

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

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

      {hostNotification && (
        <Box paddingX={1}>
          <Text color="yellow">{hostNotification}</Text>
        </Box>
      )}

      {screen === 'lobby' && (
        <Lobby
          projection={projection}
          onlineIds={onlineIds}
          isHost={isHost}
          participantId={participantId}
          rounds={projection.rounds}
          currentRound={latestRevealedRound}
          settingsOpen={settingsOpen}
          presetOverrides={presetOverrides}
          customScales={customScales}
          displayName={displayNameLocal}
          accessMode={accessMode}
          onStartRound={handleStartRound}
          onNewRound={handleNewRound}
          onRevote={handleRevote}
          onOpenSettings={handleOpenSettings}
          onCloseSettings={handleCloseSettings}
          onChangeName={handleChangeName}
          onChangeScale={handleChangeScale}
          onChangeDisplayName={handleChangeDisplayName}
          onChangeAccess={handleChangeAccess}
          confirmingQuit={confirmingQuit}
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
          confirmingQuit={confirmingQuit}
        />
      )}

      {confirmingQuit && (
        <Box>
          <Text dimColor>Leave session? y/n</Text>
        </Box>
      )}
    </Box>
  )
}
