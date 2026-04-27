import { normalizeRoomCode } from '@hnch/shared'

export function normalizeAndValidateRoomCode(raw: string): string | null {
  const code = normalizeRoomCode(raw)
  return code === '' ? null : code
}
