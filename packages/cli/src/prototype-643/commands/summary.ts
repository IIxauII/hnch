/**
 * PROTOTYPE (#643). The exit summary (UX-103), printed to scrollback on EVERY exit
 * path once the Room's frame is gone: quit, leave, ended, removed, Ctrl+C. Plain
 * text by default, JSON with --json. Layout from plan §6.6 "Exit summary".
 */
import { sessionSummary, type RoomModel } from '../room-model.js';
import { EXIT, type ExitCode } from './errors.js';

export type ExitPath = 'quit' | 'leave' | 'ended' | 'removed' | 'interrupted';

export interface ExitOutcome {
  path: ExitPath;
  code: ExitCode;
  /** The line that says what to do next (resume, start the next one, ask the host). */
  next: string;
  headline: string;
  keepInRecent: boolean;
}

export function decideExit(m: RoomModel, path: ExitPath, prevHostId: string): ExitOutcome {
  const s = m.state;
  const resume = `hnch resume ${s.code}`;
  const handedTo = prevHostId === s.selfId && s.hostId !== s.selfId ? m.nameOf(s.hostId) : '';
  const handOff = handedTo ? ` · ${handedTo} is host now` : '';
  switch (path) {
    case 'quit':
    case 'leave':
      return {
        path,
        code: EXIT.ok,
        headline: `hnch · ${s.name} · ${s.code} — you left${handOff}`,
        next: `Left ${s.name} · resume with: ${resume}`,
        keepInRecent: true,
      };
    case 'interrupted':
      return {
        path,
        code: EXIT.interrupted,
        headline: `hnch · ${s.name} · ${s.code} — interrupted (Ctrl+C), you left`,
        next: `Left ${s.name} · resume with: ${resume}`,
        keepInRecent: true,
      };
    case 'ended': {
      const by = m.isHost
        ? 'you ended the session'
        : `${m.host?.name ?? 'the host'} ended the session`;
      return {
        path,
        code: EXIT.ok,
        headline: `hnch · ${s.name} · ${s.code} — ${by}`,
        next: `Run it back: hnch create --name "${s.name}"`,
        keepInRecent: false,
      };
    }
    case 'removed': {
      const by = m.nameOf(m.self?.removedBy ?? s.hostId);
      return {
        path,
        code: EXIT.removed,
        headline: `${by} removed you from ${s.name} (${s.code})`,
        next: `Getting back in needs ${by}: ask them for the link`,
        keepInRecent: false,
      };
    }
  }
}

function pad(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n);
}

export function summaryText(m: RoomModel, o: ExitOutcome): string {
  const sum = sessionSummary(m);
  const lines = [o.headline];
  const keyW = Math.max(8, ...m.state.stories.map((x) => x.key.length));
  // 80 columns: 2 + key + 2 + title + 2 + value
  const titleW = Math.max(16, 80 - 6 - keyW - 8);
  for (const r of sum.rows)
    lines.push(`  ${pad(r.key, keyW)}  ${pad(r.title, titleW)}  ${r.value}`);
  for (const x of m.skipped) lines.push(`  ${pad(x.key, keyW)}  ${pad(x.title, titleW)}  skipped`);
  const left = m.queue;
  if (left.length) {
    const first = left
      .slice(0, 4)
      .map((x) => x.key || x.title)
      .join(', ');
    lines.push(
      `  Still to estimate: ${first}${left.length > 4 ? ` +${left.length - 4} more` : ''}`,
    );
  }
  const parts = [`${sum.rows.length} estimated`];
  if (sum.total !== undefined) parts.push(`${sum.total} pts`);
  if (sum.hnchd) parts.push(`${sum.hnchd} hnch'd`);
  parts.push(`${sum.minutes} min`);
  lines.push(`  ${parts.join(' · ')}`);
  lines.push(o.next);
  return lines.join('\n');
}

export function summaryJson(m: RoomModel, o: ExitOutcome): string {
  const sum = sessionSummary(m);
  return JSON.stringify(
    {
      room: { code: m.state.code, name: m.state.name },
      exit: { path: o.path, code: o.code },
      estimated: sum.rows,
      skipped: m.skipped.map((x) => ({ key: x.key, title: x.title })),
      toEstimate: m.queue.map((x) => ({ key: x.key, title: x.title })),
      totalPoints: sum.total ?? null,
      hnchd: sum.hnchd,
      minutes: sum.minutes,
      next: o.next,
      resume: o.keepInRecent ? `hnch resume ${m.state.code}` : null,
    },
    null,
    2,
  );
}
