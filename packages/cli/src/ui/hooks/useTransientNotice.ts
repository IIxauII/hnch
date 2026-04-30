import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_MS = 3000

export function useTransientNotice(durationMs: number = DEFAULT_MS) {
  const [notice, setNotice] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const show = useCallback((message: string) => {
    clearTimer()
    setNotice(message)
    timerRef.current = setTimeout(() => {
      setNotice(null)
      timerRef.current = null
    }, durationMs)
  }, [clearTimer, durationMs])

  const dismiss = useCallback(() => {
    clearTimer()
    setNotice(null)
  }, [clearTimer])

  useEffect(() => () => { clearTimer() }, [clearTimer])

  return { notice, show, dismiss } as const
}
