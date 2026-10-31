/**
 * PROTOTYPE (#643). `hnch config`: the only home of settings in the CLI (none inside
 * the Room). Flags write at once; with no flags in a terminal, a 4-row editor where
 * Enter always selects (never "customise"), Esc always goes back, text rows have
 * readline keys, and an env override says so (UX-102). Writes the local (this
 * folder) config unless --global.
 */
import { Box, render, Text, useInput } from 'ink';
import { useState } from 'react';

import { AVATAR_VARIANTS, SCALES } from '../room-model.js';
import { bool, str, type DisplayOpts, type ParsedArgs } from './args.js';
import { CliError, EXIT, okLine } from './errors.js';
import { askText } from './prompts.js';
import { effectiveConfig, writeConfig, type ProtoConfig } from './store.js';

type Key = keyof ProtoConfig;
const ROWS: { key: Key; label: string; choices?: string[] }[] = [
  { key: 'name', label: 'Your name' },
  { key: 'color', label: 'Avatar colour', choices: ['auto', ...Object.keys(AVATAR_VARIANTS)] },
  { key: 'scale', label: 'Default scale', choices: Object.keys(SCALES) },
  { key: 'relayUrl', label: 'Relay URL' },
];

const scopeWord = (g: boolean) => (g ? 'global (every folder)' : 'local (this folder)');

