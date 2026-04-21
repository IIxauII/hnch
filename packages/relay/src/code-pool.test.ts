/**
 * Unit tests for the relay code pool. Uses injected generators so the
 * collision-retry path is exercised without relying on hashing luck.
 */

import { describe, expect, it } from 'vitest'
import { createCodePool } from './code-pool.js'

describe('code pool', () => {
  it('mint returns the generated code and marks it active', () => {
    const pool = createCodePool({ generator: () => 'ABC234' })
    expect(pool.mint()).toBe('ABC234')
    expect(pool.activeCount).toBe(1)
  })

  it('mint retries on collision with the active set', () => {
    // Generator yields the same code twice, then a fresh one.
    const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB']
    let i = 0
    const pool = createCodePool({ generator: () => codes[i++]! })

    expect(pool.mint()).toBe('AAAAAA')
    expect(pool.mint()).toBe('BBBBBB')
    expect(pool.activeCount).toBe(2)
  })

  it('mint throws after hitting the retry cap', () => {
    const pool = createCodePool({
      generator: () => 'AAAAAA',
      maxAttempts: 3,
    })
    pool.mint() // succeeds: AAAAAA
    // Next mint will get AAAAAA three times in a row — all collide.
    expect(() => pool.mint()).toThrow(/unable to mint/i)
  })

  it('release removes the code from the active set', () => {
    const pool = createCodePool({ generator: () => 'CCCCCC' })
    const code = pool.mint()
    expect(pool.activeCount).toBe(1)
    pool.release(code)
    expect(pool.activeCount).toBe(0)
  })

  it('release is a no-op for codes not in the pool', () => {
    const pool = createCodePool()
    // Doesn't throw, doesn't affect counters.
    pool.release('NEVERMINTED')
    expect(pool.activeCount).toBe(0)
  })
})
