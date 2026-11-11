import { DestroyRef, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import type { ParticipantSnapshot, Round } from '@hnch/shared';
import {
  ABSTAIN_SENTINEL,
  isAbstainVote,
  isValidRoomCode,
  normalizeRoomCode,
  participantRole,
} from '@hnch/shared';

import { isJoinUrl } from '../join/join.helpers';
import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { ParticipantIdService } from './participant-id.service';

/**
 * The part of WebMCP this app uses (https://webmachinelearning.github.io/webmcp/).
 * Browsers without it, and the native shells, have no `modelContext` at all.
 */
export interface ModelContextLike {
  /** The spec returns a promise; early implementations return nothing. */
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): unknown;
  /** Only in implementations that predate unregistering by `signal`. */
  unregisterTool?(name: string): unknown;
}

export interface WebMcpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: object;
  readonly annotations?: { readonly readOnlyHint?: boolean };
  execute(input: Record<string, unknown>): Promise<WebMcpToolResult>;
}

/** MCP's tool-result shape: what early implementations expect, and the spec stringifies as is. */
export interface WebMcpToolResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
}

/** The spec puts it on `document`; the first implementations put it on `navigator`. */
export function findModelContext(
  doc: object = globalThis.document ?? {},
  nav: object = globalThis.navigator ?? {},
): ModelContextLike | null {
  for (const host of [doc, nav]) {
    const ctx = (host as { modelContext?: Partial<ModelContextLike> }).modelContext;
    if (typeof ctx?.registerTool === 'function') return ctx as ModelContextLike;
  }
  return null;
}

/** Pages an agent may open directly. The in-session pages need a code: `join_session`. */
const PAGES = { home: '/home', join: '/join', settings: '/settings' } as const;
type PageName = keyof typeof PAGES;

function json(value: unknown): WebMcpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function cardLabel(card: string): string {
  return isAbstainVote(card) ? 'abstain' : card;
}

/** The app says observer; the doc says viewer. */
function roleLabel(p: ParticipantSnapshot): 'voter' | 'observer' {
  return participantRole(p) === 'viewer' ? 'observer' : 'voter';
}

const NOT_A_VOTER = 'You are an observer in this session, so you cannot vote.';

/**
 * Exposes hnch's main actions to AI agents in the browser through WebMCP: reading the session,
 * joining one, voting, and moving between pages. Joining and page changes go through the router,
 * so the pages keep handling onboarding, passwords and expired codes the way they do for a person.
 *
 * Votes still hidden in a round are never returned, only who has voted: an agent sees what the
 * person at this screen sees.
 */
