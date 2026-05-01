export interface HostChangeMessageInput {
  /** Previous host's resolved display name. `null` means initial assignment (no prior host). */
  prevName: string | null
  /** New host's resolved display name. */
  newName: string
  /** Whether the new host is the local participant. */
  isSelf: boolean
}

export function formatHostChangeMessage(input: HostChangeMessageInput): string {
  const { prevName, newName, isSelf } = input
  const newClause = isSelf ? 'You are now the host' : `${newName} is now the host`
  if (!prevName) return newClause
  return `${prevName} disconnected. ${newClause}.`
}
