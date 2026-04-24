import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'

interface PresetEditorProps {
  scaleId: string
  cards: string[]
  disabledIndices: number[]
  onOverrideChange: (scaleId: string, disabledIndices: number[]) => void
  onClose: () => void
}

export function PresetEditor({
  scaleId,
  cards,
  disabledIndices,
  onOverrideChange,
  onClose,
}: PresetEditorProps): React.ReactElement {
  const disabled = useMemo(() => new Set(disabledIndices), [disabledIndices])
  const [cursor, setCursor] = useState(0)

  const toggleCard = (index: number) => {
    const newDisabled = new Set(disabled)
    if (newDisabled.has(index)) {
      newDisabled.delete(index)
    } else {
      // Guard: at least 1 card must stay enabled
      if (newDisabled.size >= cards.length - 1) {
        return // Can't disable the last card
      }
      newDisabled.add(index)
    }

    const result = Array.from(newDisabled).sort((a, b) => a - b)
    onOverrideChange(scaleId, result)
  }

  useInput((input, key) => {
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1))
    } else if (key.rightArrow) {
      setCursor((c) => Math.min(cards.length - 1, c + 1))
    } else if (input === ' ') {
      toggleCard(cursor)
    } else if (key.return || key.escape) {
      onClose()
    }
  })

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        {cards.map((card, i) => {
          const isCursor = i === cursor
          const isDisabled = disabled.has(i)
          return (
            <Text
              key={card}
              inverse={isCursor}
              bold={!isDisabled}
              color={isDisabled ? undefined : 'cyan'}
              strikethrough={isDisabled}
              dimColor={isDisabled}
            >
              {card}
            </Text>
          )
        })}
      </Box>
      <Text dimColor>  ←→ navigate  space toggle  ⏎/esc done</Text>
    </Box>
  )
}
