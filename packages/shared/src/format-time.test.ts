import { describe, it, expect } from 'vitest'
import { formatElapsed } from './format-time.js'

describe('formatElapsed', () => {
  it('formats zero milliseconds as "0:00"', () => {
    expect(formatElapsed(0)).toBe('0:00')
  })

  it('clamps negative values to "0:00"', () => {
    expect(formatElapsed(-1)).toBe('0:00')
    expect(formatElapsed(-60_000)).toBe('0:00')
  })

  it('formats exactly 1 second as "0:01"', () => {
    expect(formatElapsed(1_000)).toBe('0:01')
  })

  it('pads seconds below 10 with a leading zero', () => {
    expect(formatElapsed(5_000)).toBe('0:05')
    expect(formatElapsed(9_000)).toBe('0:09')
  })

  it('formats 59 seconds as "0:59"', () => {
    expect(formatElapsed(59_000)).toBe('0:59')
  })

  it('formats exactly 60 seconds as "1:00"', () => {
    expect(formatElapsed(60_000)).toBe('1:00')
  })

  it('formats 90 seconds as "1:30"', () => {
    expect(formatElapsed(90_000)).toBe('1:30')
  })

  it('formats 2 minutes as "2:00"', () => {
    expect(formatElapsed(120_000)).toBe('2:00')
  })

  it('formats 10 minutes as "10:00"', () => {
    expect(formatElapsed(600_000)).toBe('10:00')
  })

  it('formats large durations without capping minutes', () => {
    // 1 hour 1 minute 1 second
    expect(formatElapsed(3_661_000)).toBe('61:01')
  })

  it('floors sub-second values (999 ms → "0:00")', () => {
    expect(formatElapsed(999)).toBe('0:00')
  })

  it('floors mid-second values (1_999 ms → "0:01")', () => {
    expect(formatElapsed(1_999)).toBe('0:01')
  })

  it('formats the round-trip: revealedAt - timerStartedAt delta', () => {
    // Simulate a real-world usage: round started at t=10_000, revealed at t=73_500
    const elapsed = 73_500 - 10_000
    expect(formatElapsed(elapsed)).toBe('1:03')
  })
})
