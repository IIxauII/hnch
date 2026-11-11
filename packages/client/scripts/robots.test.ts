import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// src/robots.txt holds the rules its header comment states. A crawler reads
// only the most specific group that names it, so every group must carry the
// `*` group's Content-Signal and rules.

interface Group {
  agents: string[];
  signals: string[];
  rules: { allow: boolean; path: string }[];
}

/** RFC 9309 groups: consecutive user-agent lines, then their rules. */
function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | undefined;
  let readingAgents = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/u, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!readingAgents) {
        current = { agents: [], signals: [], rules: [] };
        groups.push(current);
      }
      current?.agents.push(value.toLowerCase());
      readingAgents = true;
      continue;
    }
    readingAgents = false;
    if (key === 'content-signal') current?.signals.push(value);
    if (key === 'allow' || key === 'disallow')
      current?.rules.push({ allow: key === 'allow', path: value });
  }
  return groups;
}

const matches = (rulePath: string, path: string) => rulePath !== '' && path.startsWith(rulePath);

/** RFC 9309: the longest matching rule wins, allow on a tie. */
function longestMatchAllows(group: Group, path: string): boolean {
  let best = -1;
  let allowed = true;
  for (const rule of group.rules) {
    if (!matches(rule.path, path)) continue;
    if (rule.path.length > best || (rule.path.length === best && rule.allow)) {
      best = rule.path.length;
      allowed = rule.allow;
    }
  }
  return allowed;
}

/** Older parsers: the first matching rule wins. */
function firstMatchAllows(group: Group, path: string): boolean {
  return group.rules.find((rule) => matches(rule.path, path))?.allow ?? true;
}

const groups = parseGroups(readFileSync(resolve(import.meta.dirname, '../src/robots.txt'), 'utf8'));
const star = groups.find((g) => g.agents.includes('*'));

const PRIVATE = [
  '/lobby',
  '/lobby/K7P9MR',
  '/estimating/K7P9MR',
  '/join',
  '/join?code=K7P9MR',
  '/rooms/K7P9MR',
  '/ws/0b1c',
  '/health',
];
const PUBLIC = ['/', '/home', '/onboarding', '/favicon.ico', '/assets/icon/favicon.svg'];
const READERS = [
  ['longest match', longestMatchAllows],
  ['first match', firstMatchAllows],
] as const;

describe('robots.txt', () => {
  it('has one * group with one Content-Signal', () => {
    expect(groups.filter((g) => g.agents.includes('*'))).toHaveLength(1);
    expect(star?.signals).toHaveLength(1);
  });

  it("gives every group the * group's Content-Signal", () => {
    for (const group of groups)
      expect(group.signals, group.agents.join(', ')).toEqual(star?.signals);
  });

  it("gives every group the * group's rules", () => {
    for (const group of groups) expect(group.rules, group.agents.join(', ')).toEqual(star?.rules);
  });

  for (const [reader, allows] of READERS) {
    it(`keeps every group off room and relay paths, read by ${reader}`, () => {
      for (const group of groups) {
        for (const path of PRIVATE)
          expect(allows(group, path), `${group.agents[0]} ${path}`).toBe(false);
      }
    });

    it(`lets every group reach public pages, read by ${reader}`, () => {
      for (const group of groups) {
        for (const path of PUBLIC)
          expect(allows(group, path), `${group.agents[0]} ${path}`).toBe(true);
      }
    });
  }

  // Owner decision 2026-11-11: AI training, AI input and search all allowed.
  it('names the AI crawlers and signals yes to every use', () => {
    expect(star?.signals).toEqual(['ai-train=yes, search=yes, ai-input=yes']);
    const named = groups.flatMap((g) => g.agents);
    for (const agent of [
      'gptbot',
      'claudebot',
      'google-extended',
      'oai-searchbot',
      'chatgpt-user',
    ]) {
      expect(named, agent).toContain(agent);
    }
  });
});
