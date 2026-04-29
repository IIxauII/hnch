import { formatRoomCode } from '@hnch/shared'

const PACKAGE_NAME = '@xauyxau/hnch'

export function shareCode(code: string): string {
  return formatRoomCode(code)
}

export function shareUrl(code: string): string {
  const origin = process.env['HNCH_SHARE_ORIGIN'] ?? 'https://hnch.dev'
  return `${origin}/join?code=${code}`
}

export function shareNpxCommand(code: string): string {
  return `npx ${PACKAGE_NAME} join ${code}`
}
