import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { formatScaleId, BUILTIN_SCALES, type Scale, type PresetOverrides } from '@hnch/shared'
import { PresetEditor } from './PresetEditor.js'

interface ScalePickerProps {
  scales: Scale[]
  selectedScaleId: string
  presetOverrides?: PresetOverrides
  onSelect: (scaleId: string) => void
  onOverrideChange: (scaleId: string, disabledIndices: number[]) => void
  onClose: () => void
  showNoneOption?: boolean
}

export function ScalePicker({
  scales,
  selectedScaleId,
  presetOverrides,
  onSelect,
  onOverrideChange,
  onClose,
  showNoneOption = false,
}: ScalePickerProps): React.ReactElement {
  const [cursor, setCursor] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useInput(
    (input, key) => {
      if (key.escape) {
        onClose()
        return
      }
      if (scales.length === 0) return

      if (key.upArrow) {
        setCursor((c) => (c - 1 + scales.length) % scales.length)
      } else if (key.downArrow) {
        setCursor((c) => (c + 1) % scales.length)
      } else if (key.return) {
        const scale = scales[cursor]
        if (!scale) return

        const isBuiltin = scale.id in BUILTIN_SCALES
        const isExpanded = expandedId === scale.id

        if (isBuiltin && !isExpanded) {
          // Expand builtin for preset editing
          setExpandedId(scale.id)
        } else if (isExpanded) {
          // If already expanded, confirm selection
          onSelect(scale.id)
          setExpandedId(null)
        } else {
          // Custom scale or not expandable — select directly
          onSelect(scale.id)
        }
      }
    },
    { isActive: expandedId === null },
  )

  if (scales.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>(no scales available)</Text>
        <Text dimColor>esc back</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        {scales.map((scale, i) => {
          const isCursor = i === cursor
          const isSelected = scale.id === selectedScaleId
          const isExpanded = expandedId === scale.id
          const isBuiltin = scale.id in BUILTIN_SCALES
          const cardPreview = scale.cards.join(', ')
          const isNoneOption = showNoneOption && scale.id === ''
          const displayName = isNoneOption ? '(none)' : formatScaleId(scale.id)

          return (
            <Box key={scale.id || 'none'} flexDirection="column">
              <Box gap={1}>
                <Text color={isCursor ? 'cyan' : undefined}>
                  {isCursor ? '>' : ' '}
                </Text>
                <Text bold={isCursor}>
                  {displayName}
                </Text>
                {!isNoneOption && (
                  <Text dimColor>
                    {cardPreview}
                  </Text>
                )}
                {isSelected && (
                  <Text color="cyan">
                    [current]
                  </Text>
                )}
              </Box>
              {isExpanded && !isNoneOption && (
                <Box paddingLeft={2}>
                  <PresetEditor
                    scaleId={scale.id}
                    cards={BUILTIN_SCALES[scale.id]?.cards ?? []}
                    disabledIndices={presetOverrides?.[scale.id] ?? []}
                    onOverrideChange={onOverrideChange}
                    onClose={() => setExpandedId(null)}
                  />
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
      <Text dimColor>↑↓ select  ⏎ expand/select  esc back</Text>
    </Box>
  )
}
