import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { Scale } from '@hnch/shared'

interface Props {
  scale: Scale
  selected?: string
  onSelect: (card: string) => void
  onClear: () => void
  disabled?: boolean
}

export function CardPicker({ scale, selected, onSelect, onClear, disabled }: Props): React.ReactElement {
  const [cursor, setCursor] = useState(0)

  useInput((input, key) => {
    if (disabled) return

    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1))
    } else if (key.rightArrow) {
      setCursor((c) => Math.min(scale.cards.length - 1, c + 1))
    } else if (key.return) {
      const card = scale.cards[cursor]!
      if (card === selected) {
        onClear()
      } else {
        onSelect(card)
      }
    } else if (key.backspace || key.delete) {
      onClear()
    }
  })

  return (
    <Box flexDirection="column" gap={0}>
      <Box gap={1}>
        {scale.cards.map((card, i) => {
          const isCursor = i === cursor
          const isSelected = card === selected
          return (
            <Text
              key={card}
              inverse={isCursor}
              bold={isSelected}
              color={isSelected ? 'cyan' : undefined}
            >
              {isSelected ? `[${card}]` : ` ${card} `}
            </Text>
          )
        })}
      </Box>
      <Text dimColor>  ←→ navigate  ⏎ select  ⌫ clear</Text>
    </Box>
  )
}
