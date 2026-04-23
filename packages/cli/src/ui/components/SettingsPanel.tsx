import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import {
  buildAvailableScales,
  formatScaleId,
  type Scale,
  type PresetOverrides,
  type CustomScale,
} from '@hnch/shared'
import { TextInput } from './TextInput.js'

interface SettingsPanelProps {
  currentName: string | undefined
  currentScale: Scale
  presetOverrides?: PresetOverrides
  customScales?: CustomScale[]
  onChangeName: (name: string | undefined) => void
  onChangeScale: (scale: Scale) => void
  onClose: () => void
}

type PanelState = 'idle' | 'editing-name' | 'picking-scale'

const MENU_ITEMS = ['Room name', 'Scale'] as const

export function SettingsPanel({
  currentName,
  currentScale,
  presetOverrides,
  customScales,
  onChangeName,
  onChangeScale,
  onClose,
}: SettingsPanelProps): React.ReactElement {
  const scales = buildAvailableScales(presetOverrides, customScales)
  const [state, setState] = useState<PanelState>('idle')
  const [menuCursor, setMenuCursor] = useState(0)
  const [scaleCursor, setScaleCursor] = useState(
    Math.max(0, scales.findIndex((s) => s.id === currentScale.id)),
  )
  const [nameInput, setNameInput] = useState(currentName ?? '')

  useInput(
    (_input, key) => {
      if (state === 'idle') {
        if (key.upArrow) {
          setMenuCursor((c) => Math.max(0, c - 1))
        } else if (key.downArrow) {
          setMenuCursor((c) => Math.min(MENU_ITEMS.length - 1, c + 1))
        } else if (key.return) {
          if (menuCursor === 0) {
            setNameInput(currentName ?? '')
            setState('editing-name')
          } else {
            setScaleCursor(Math.max(0, scales.findIndex((s) => s.id === currentScale.id)))
            setState('picking-scale')
          }
        } else if (key.escape) {
          onClose()
        }
      } else if (state === 'picking-scale') {
        if (key.upArrow) {
          setScaleCursor((c) => Math.max(0, c - 1))
        } else if (key.downArrow) {
          setScaleCursor((c) => Math.min(scales.length - 1, c + 1))
        } else if (key.return) {
          const chosen = scales[scaleCursor]
          if (chosen) onChangeScale(chosen)
          setState('idle')
        } else if (key.escape) {
          setState('idle')
        }
      }
      // editing-name input is handled by TextInput
    },
    { isActive: state !== 'editing-name' },
  )

  function handleNameSubmit(val: string) {
    onChangeName(val.trim() === '' ? undefined : val.trim())
    setState('idle')
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>── Settings ──</Text>

      {state === 'idle' && (
        <Box flexDirection="column">
          {MENU_ITEMS.map((item, i) => {
            const isCursor = i === menuCursor
            const valueLabel =
              i === 0
                ? (currentName ?? '(none)')
                : formatScaleId(currentScale.id)
            return (
              <Box key={item} gap={1}>
                <Text color={isCursor ? 'cyan' : undefined}>
                  {isCursor ? '>' : ' '}
                </Text>
                <Text bold={isCursor}>{item.padEnd(12)}</Text>
                <Text dimColor>[{valueLabel}]</Text>
              </Box>
            )
          })}
          <Text dimColor>↑↓ select  ⏎ edit  esc close</Text>
        </Box>
      )}

      {state === 'editing-name' && (
        <Box flexDirection="column" gap={1}>
          <Text>Room name: </Text>
          <TextInput
            value={nameInput}
            onChange={setNameInput}
            onSubmit={handleNameSubmit}
            onCancel={() => setState('idle')}
            placeholder="(leave empty to remove)"
            isActive
          />
          <Text dimColor>⏎ confirm  esc cancel</Text>
        </Box>
      )}

      {state === 'picking-scale' && (
        <Box flexDirection="column">
          {scales.map((s, i) => {
            const isCursor = i === scaleCursor
            const isCurrent = s.id === currentScale.id
            return (
              <Box key={s.id} gap={1}>
                <Text color={isCursor ? 'cyan' : undefined}>
                  {isCursor ? '>' : ' '}
                </Text>
                <Text bold={isCurrent}>{formatScaleId(s.id)}</Text>
                {isCurrent && <Text dimColor>(current)</Text>}
              </Box>
            )
          })}
          <Text dimColor>↑↓ select  ⏎ confirm  esc cancel</Text>
        </Box>
      )}
    </Box>
  )
}
