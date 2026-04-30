import { describe, it, expect, afterEach } from 'vitest'
import { shareCode, shareUrl, shareNpxCommand } from './share.js'

const CODE = 'ABCDEF'

afterEach(() => {
  delete process.env['HNCH_SHARE_ORIGIN']
})

describe('shareCode', () => {
  it('formats code with dash', () => {
    expect(shareCode(CODE)).toBe('ABC-DEF')
  })

  it('normalises lowercase input', () => {
    expect(shareCode('abcdef')).toBe('ABC-DEF')
  })
})

describe('shareUrl', () => {
  it('uses default origin', () => {
    expect(shareUrl(CODE)).toBe('https://hnch.dev/join?code=ABCDEF')
  })

  it('honours HNCH_SHARE_ORIGIN override', () => {
    process.env['HNCH_SHARE_ORIGIN'] = 'https://example.test'
    expect(shareUrl(CODE)).toBe('https://example.test/join?code=ABCDEF')
  })
})

describe('shareNpxCommand', () => {
  it('produces correct npx command', () => {
    expect(shareNpxCommand(CODE)).toBe('npx @xauyxau/hnch join ABCDEF')
  })
})
