import { describe, it, expect } from 'vitest'
import { exportRoundsAsMarkdown } from './round-export.js'

describe('exportRoundsAsMarkdown', () => {
  const baseParticipants = {
    'p1': { displayName: 'Alice' },
    'p2': { displayName: 'Bob' },
  }

  it('includes URL ticketId as markdown link in root round heading', () => {
    const result = exportRoundsAsMarkdown({
      rounds: [
        {
          id: 'r1',
          title: 'Auth Migration',
          ticketId: 'https://github.com/issues/123',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2', p2: '3' },
          revealedAt: 1000,
        },
      ],
      participants: baseParticipants,
    })

    expect(result).toContain(
      '## Round 1 — Auth Migration ([https://github.com/issues/123](<https://github.com/issues/123>))',
    )
  })

  it('includes plain ticketId as backtick-quoted text in root round heading with no title', () => {
    const result = exportRoundsAsMarkdown({
      rounds: [
        {
          id: 'r1',
          ticketId: 'PROJ-123',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2', p2: '3' },
          revealedAt: 1000,
        },
      ],
      participants: baseParticipants,
    })

    expect(result).toContain('## Round 1 (`PROJ-123`)')
  })

  it('omits ticketId from heading when absent', () => {
    const result = exportRoundsAsMarkdown({
      rounds: [
        {
          id: 'r1',
          title: 'Simple round',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2' },
          revealedAt: 1000,
        },
      ],
      participants: baseParticipants,
    })

    expect(result).toContain('## Round 1 — Simple round\n')
    expect(result).not.toContain('(`')
  })

  it('includes URL ticketId in re-vote heading', () => {
    const result = exportRoundsAsMarkdown({
      rounds: [
        {
          id: 'r1',
          title: 'First vote',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2' },
          revealedAt: 1000,
        },
        {
          id: 'r2',
          parentRoundId: 'r1',
          ticketId: 'http://example.com/ticket/456',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '3' },
          revealedAt: 2000,
        },
      ],
      participants: baseParticipants,
    })

    expect(result).toContain(
      '### Re-vote 1 ([http://example.com/ticket/456](<http://example.com/ticket/456>))',
    )
  })

  it('escapes markdown in round titles', () => {
    const result = exportRoundsAsMarkdown({
      rounds: [
        {
          id: 'r1',
          title: 'Task [with] *special* chars',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2' },
          revealedAt: 1000,
        },
      ],
      participants: baseParticipants,
    })

    expect(result).toContain('## Round 1 — Task \\[with\\] \\*special\\* chars')
  })

  it('includes session title in H1', () => {
    const result = exportRoundsAsMarkdown({
      title: 'Sprint 42 Planning',
      rounds: [
        {
          id: 'r1',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2' },
          revealedAt: 1000,
        },
      ],
      participants: baseParticipants,
    })

    expect(result).toMatch(/^# Sprint 42 Planning\n\n/)
  })

  it('handles empty rounds array', () => {
    const result = exportRoundsAsMarkdown({
      title: 'Empty session',
      rounds: [],
      participants: baseParticipants,
    })

    expect(result).toBe('# Empty session\n')
  })

  it('shows voting in progress for unrevealed rounds', () => {
    const result = exportRoundsAsMarkdown({
      rounds: [
        {
          id: 'r1',
          title: 'In progress',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2' },
        },
      ],
      participants: baseParticipants,
    })

    expect(result).toContain('*Voting in progress...*')
  })

  it('handles URL ticketIds with parentheses using angle-bracket autolink form', () => {
    const url = 'https://en.wikipedia.org/wiki/Foo_(bar)'
    const result = exportRoundsAsMarkdown({
      rounds: [
        {
          id: 'r1',
          title: 'Wikipedia task',
          ticketId: url,
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2' },
          revealedAt: 1000,
        },
      ],
      participants: baseParticipants,
    })

    // Should use angle-bracket autolink form to preserve parens.
    expect(result).toContain(`([${url}](<${url}>))`)
  })

  it('handles plain ticketIds with backticks using dynamic fence', () => {
    const ticketId = 'PROJ-`123`'
    const result = exportRoundsAsMarkdown({
      rounds: [
        {
          id: 'r1',
          ticketId,
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2' },
          revealedAt: 1000,
        },
      ],
      participants: baseParticipants,
    })

    // Should use double backticks to fence a single backtick.
    expect(result).toContain('## Round 1 (``PROJ-`123`'+'``)')
  })

  it('inherits ticketId from parent round in revote', () => {
    const result = exportRoundsAsMarkdown({
      rounds: [
        {
          id: 'r1',
          title: 'First vote',
          ticketId: 'https://github.com/issues/789',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2' },
          revealedAt: 1000,
        },
        {
          id: 'r2',
          parentRoundId: 'r1',
          ticketId: 'https://github.com/issues/789',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '3' },
          revealedAt: 2000,
        },
      ],
      participants: baseParticipants,
    })

    expect(result).toContain('## Round 1 — First vote ([https://github.com/issues/789](<https://github.com/issues/789>))')
    expect(result).toContain('### Re-vote 1 ([https://github.com/issues/789](<https://github.com/issues/789>))')
  })

  it('handles root round with ticketId but no title', () => {
    const result = exportRoundsAsMarkdown({
      rounds: [
        {
          id: 'r1',
          ticketId: 'https://jira.example.com/browse/PROJ-456',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '2' },
          revealedAt: 1000,
        },
        {
          id: 'r2',
          parentRoundId: 'r1',
          ticketId: 'https://jira.example.com/browse/PROJ-456',
          scale: { cards: ['1', '2', '3'] },
          votes: { p1: '3' },
          revealedAt: 2000,
        },
      ],
      participants: baseParticipants,
    })

    expect(result).toContain('## Round 1 ([https://jira.example.com/browse/PROJ-456](<https://jira.example.com/browse/PROJ-456>))')
    expect(result).toContain('### Re-vote 1 ([https://jira.example.com/browse/PROJ-456](<https://jira.example.com/browse/PROJ-456>))')
  })
})
