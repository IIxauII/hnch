import React from 'react'
import { MenuList, type MenuItem } from './MenuList.js'
import { shareCode, shareUrl, shareNpxCommand } from '../../share.js'

interface SharePickerProps {
  roomCode: string
  onPick: (kind: 'code' | 'url' | 'npx') => void
  onClose: () => void
}

export function SharePicker({ roomCode, onPick, onClose }: SharePickerProps): React.ReactElement {
  const items: MenuItem[] = [
    { label: 'Copy code', value: 'code', detail: shareCode(roomCode) },
    { label: 'Copy share link', value: 'url', detail: shareUrl(roomCode) },
    { label: 'Copy npx command', value: 'npx', detail: shareNpxCommand(roomCode) },
  ]

  return (
    <MenuList
      title="Share"
      items={items}
      onSelect={(value) => onPick(value as 'code' | 'url' | 'npx')}
      onClose={onClose}
    />
  )
}
