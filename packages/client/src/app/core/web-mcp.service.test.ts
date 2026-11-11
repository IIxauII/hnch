/**
 * @vitest-environment jsdom
 */

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ParticipantSnapshot, Round, Settings } from '@hnch/shared';
import { ABSTAIN_SENTINEL } from '@hnch/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only needed as DI tokens; the real modules pull in Ionic and Capacitor.
vi.mock('./doc/doc.service', () => ({ DocService: class DocService {} }));
vi.mock('./last-session.service', () => ({ LastSessionService: class LastSessionService {} }));
vi.mock('./participant-id.service', () => ({
  ParticipantIdService: class ParticipantIdService {},
}));

import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { ParticipantIdService } from './participant-id.service';
import {
  findModelContext,
  type ModelContextLike,
  type WebMcpTool,
  WebMcpService,
} from './web-mcp.service';

const ME = 'p-me';
const OTHER = 'p-other';

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    title: 'Login page',
    scale: { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] },
    createdBy: ME,
    createdAt: 0,
    votes: {},
    status: 'voting',
    ...overrides,
  };
}

const participants: ParticipantSnapshot[] = [
  { id: ME, displayName: 'Ada', joinedAt: 0 },
  { id: OTHER, displayName: 'Bo', joinedAt: 0, role: 'voter' },
];

function setup() {
  const settings = signal<Settings | null>({
    defaultScale: { id: 'fibonacci', cards: [] },
    hostParticipantId: ME,
  });
  const current = signal<Round | null>(round());
  const active = signal<Round | null>(round());
  const toggleCurrentVote = vi.fn(() => ({ applied: true }) as const);
  const navigate = vi.fn(async () => true);
  const navigateByUrl = vi.fn(async () => true);
  const list = vi.fn(async () => [{ roomCode: 'K7P9MR', roomUuid: 'u1', lastSeenAt: 0 }]);

  TestBed.configureTestingModule({
    providers: [
      WebMcpService,
      { provide: Router, useValue: { url: '/estimating/K7P9MR', navigate, navigateByUrl } },
      {
        provide: DocService,
        useValue: {
          hasSession: signal(true),
          settings,
          roomCode: signal('K7P9MR'),
          joined: signal(true),
          participants: signal(participants),
          activeParticipants: signal(participants),
          onlineParticipantIds: signal(new Set([ME])),
          currentRound: current,
          activeRound: active,
          pendingAgenda: signal([]),
          commands: { toggleCurrentVote },
        },
      },
      { provide: LastSessionService, useValue: { list } },
      { provide: ParticipantIdService, useValue: { id: signal(ME) } },
    ],
  });

  const service = TestBed.inject(WebMcpService);
  const tool = (name: string): WebMcpTool => service.tools().find((t) => t.name === name)!;
  const call = async (name: string, input: Record<string, unknown> = {}) =>
    JSON.parse((await tool(name).execute(input)).content[0]!.text);

  return { service, call, settings, current, active, toggleCurrentVote, navigate, navigateByUrl };
}

describe('findModelContext', () => {
  const ctx = { registerTool: () => undefined };

  it('prefers document.modelContext, as the spec has it', () => {
    expect(findModelContext({ modelContext: ctx }, { modelContext: {} })).toBe(ctx);
  });

  it('falls back to navigator.modelContext', () => {
    expect(findModelContext({}, { modelContext: ctx })).toBe(ctx);
  });

  it('is null without the API', () => {
    expect(findModelContext({}, {})).toBeNull();
  });
});