function validate(k: Key, v: string): string | undefined {
  if (k === 'color' && v !== 'auto' && !(v in AVATAR_VARIANTS) && !/^#[0-9a-f]{6}$/iu.test(v))
    return `"${v}" isn't a colour. Use a palette name (${Object.keys(AVATAR_VARIANTS).slice(0, 4).join(', ')}, …) or #rrggbb.`;
  if (k === 'scale' && !(v in SCALES))
    return `"${v}" isn't a scale. Scales: ${Object.keys(SCALES).join(', ')}.`;
  if (k === 'relayUrl' && !/^https?:\/\/\S+$/u.test(v))
    return `"${v}" isn't a URL. For example: https://hnch.dev`;
  if (k === 'name' && !v.trim()) return 'A name helps people see who voted.';
  return undefined;
}

function show(k: Key, v: string | undefined): string {
  if (k === 'scale' && v) return SCALES[v]?.label ?? v;
  return v ?? '(not set)';
}

export async function cmdConfig(a: ParsedArgs, d: DisplayOpts): Promise<never> {
  const global = bool(a, 'global');
  const scope = global ? 'global' : 'local';
  const flagMap: [string, Key][] = [
    ['name', 'name'],
    ['color', 'color'],
    ['scale', 'scale'],
    ['relay-url', 'relayUrl'],
  ];
  const patch: ProtoConfig = {};
  for (const [flag, key] of flagMap) {
    const v = str(a, flag);
    if (v === undefined) continue;
    const problem = validate(key, v);
    if (problem)
      throw new CliError(
        EXIT.usage,
        `--${flag}: ${problem}`,
        'Nothing was saved.',
        `See the current values: hnch config --json`,
      );
    patch[key] = v;
  }
  if (Object.keys(patch).length) {
    writeConfig(scope, patch);
    for (const [k, v] of Object.entries(patch))
      process.stderr.write(
        `${okLine(`Saved ${ROWS.find((r) => r.key === k)?.label ?? k} = ${show(k as Key, v)} to the ${scopeWord(global)} config`, d)}\n`,
      );
    if (!global) process.stderr.write('  For every folder: add --global\n');
    process.exit(EXIT.ok);
  }

  const eff = effectiveConfig();
  if (bool(a, 'json')) {
    process.stdout.write(`${JSON.stringify(eff, null, 2)}\n`);
    process.exit(EXIT.ok);
  }
  if (!(process.stdin.isTTY && process.stderr.isTTY) || d.plain) {
    if (!d.plain || !process.stdin.isTTY) {
      for (const r of ROWS)
        process.stdout.write(
          `${r.label.padEnd(15)} ${show(r.key, eff[r.key].value).padEnd(28)} ${eff[r.key].source}\n`,
        );
      process.stdout.write(
        'Change one: hnch config --name Ana   (add --global for every folder)\n',
      );
      process.exit(EXIT.ok);
    }
    // --plain in a terminal: one question per row
    for (const r of ROWS) {
      const v = await askText(d, {
        label: r.label,
        initial: eff[r.key].value ?? '',
        hint: '',
        validate: (x) => validate(r.key, x),
      });
      if (v !== null && v !== eff[r.key].value) writeConfig(scope, { [r.key]: v });
    }
    process.exit(EXIT.ok);
  }
  const app = render(<Editor global={global} d={d} />, { stdout: process.stderr });
  await app.waitUntilExit();
  process.exit(EXIT.ok);
}

function Editor({ global, d }: { global: boolean; d: DisplayOpts }) {
  const [eff, setEff] = useState(effectiveConfig());
  const [row, setRow] = useState(0);
  const [mode, setMode] = useState<'rows' | 'list' | 'text'>('rows');
  const [choice, setChoice] = useState(0);
  const [text, setText] = useState({ v: '', at: 0 });
  const [note, setNote] = useState('');
  const [quit, setQuit] = useState(false);
  const r = ROWS[row]!;
  const sel = d.ascii ? '>' : '▸';

  const save = (v: string) => {
    const problem = validate(r.key, v);
    if (problem) return setNote(problem);
    writeConfig(global ? 'global' : 'local', { [r.key]: v });
    setEff(effectiveConfig());
    setNote(`Saved ${r.label} to the ${scopeWord(global)} config`);
    setMode('rows');
  };

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') return setQuit(true);
      if (mode === 'rows') {
        if (key.escape || input === 'q') return setQuit(true);
        if (key.upArrow) setRow((x) => (x + ROWS.length - 1) % ROWS.length);
        if (key.downArrow) setRow((x) => (x + 1) % ROWS.length);
        if (key.return) {
          const cur = eff[r.key].value ?? '';
          setNote('');
          if (r.choices) {
            setChoice(Math.max(0, r.choices.indexOf(cur)));
            setMode('list');
          } else {
            setText({ v: cur, at: cur.length });
            setMode('text');
          }
        }
        return;
      }
      if (key.escape) return setMode('rows');
      if (mode === 'list') {
        const n = r.choices!.length;
        if (key.upArrow) setChoice((x) => (x + n - 1) % n);
        if (key.downArrow) setChoice((x) => (x + 1) % n);
        if (key.return) save(r.choices![choice]!); // Enter selects. Always.
        return;
      }
      // text: readline-style keys
      if (key.return) return save(text.v);
      setText(({ v, at }) => {
        if (key.leftArrow) return { v, at: Math.max(0, at - 1) };
        if (key.rightArrow) return { v, at: Math.min(v.length, at + 1) };
        if (key.backspace || key.delete)
          return at ? { v: v.slice(0, at - 1) + v.slice(at), at: at - 1 } : { v, at };
        if (key.ctrl && input === 'a') return { v, at: 0 };
        if (key.ctrl && input === 'e') return { v, at: v.length };
        if (key.ctrl && input === 'u') return { v: v.slice(at), at: 0 };
        if (key.ctrl && input === 'k') return { v: v.slice(0, at), at };
        if (key.ctrl || key.meta || !input) return { v, at };
        return { v: v.slice(0, at) + input + v.slice(at), at: at + input.length };
      });
    },
    { isActive: !quit },
  );

  if (quit) {
    setTimeout(() => process.exit(EXIT.ok), 0);
    return <Text>Settings closed.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>Settings</Text>
        <Text
          dimColor
        >{` · saving to: ${scopeWord(global)}${global ? '' : ' · --global saves for every folder'}`}</Text>
      </Text>
      <Text> </Text>
      {ROWS.map((x, i) => {
        const e = eff[x.key];
        const editing = i === row && mode === 'text';
        const value = editing
          ? `${text.v.slice(0, text.at)}▏${text.v.slice(text.at)}`
          : show(x.key, e.value);
        return (
          <Text key={x.key} inverse={i === row && mode === 'rows'}>
            {i === row ? ` ${sel} ` : '   '}
            {x.label.padEnd(15)}
            {value.padEnd(30)}
            <Text dimColor>{e.source}</Text>
          </Text>
        );
      })}
      {mode === 'list' ? (
        <Box flexDirection="column" marginLeft={4} marginTop={1}>
          {r.choices!.map((c, i) => (
            <Text key={c} inverse={i === choice}>
              {i === choice ? ` ${sel} ` : '   '}
              {show(r.key, c)}
              {c === eff[r.key].value ? '  (current)' : ''}
            </Text>
          ))}
        </Box>
      ) : null}
      <Text> </Text>
      {note ? (
        <Text {...(d.color ? { color: note.startsWith('Saved') ? 'green' : 'red' } : {})}>
          {note}
        </Text>
      ) : null}
      {r.key === 'relayUrl' && eff.relayUrl.source.startsWith('overridden') ? (
        <Text dimColor>HNCH_RELAY_URL is set, so it wins over what you save here.</Text>
      ) : null}
      <Text dimColor>
        {mode === 'rows'
          ? '↑↓ move   ⏎ change   esc done'
          : mode === 'list'
            ? '↑↓ move   ⏎ select   esc back'
            : '⏎ save   esc back   ←→ ctrl+a/e ctrl+u/k'}
      </Text>
      <Text dimColor>Custom scales are edited on the web; the CLI uses them.</Text>
    </Box>
  );
}
