import React from 'react'
import { MenuList, type MenuItem } from './MenuList.js'

const HOST_ACTIONS: MenuItem[] = [
  {
    label: 'End session for everyone',
    value: 'end-session',
    detail: 'Disconnects all participants. Cannot be undone.',
  },
]

interface HostActionsMenuProps {
  onPick: (value: string) => void
  onClose: () => void
}

export function HostActionsMenu({ onPick, onClose }: HostActionsMenuProps): React.ReactElement {
  return (
    <MenuList
      title="Host Actions"
      items={HOST_ACTIONS}
      onSelect={onPick}
      onClose={onClose}
    />
  )
}
