import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { formatScaleId, BUILTIN_SCALES, type Scale, type PresetOverrides, type CustomScale } from '@hnch/shared'
import { PresetEditor } from './PresetEditor.js'
import { CustomScaleEditor } from './CustomScaleEditor.js'

interface ScalePickerProps {
  scales: Scale[]
  selectedScaleId: string
  presetOverrides?: PresetOverrides
  customScales?: CustomScale[]
  onSelect: (scaleId: string) => void
  onOverrideChange: (scaleId: string, disabledIndices: number[]) => void
  onCustomScaleCreate?: (name: string, cards: string[]) => void
  onCustomScaleEdit?: (id: string, name: string, cards: string[]) => void
  onCustomScaleDelete?: (id: string) => void
  onClose: () => void
  showNoneOption?: boolean
}

type PickerState = 'browsing' | 'creating' | 'editing' | 'confirming-delete'

export function ScalePicker({
  scales,
  selectedScaleId,
  presetOverrides,
  customScales = [],
  onSelect,
  onOverrideChange,
  onCustomScaleCreate,
  onCustomScaleEdit,
  onCustomScaleDelete,
  onClose,
  showNoneOption = false,
}: ScalePickerProps): React.ReactElement {
  const [cursor, setCursor] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [state, setState] = useState<PickerState>('browsing')
  const [editingScaleId, setEditingScaleId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const displayScales = onCustomScaleCreate
    ? [...scales, { id: '__create-custom__', cards: [] }]
    : scales
  const totalScales = displayScales.length

  useInput(
    (input, key) => {
      if (state === 'browsing') {
        if (key.escape) {
          onClose()
          return
        }
        if (totalScales === 0) return

        if (key.upArrow) {
          setCursor((c) => (c - 1 + totalScales) % totalScales)
        } else if (key.downArrow) {
          setCursor((c) => (c + 1) % totalScales)
        } else if (key.return) {
          const scale = displayScales[cursor]
          if (!scale) return

          if (scale.id === '__create-custom__') {
            setState('creating')
            return
          }

          const isBuiltin = scale.id in BUILTIN_SCALES
          const isExpanded = expandedId === scale.id

          if (isBuiltin && !isExpanded) {
            setExpandedId(scale.id)
          } else if (isExpanded) {
            onSelect(scale.id)
            setExpandedId(null)
          } else {
            onSelect(scale.id)
          }
        } else if (input === 'e' || input === 'E') {
          const scale = displayScales[cursor]
          if (onCustomScaleEdit && scale?.id.startsWith('custom-')) {
            setEditingScaleId(scale.id)
            setState('editing')
          }
        } else if (input === 'd' || input === 'D') {
          const scale = displayScales[cursor]
          if (onCustomScaleDelete && scale?.id.startsWith('custom-')) {
            setDeleteConfirmId(scale.id)
            setState('confirming-delete')
          }
        }
      } else if (state === 'confirming-delete') {
        if (input === 'y' || input === 'Y') {
          if (deleteConfirmId && onCustomScaleDelete) {
            onCustomScaleDelete(deleteConfirmId)
          }
          setDeleteConfirmId(null)
          setState('browsing')
        } else if (input === 'n' || input === 'N' || key.escape) {
          setDeleteConfirmId(null)
          setState('browsing')
        }
      }
    },
    { isActive: state === 'browsing' || state === 'confirming-delete' },
  )

  if (state === 'creating') {
    return (
      <CustomScaleEditor
        onSave={(name, cards) => {
          if (onCustomScaleCreate) {
            onCustomScaleCreate(name, cards)
          }
          setState('browsing')
        }}
        onCancel={() => setState('browsing')}
      />
    )
  }

  if (state === 'editing' && editingScaleId) {
    const customScale = customScales?.find((cs) => cs.id === editingScaleId)
    const scale = scales.find((s) => s.id === editingScaleId)
    if (scale && customScale) {
      return (
        <CustomScaleEditor
          initialName={customScale.label}
          initialCards={customScale.cards}
          onSave={(name, cards) => {
            if (onCustomScaleEdit) {
              onCustomScaleEdit(editingScaleId, name, cards)
            }
            setEditingScaleId(null)
            setState('browsing')
          }}
          onCancel={() => {
            setEditingScaleId(null)
            setState('browsing')
          }}
        />
      )
    }
  }

  if (state === 'confirming-delete' && deleteConfirmId) {
    const scale = displayScales.find((s) => s.id === deleteConfirmId)
    const scaleName = scale ? formatScaleId(scale.id) : 'Unknown'
    return (
      <Box flexDirection="column" gap={1}>
        <Text>Delete {scaleName}? </Text>
        <Text>[y] yes  [n] no  esc cancel</Text>
      </Box>
    )
  }

  if (displayScales.length === 0) {
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
        {displayScales.map((scale, i) => {
          const isCursor = i === cursor
          const isSelected = scale.id === selectedScaleId
          const isExpanded = expandedId === scale.id
          const isBuiltin = scale.id in BUILTIN_SCALES
          const isCustom = scale.id.startsWith('custom-')
          const isCreateAction = scale.id === '__create-custom__'
          const cardPreview = scale.cards.join(', ')
          const isNoneOption = showNoneOption && scale.id === ''
          let displayName = isNoneOption ? '(none)' : isCreateAction ? '[+ Create custom scale]' : formatScaleId(scale.id)

          return (
            <Box key={scale.id || 'none'} flexDirection="column">
              <Box gap={1}>
                <Text color={isCursor ? 'cyan' : undefined}>
                  {isCursor ? '>' : ' '}
                </Text>
                <Text bold={isCursor}>
                  {displayName}
                </Text>
                {!isNoneOption && !isCreateAction && (
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
              {isExpanded && !isNoneOption && !isCreateAction && (
                <Box paddingLeft={2}>
                  {isBuiltin ? (
                    <PresetEditor
                      scaleId={scale.id}
                      cards={BUILTIN_SCALES[scale.id]?.cards ?? []}
                      disabledIndices={presetOverrides?.[scale.id] ?? []}
                      onOverrideChange={onOverrideChange}
                      onClose={() => setExpandedId(null)}
                    />
                  ) : null}
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
      <Text dimColor>
        {cursor < displayScales.length && displayScales[cursor]?.id.startsWith('custom-')
          ? `↑↓ select  ⏎ expand${onCustomScaleEdit ? '  [e] edit' : ''}${onCustomScaleDelete ? '  [d] delete' : ''}  esc back`
          : '↑↓ select  ⏎ expand/select  esc back'}
      </Text>
    </Box>
  )
}
