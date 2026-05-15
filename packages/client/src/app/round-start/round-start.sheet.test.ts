// Exercises: round-start.helpers:buildRoundStartTitle, buildRoundStartTicketId

import { describe, expect, it } from 'vitest';
import { buildRoundStartTicketId, buildRoundStartTitle } from './round-start.helpers';

describe('buildRoundStartTitle — empty / whitespace → null', () => {
  it('empty string returns null (descriptor is optional)', () => {
    expect(buildRoundStartTitle('')).toBeNull();
  });

  it('whitespace-only returns null', () => {
    expect(buildRoundStartTitle('   ')).toBeNull();
  });

  it('tab-only returns null', () => {
    expect(buildRoundStartTitle('\t')).toBeNull();
  });
});

describe('buildRoundStartTitle — title trimming', () => {
  it('trims leading and trailing whitespace', () => {
    expect(buildRoundStartTitle('  Login redesign  ')).toBe('Login redesign');
  });

  it('preserves internal whitespace', () => {
    expect(buildRoundStartTitle('Login  flow')).toBe('Login  flow');
  });
});

describe('buildRoundStartTitle — normal submission', () => {
  it('non-empty title is returned trimmed', () => {
    expect(buildRoundStartTitle('Auth refactor')).toBe('Auth refactor');
  });
});

describe('buildRoundStartTicketId — empty / whitespace → null', () => {
  it('empty string returns null (ticketId is optional)', () => {
    expect(buildRoundStartTicketId('')).toBeNull();
  });

  it('whitespace-only returns null', () => {
    expect(buildRoundStartTicketId('   ')).toBeNull();
  });

  it('tab-only returns null', () => {
    expect(buildRoundStartTicketId('\t')).toBeNull();
  });
});

describe('buildRoundStartTicketId — trimming', () => {
  it('trims leading and trailing whitespace', () => {
    expect(buildRoundStartTicketId('  PROJ-1234  ')).toBe('PROJ-1234');
  });

  it('preserves internal characters verbatim (URL form)', () => {
    expect(buildRoundStartTicketId('https://example.com/PROJ-1')).toBe(
      'https://example.com/PROJ-1',
    );
  });
});

describe('buildRoundStartTicketId — normal submission', () => {
  it('non-empty ticket ID is returned trimmed', () => {
    expect(buildRoundStartTicketId('PROJ-42')).toBe('PROJ-42');
  });
});