describe('WebMcpService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('registers every tool with a schema and unregisters them on destroy', () => {
    const { service } = setup();
    const signals: AbortSignal[] = [];
    const ctx: ModelContextLike = {
      registerTool: vi.fn((_tool, opts) => {
        signals.push(opts!.signal!);
        return Promise.resolve();
      }),
    };

    service.register(ctx);

    const names = vi.mocked(ctx.registerTool).mock.calls.map(([t]) => t.name);
    expect(names).toEqual([
      'get_session_state',
      'list_recent_sessions',
      'join_session',
      'cast_vote',
      'open_page',
    ]);
    for (const [t] of vi.mocked(ctx.registerTool).mock.calls) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema).toMatchObject({ type: 'object' });
    }
    expect(signals.every((s) => !s.aborted)).toBe(true);

    TestBed.resetTestingModule();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it('keeps going when the API throws or rejects', () => {
    const { service } = setup();
    const registerTool = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('duplicate');
      })
      .mockImplementation(() => Promise.reject(new Error('nope')));

    expect(() => service.register({ registerTool })).not.toThrow();
    expect(registerTool).toHaveBeenCalledTimes(5);
  });

  describe('get_session_state', () => {
    it('hides other votes while the round is open', async () => {
      const { call, current } = setup();
      current.set(round({ votes: { [ME]: '5', [OTHER]: '8' } }));

      const state = await call('get_session_state');

      expect(state).toMatchObject({ inSession: true, code: 'K7P9MR' });
      expect(state.round).toMatchObject({ status: 'voting', votesCast: 2, yourVote: '5' });
      expect(state.round.votes).toBeUndefined();
      expect(JSON.stringify({ ...state, round: { ...state.round, cards: [] } })).not.toContain(
        '"8"',
      );
      expect(state.participants).toEqual([
        { displayName: 'Ada', role: 'voter', isHost: true, online: true, hasVoted: true },
        { displayName: 'Bo', role: 'voter', isHost: false, online: false, hasVoted: true },
      ]);
    });

    it('lists the votes once the round is revealed', async () => {
      const { call, current } = setup();
      current.set(round({ status: 'revealed', votes: { [ME]: '5', [OTHER]: ABSTAIN_SENTINEL } }));

      const state = await call('get_session_state');

      expect(state.round.votes).toEqual([
        { displayName: 'Ada', card: '5' },
        { displayName: 'Bo', card: 'abstain' },
      ]);
    });

    it('says when no session is open', async () => {
      const { call, settings } = setup();
      settings.set(null);

      expect(await call('get_session_state')).toEqual({
        inSession: false,
        page: '/estimating/K7P9MR',
      });
    });
  });

  it('list_recent_sessions returns codes without password hashes', async () => {
    const { call } = setup();
    expect(await call('list_recent_sessions')).toEqual({
      sessions: [{ code: 'K7P9MR', lastSeenAt: '1970-01-01T00:00:00.000Z' }],
    });
  });

  describe('join_session', () => {
    it('opens the Join page with the normalized code', async () => {
      const { call, navigate } = setup();
      await call('join_session', { code: ' k7p-9mr ' });
      expect(navigate).toHaveBeenCalledWith(['/join'], { queryParams: { code: 'K7P9MR' } });
    });

    it('refuses something that is not a code', async () => {
      const { call, navigate } = setup();
      await expect(call('join_session', { code: 'O0O0O0' })).rejects.toThrow(/Not a session code/);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('cast_vote', () => {
    it('votes with the card as the scale spells it', async () => {
      const { call, active, toggleCurrentVote } = setup();
      active.set(round({ scale: { id: 't-shirt', cards: ['S', 'M', 'L'] } }));

      expect(await call('cast_vote', { card: 'm' })).toEqual({ vote: 'M' });
      expect(toggleCurrentVote).toHaveBeenCalledWith('M');
    });

    it('maps abstain to the sentinel', async () => {
      const { call, toggleCurrentVote } = setup();
      await call('cast_vote', { card: 'Abstain' });
      expect(toggleCurrentVote).toHaveBeenCalledWith(ABSTAIN_SENTINEL);
    });

    it('does not toggle off a vote already cast', async () => {
      const { call, active, toggleCurrentVote } = setup();
      active.set(round({ votes: { [ME]: '5' } }));

      expect(await call('cast_vote', { card: '5' })).toEqual({ vote: '5' });
      expect(toggleCurrentVote).not.toHaveBeenCalled();
    });

    it('refuses a card outside the scale, and a closed round', async () => {
      const { call, active } = setup();
      await expect(call('cast_vote', { card: '13' })).rejects.toThrow(/Use one of: 1, 2, 3, 5, 8/);
      active.set(null);
      await expect(call('cast_vote', { card: '5' })).rejects.toThrow(/No round is open/);
    });

    it('explains a refusal for observers', async () => {
      const { call, toggleCurrentVote } = setup();
      toggleCurrentVote.mockReturnValue({ applied: false, reason: 'not-a-voter' } as never);
      await expect(call('cast_vote', { card: '5' })).rejects.toThrow(/observer/);
    });
  });

  describe('open_page', () => {
    it('navigates to a known page', async () => {
      const { call, navigateByUrl } = setup();
      await call('open_page', { page: 'settings' });
      expect(navigateByUrl).toHaveBeenCalledWith('/settings');
    });

    it('refuses an unknown page', async () => {
      const { call } = setup();
      await expect(call('open_page', { page: 'lobby' })).rejects.toThrow(/Unknown page/);
    });
  });
});
