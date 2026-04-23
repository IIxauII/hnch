import React from 'react'
import { Text, useInput } from 'ink'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  onCancel?: () => void
  placeholder?: string
  isActive?: boolean
}

export function TextInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  isActive = true,
}: TextInputProps): React.ReactElement {
  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel?.()
      } else if (key.return) {
        onSubmit(value)
      } else if (key.backspace || key.delete) {
        onChange(value.slice(0, -1))
      } else if (input && !key.ctrl && !key.meta) {
        onChange(value + input)
      }
    },
    { isActive },
  )

  const display = value.length > 0 ? value : (placeholder ?? '')
  const isPlaceholder = value.length === 0 && placeholder !== undefined

  return (
    <Text>
      <Text dimColor={isPlaceholder}>{display}</Text>
      <Text inverse> </Text>
    </Text>
  )
}
