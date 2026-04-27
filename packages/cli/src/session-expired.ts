export async function onSessionExpired(
  deps: {
    clearLastSession: () => Promise<void> | void
    logger: { error: (msg: string) => void }
    exit: (code: number) => never
  },
): Promise<never> {
  let clearOk = true
  try {
    await deps.clearLastSession()
  } catch (err) {
    clearOk = false
    deps.logger.error(
      `Failed to clear cached session: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (clearOk) {
    deps.logger.error('Session expired (room no longer exists). Cached session cleared.')
  } else {
    deps.logger.error(
      'Session expired. Could not delete ~/.config/hnch/last-session.json — please remove it manually.',
    )
  }
  return deps.exit(1)
}
