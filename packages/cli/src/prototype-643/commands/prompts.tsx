/**
 * PROTOTYPE (#643). Prompts: the launcher/resume picker (UX-087, UX-090), the name
 * prompt prefilled from the cache, and the labelled, masked password prompt (UX-089).
 * Ink in a terminal; numbered/line prompts under --plain (UX-104). Enter always
 * selects; Esc goes back; Ctrl+C interrupts (exit 130).
 */
import { createInterface } from 'node:readline';

import { Box, render, Text, useInput } from 'ink';
import { useState } from 'react';

import type { DisplayOpts } from './args.js';
import { CliError, EXIT } from './errors.js';

export const INTERRUPTED = new CliError(
  EXIT.interrupted,
  'Interrupted.',
  'You pressed Ctrl+C before entering a room, so nothing changed.',
  'Run the command again when you are ready.',
);

// ── Readline-style line editing (UX-102) ───────────────────────────────────

interface Line {
  text: string;
  at: number;
}

function edit(line: Line, input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]): Line {
  const { text, at } = line;
  if (key.leftArrow) return { text, at: Math.max(0, at - 1) };
  if (key.rightArrow) return { text, at: Math.min(text.length, at + 1) };
  if (key.backspace || key.delete)
    return at === 0 ? line : { text: text.slice(0, at - 1) + text.slice(at), at: at - 1 };
  if (key.ctrl) {
    if (input === 'a') return { text, at: 0 };
    if (input === 'e') return { text, at: text.length };
    if (input === 'u') return { text: text.slice(at), at: 0 };
    if (input === 'k') return { text: text.slice(0, at), at };
    if (input === 'w') {
      const before = text.slice(0, at).replace(/\S+\s*$/u, '');
      return { text: before + text.slice(at), at: before.length };
    }
    return line;
  }
  if (key.meta || key.tab || key.upArrow || key.downArrow || !input) return line;
  // eslint-disable-next-line no-control-regex
  const clean = input.replace(/[\u0000-\u001f\u007f]/gu, '');
  return { text: text.slice(0, at) + clean + text.slice(at), at: at + clean.length };
}

// ── Text prompt ────────────────────────────────────────────────────────────

interface TextPromptProps {
  label: string;
  initial: string;
  mask?: string | undefined;
  hint: string | ((value: string) => string);
  error?: string | undefined;
  color: boolean;
  validate?: ((v: string) => string | undefined) | undefined;
  onDone: (v: string | null | 'interrupt') => void;
}

function TextPrompt(p: TextPromptProps) {
  const [line, setLine] = useState<Line>({ text: p.initial, at: p.initial.length });
  const [error, setError] = useState(p.error);
  const [done, setDone] = useState<string | null>(null);
  // render the settled line first, then unmount: the password never stays on screen
  const finish = (v: string | null | 'interrupt', shown: string) => {
    setDone(shown);
    setTimeout(() => p.onDone(v), 0);
  };
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') return finish('interrupt', 'interrupted');
      if (key.escape) return finish(null, 'cancelled');
      // a paste that ends in a newline submits, like typing it and pressing ⏎
      const pastedEnter = !key.return && /[\r\n]$/u.test(input);
      if (key.return || pastedEnter) {
        const text = pastedEnter ? edit(line, input, key).text : line.text;
        const problem = p.validate?.(text);
        if (problem) return setError(problem);
        return finish(text, p.mask ? '(hidden)' : text);
      }
      setError(undefined);
      setLine((l) => edit(l, input, key));
    },
    { isActive: done === null },
  );
  if (done !== null)
    return (
      <Text>
        <Text bold>{p.label}</Text>
        {`  ${done}`}
      </Text>
    );
  const shown = p.mask ? p.mask.repeat(line.text.length) : line.text;
  const before = shown.slice(0, line.at);
  const cur = shown.slice(line.at, line.at + 1) || ' ';
  const after = shown.slice(line.at + 1);
  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>{p.label}</Text>
        {'  '}
        {before}
        <Text inverse>{cur}</Text>
        {after}
      </Text>
      {error ? (
        <Text {...(p.color ? { color: 'red' } : {})}>{error}</Text>
      ) : (
        <Text dimColor>{typeof p.hint === 'function' ? p.hint(line.text) : p.hint}</Text>
      )}
    </Box>
  );
}

async function inkText(props: Omit<TextPromptProps, 'onDone'>): Promise<string | null> {
  let result: string | null | 'interrupt' = null;
  const app = render(
    <TextPrompt
      {...props}
      onDone={(v) => {
        result = v;
        app.unmount();
      }}
    />,
    { exitOnCtrlC: false, stdout: process.stderr },
  );
  await app.waitUntilExit();
  if (result === 'interrupt') throw INTERRUPTED;
  return result;
}