@Injectable({ providedIn: 'root' })
export class WebMcpService {
  private readonly router = inject(Router);
  private readonly docService = inject(DocService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Registers every tool once, and unregisters them when the app is destroyed. Never throws: an
   * agent API that misbehaves must not stop the app from starting.
   */
  register(ctx: ModelContextLike | null = findModelContext()): void {
    if (!ctx) {
      // A polyfill or extension may install the API after the app has booted, but by `load`.
      if (typeof document !== 'undefined' && document.readyState !== 'complete') {
        const retry = (): void => {
          const late = findModelContext();
          if (late) this.register(late);
        };
        window.addEventListener('load', retry, { once: true });
        this.destroyRef.onDestroy(() => window.removeEventListener('load', retry));
      }
      return;
    }
    const controller = new AbortController();
    const tools = this.tools();
    for (const tool of tools) {
      try {
        const pending = ctx.registerTool(tool, { signal: controller.signal });
        // Not `instanceof Promise`: an extension's promise comes from another realm.
        Promise.resolve(pending).catch(() => undefined);
      } catch {
        // A name the page already registered, or an implementation that rejects the schema.
      }
    }
    this.destroyRef.onDestroy(() => {
      controller.abort();
      for (const tool of tools) {
        try {
          ctx.unregisterTool?.(tool.name);
        } catch {
          // Already gone through the signal.
        }
      }
    });
  }

  tools(): readonly WebMcpTool[] {
    return [
      {
        name: 'get_session_state',
        title: 'Get session state',
        description:
          'Read the planning poker session open in this tab: its code, who is in it and online, ' +
          'who is host, the current round (title, ticket, cards, status) and the agenda. Votes ' +
          'in a round still being voted on are hidden: you get who has voted and your own card. ' +
          'Returns inSession: false when no session is open.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => json(this.sessionState()),
      },
      {
        name: 'list_recent_sessions',
        title: 'List recent sessions',
        description:
          'List the sessions this browser joined in the last 24 hours, newest first, with their ' +
          'session codes. Pass a code to join_session to go back in.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => {
          const entries = await this.lastSessionService.list();
          return json({
            sessions: entries.map((e) => ({
              code: e.roomCode,
              lastSeenAt: new Date(e.lastSeenAt).toISOString(),
            })),
          });
        },
      },
      {
        name: 'join_session',
        title: 'Join a session',
        description:
          'Join a planning poker session by its 6-character session code (for example K7P9MR or ' +
          'K7P-9MR, any case). Opens the Join page, which joins on its own. If the session has ' +
          'a password, the page asks the user for it. Someone using hnch for the first time is ' +
          'asked to pick a nickname first. Read get_session_state afterwards to see the result.',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The session code, with or without the dash.',
            },
          },
          required: ['code'],
        },
        execute: async (input) => {
          const code = normalizeRoomCode(String(input['code'] ?? ''));
          if (!isValidRoomCode(code)) {
            throw new Error(
              'Not a session code. A code has 6 characters: uppercase letters and digits ' +
                'without 0, O, 1, I and L.',
            );
          }
          // The Join page acts on a code only as it is entered, and staying on it is no entry.
          if (isJoinUrl(this.router.url)) {
            await this.router.navigateByUrl('/home', { skipLocationChange: true });
          }
          await this.router.navigate(['/join'], { queryParams: { code } });
          return json({ code, page: this.router.url });
        },
      },
      {
        name: 'cast_vote',
        title: 'Cast a vote',
        description:
          'Pick a card in the round being voted on, for the user in this tab. The card must be ' +
          "one of the round's cards (see get_session_state), or 'abstain'. Voting again " +
          'changes the vote until the round is revealed. Observers cannot vote.',
        inputSchema: {
          type: 'object',
          properties: {
            card: {
              type: 'string',
              description: "A card face from the round's scale, such as '5' or 'M', or 'abstain'.",
            },
          },
          required: ['card'],
        },
        execute: async (input) => json(this.castVote(String(input['card'] ?? ''))),
      },
      {
        name: 'open_page',
        title: 'Open a page',
        description:
          'Go to a page of hnch: home (start a session or jump back into a recent one), join ' +
          '(enter a session code) or settings (nickname, theme, default scale). Someone using ' +
          'hnch for the first time is asked to pick a nickname first.',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', enum: Object.keys(PAGES) },
          },
          required: ['page'],
        },
        execute: async (input) => {
          const page = String(input['page'] ?? '');
          if (!Object.hasOwn(PAGES, page)) {
            throw new Error(`Unknown page. Use one of: ${Object.keys(PAGES).join(', ')}.`);
          }
          await this.router.navigateByUrl(PAGES[page as PageName]);
          return json({ page: this.router.url });
        },
      },
    ];
  }

  private sessionState(): object {
    const page = this.router.url;
    const settings = this.docService.settings();
    if (!this.docService.hasSession() || !settings) return { inSession: false, page };

    const me = this.participantIdService.id();
    const online = this.docService.onlineParticipantIds();
    const round = this.docService.currentRound();
    const active = round !== null && this.docService.activeRound()?.id === round.id;
    const everyone = this.docService.participants();
    const nameOf = (id: string): string =>
      everyone.find((p) => p.id === id)?.displayName ?? 'someone who left';
    // As the voting screen counts them: a vote left by someone offline or now observing is not.
    const onlineVoters = new Set(
      this.docService
        .activeParticipants()
        .filter((p) => online.has(p.id) && participantRole(p) === 'voter')
        .map((p) => p.id),
    );

    const describe = (p: ParticipantSnapshot) => ({
      displayName: p.displayName,
      role: roleLabel(p),
      isHost: p.id === settings.hostParticipantId,
      online: online.has(p.id),
      hasVoted: active ? onlineVoters.has(p.id) && p.id in round.votes : undefined,
    });
    const self = everyone.find((p) => p.id === me);

    return {
      inSession: true,
      page,
      code: this.docService.roomCode(),
      connected: this.docService.joined(),
      sessionName: settings.name,
      you: self ? describe(self) : null,
      participants: this.docService.activeParticipants().map(describe),
      round: round ? this.describeRound(round, active, onlineVoters, me, nameOf) : null,
      // Unset fields are undefined, which JSON leaves out.
      agenda: this.docService
        .pendingAgenda()
        .map((item) => ({ title: item.title, ticketId: item.ticketId })),
    };
  }

  private describeRound(
    round: Round,
    active: boolean,
    onlineVoters: ReadonlySet<string>,
    me: string | null,
    nameOf: (id: string) => string,
  ): object {
    const mine = me === null ? undefined : round.votes[me];
    return {
      status: round.status,
      openForVoting: active,
      title: round.title,
      ticketId: round.ticketId,
      description: round.description,
      cards: round.scale.cards,
      ...(active && {
        votesCast: Object.keys(round.votes).filter((id) => onlineVoters.has(id)).length,
        voters: onlineVoters.size,
      }),
      yourVote: mine === undefined ? null : cardLabel(mine),
      ...(round.status === 'revealed' && {
        votes: Object.entries(round.votes).map(([id, card]) => ({
          displayName: nameOf(id),
          card: cardLabel(card),
        })),
      }),
    };
  }

  private castVote(raw: string): object {
    const round = this.docService.activeRound();
    if (!round) throw new Error('No round is open for voting.');

    const wanted = raw.trim();
    const card =
      wanted.toLowerCase() === 'abstain'
        ? ABSTAIN_SENTINEL
        : round.scale.cards.find((c) => c.toLowerCase() === wanted.toLowerCase());
    if (card === undefined) {
      throw new Error(
        `Not a card in this round. Use one of: ${round.scale.cards.join(', ')}, abstain.`,
      );
    }

    const me = this.participantIdService.id();
    const self = this.docService.activeParticipants().find((p) => p.id === me);
    if (!self || participantRole(self) !== 'voter') throw new Error(NOT_A_VOTER);
    // toggleCurrentVote clears a vote cast again, which is not what "cast" asks for.
    if (round.votes[self.id] === card) return { vote: cardLabel(card) };

    const result = this.docService.commands.toggleCurrentVote(card);
    if (!result.applied) {
      throw new Error(
        result.reason === 'not-a-voter' ? NOT_A_VOTER : 'No round is open for voting.',
      );
    }
    return { vote: cardLabel(card) };
  }
}
