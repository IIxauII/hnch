/**
 * PROTOTYPE (#643). The one Room component: renders `screen()` line by line,
 * re-renders on `model.subscribe`, ticks the model (simulated peers, settle
 * window, undo windows) and routes keys through `handleKey`. Ink 5 writes
 * nothing when a render produces the same frame, so idle output stays at 0 bytes
 * in waiting and revealed (R-47), and the frame is `rows − 1` tall (R-45).
 */
import { Box, Static, Text, useInput, useStdout } from 'ink';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { KEY_SETTLE_MS } from '../interaction.js';
import type { RoomModel } from '../room-model.js';
import type { TuiExit } from '../types.js';
import { screen } from './frame.js';
import { handleKey, settle, type KeyEnv } from './keys.js';
import { announce, snap, type PlainSnap } from './plain.js';
import type { Seg } from './text.js';
import { initialUi, type Ui } from './ui-state.js';

export interface RoomProps {
  model: RoomModel;
  plain: boolean;
  color: boolean;
  ascii: boolean;
  webUrl: string;
  onExit: (exit: TuiExit) => void;
  /** Fixed size (tests); otherwise the terminal's size, following resizes. */
  cols?: number | undefined;
  rows?: number | undefined;
  /** Clipboard writer; resolves false when there is no clipboard (UX-101 fallback). */
  copy?: ((text: string) => Promise<boolean>) | undefined;
  /** UX-012: simulated connect time before `● live`. */
  connectMs?: number | undefined;
  /** Re-render interval for minute clocks and toast countdowns. */
  clockMs?: number | undefined;
}

const TONE: Record<NonNullable<Seg['tone']>, { color?: string; bold?: boolean; dim?: boolean }> = {
  accent: { color: 'green' },
  success: { color: 'green', bold: true },
  neutral: { bold: true },
  warning: { color: 'yellow' },
  danger: { color: 'red' },
  muted: { color: 'gray' },
};

function segProps(sg: Seg, color: boolean) {
  const t = sg.tone ? TONE[sg.tone] : {};
  const p: { color?: string; dimColor?: boolean; bold?: boolean; inverse?: boolean } = {};
  // UX-100: without colour, meaning stays in the glyph + word; inverse and bold stay
  if (color && t.color) p.color = t.color;
  if (!color && sg.tone === 'muted') p.dimColor = true;
  if (sg.bold || t.bold) p.bold = true;
  if (sg.inverse) p.inverse = true;
  return p;
}

async function defaultCopy(text: string): Promise<boolean> {
  try {
    const mod = (await import('clipboardy')) as { default: { write(t: string): Promise<void> } };
    await mod.default.write(text);
    return true;
  } catch {
    return false;
  }
}

export function Room(props: RoomProps) {
  const { model, plain, color, ascii, webUrl, onExit } = props;
  const { stdout } = useStdout();
  const uiRef = useRef<Ui>(initialUi(model));
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const exited = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const endTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [size, setSize] = useState({ cols: stdout.columns || 80, rows: stdout.rows || 24 });

  const set = useCallback((u: Ui) => {
    uiRef.current = u;
    bump();
  }, []);

  const exit = useCallback(
    (reason: TuiExit['reason']) => {
      if (exited.current) return;
      exited.current = true;
      onExit({ reason });
    },
    [onExit],
  );

  const copyFn = props.copy ?? defaultCopy;
  const env = useCallback(
    (): KeyEnv => ({
      model,
      now: Date.now(),
      webUrl,
      exit,
      copy: (text, what) => {
        void copyFn(text).then((ok) => {
          const now = Date.now();
          uiRef.current = {
            ...uiRef.current,
            flash: ok
              ? { text: `✓ ${what} copied`, tone: 'success', until: now + 2500 }
              : {
                  text:
                    what === 'Invite link'
                      ? `No clipboard here · copy it by hand: ${text}`
                      : 'No clipboard here · the summary also prints when you leave',
                  tone: 'warning',
                  until: now + 10_000,
                },
          };
          bump();
        });
      },
      armSettle: () => {
        clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => set(settle(env(), uiRef.current)), KEY_SETTLE_MS);
      },
    }),
    [model, webUrl, exit, copyFn, set],
  );

  // model → render; a new lab event shows for 8 s
  useEffect(() => {
    const onChange = () => {
      const at = model.state.lab[0]?.at ?? 0;
      if (at !== uiRef.current.labAt)
        uiRef.current = { ...uiRef.current, labAt: at, labUntil: Date.now() + 8000 };
      bump();
    };
    const off = model.subscribe(onChange);
    const tick = setInterval(() => model.tick(Date.now()), 100);
    // minute clocks, toast countdown, flash expiry; Ink skips identical frames
    const clock = setInterval(bump, props.clockMs ?? 500);
    const connect = setTimeout(
      () => set({ ...uiRef.current, connecting: false }),
      props.connectMs ?? 600,
    );
    return () => {
      off();
      clearInterval(tick);
      clearInterval(clock);
      clearTimeout(connect);
      clearTimeout(settleTimer.current);
      clearTimeout(endTimer.current);
    };
  }, [model, set, props.clockMs, props.connectMs]);

  // follow terminal resizes; the one allowed clear is one per resize (R-45)
  useEffect(() => {
    if (props.cols || plain) return;
    const onResize = () => {
      stdout.write('\u001B[2J\u001B[H');
      setSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout, plain, props.cols]);

  // removed (UX-010) or session ended: show the message, then close on a key or after 2.5 s
  const me = model.self;
  const terminal = me?.removedBy && me.leftAt ? 'removed' : model.state.ended ? 'ended' : undefined;
  useEffect(() => {
    if (!terminal || endTimer.current) return;
    endTimer.current = setTimeout(() => exit(terminal), 2500);
  });

  useInput((input, key) => {
    if (exited.current) return;
    set(handleKey(env(), uiRef.current, input, key));
  });

  const ui = uiRef.current;
  const T = { ascii };

  // ── plain / screen-reader mode ──
  const prevSnap = useRef<PlainSnap | undefined>(undefined);
  const log = useRef<{ id: number; t: string }[]>([]);
  if (plain) {
    const lines = announce(prevSnap.current, model, ui, T, webUrl);
    prevSnap.current = snap(model, ui);
    for (const t of lines) log.current.push({ id: log.current.length, t });
    return <Static items={[...log.current]}>{(it) => <Text key={it.id}>{it.t}</Text>}</Static>;
  }

  const W = props.cols ?? size.cols;
  const H = props.rows ?? size.rows;
  const lines = screen(model, ui, { W, H, ascii, webUrl, now: Date.now() });
  return (
    <Box flexDirection="column" width={W}>
      {lines.map((l, i) => (
        <Text key={i} wrap="truncate">
          {l.map((sg, j) => (
            <Text key={j} {...segProps(sg, color)}>
              {sg.t}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