function plainLine(question: string): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    let answered = false;
    rl.on('SIGINT', () => {
      rl.close();
      process.stderr.write('\n');
      resolve('\x03');
    });
    rl.on('close', () => {
      if (!answered) resolve(null);
    });
    // resolve before close: today's picker closes first and loses the answer (UX-087)
    rl.question(question, (a) => {
      answered = true;
      resolve(a);
      rl.close();
    });
  });
}

export async function askText(
  d: DisplayOpts,
  o: {
    label: string;
    initial: string;
    hint: string | ((value: string) => string);
    validate?: (v: string) => string | undefined;
  },
): Promise<string | null> {
  if (d.plain) {
    let problem: string | undefined = 'first';
    while (problem) {
      const a = await plainLine(`${o.label}${o.initial ? ` [${o.initial}]` : ''}: `);
      if (a === '\x03') throw INTERRUPTED;
      if (a === null) return null;
      const v = a.trim() === '' ? o.initial : a.trim();
      problem = o.validate?.(v);
      if (!problem) return v;
      process.stderr.write(`${problem}\n`);
    }
  }
  return inkText({ ...o, color: d.color });
}

/** Labelled, masked with •, never echoed, cleared after submit (UX-089). */
export async function askPassword(
  d: DisplayOpts,
  o: { error?: string | undefined; hint: string },
): Promise<string | null> {
  return inkText({
    label: 'Room password',
    initial: '',
    mask: d.ascii ? '*' : '•',
    hint: o.hint,
    error: o.error,
    color: d.color,
    validate: (v) => (v.trim() ? undefined : 'Type the room password, or press esc to go back'),
  });
}

// ── Picker ─────────────────────────────────────────────────────────────────

export interface PickItem {
  label: string;
  detail?: string | undefined;
}

function Picker(p: {
  title: string;
  items: PickItem[];
  color: boolean;
  sel: string;
  onDone: (i: number | null | 'interrupt') => void;
}) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const finish = (v: number | null | 'interrupt') => {
    setDone(
      typeof v === 'number' ? (p.items[v]?.label ?? '') : v === null ? 'quit' : 'interrupted',
    );
    setTimeout(() => p.onDone(v), 0);
  };
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') return finish('interrupt');
      if (key.escape || input === 'q') return finish(null);
      if (key.return) return finish(i);
      if (key.upArrow) setI((x) => (x + p.items.length - 1) % p.items.length);
      if (key.downArrow) setI((x) => (x + 1) % p.items.length);
      const n = Number(input);
      if (input && Number.isInteger(n) && n >= 1 && n <= p.items.length) finish(n - 1);
    },
    { isActive: done === null },
  );
  if (done !== null)
    return (
      <Text>
        <Text bold>{p.title}</Text>
        {`  ${p.sel} ${done}`}
      </Text>
    );
  return (
    <Box flexDirection="column">
      <Text bold>{p.title}</Text>
      <Text> </Text>
      {p.items.map((it, k) => (
        <Text key={it.label + k} inverse={k === i}>
          {k === i ? ` ${p.sel} ` : '   '}
          {`${k + 1}  `}
          <Text bold={k === i}>{it.label}</Text>
          {it.detail ? <Text dimColor>{` · ${it.detail}`}</Text> : null}{' '}
        </Text>
      ))}
      <Text> </Text>
      <Text dimColor>{`↑↓ move   ⏎ open   1–${p.items.length} pick   esc quit`}</Text>
    </Box>
  );
}

export async function pick(
  d: DisplayOpts,
  title: string,
  items: PickItem[],
): Promise<number | null> {
  if (d.plain) {
    process.stderr.write(`${title}\n`);
    items.forEach((it, k) =>
      process.stderr.write(`  ${k + 1}. ${it.label}${it.detail ? ` · ${it.detail}` : ''}\n`),
    );
    let answered = false;
    while (!answered) {
      const a = await plainLine(`Pick 1–${items.length} [1]: `);
      if (a === '\x03') throw INTERRUPTED;
      if (a === null) return null;
      const n = a.trim() === '' ? 1 : Number(a.trim());
      answered = Number.isInteger(n) && n >= 1 && n <= items.length;
      if (answered) return n - 1;
      process.stderr.write(`Type a number from 1 to ${items.length}.\n`);
    }
  }
  let result: number | null | 'interrupt' = null;
  const app = render(
    <Picker
      title={title}
      items={items}
      color={d.color}
      sel={d.ascii ? '>' : '▸'}
      onDone={(v) => {
        result = v;
        app.unmount();
      }}
    />,
    { exitOnCtrlC: false, stdout: process.stderr },
  );
  await app.waitUntilExit();
  if (result === 'interrupt') throw INTERRUPTED;
  return result;
}
