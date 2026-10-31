/**
 * PROTOTYPE (#643), throwaway. The CLI command surface around the terminal Room:
 * launcher, create / join / resume / config, the deprecated agenda one-shots,
 * help, errors and exit codes, and the exit summary. Plan §6.5 is the contract.
 * Run: `pnpm proto:643:cli [command] [flags]` from the repo root (`-h` for help).
 */
import { allowOnly, bool, displayOpts, parseArgs, type DisplayOpts } from './commands/args.js';
import { cmdAgenda } from './commands/agenda.js';
import { cmdConfig } from './commands/config.js';
import { CliError, EXIT } from './commands/errors.js';
import { HELP, VERSION, VERSION_LABEL } from './commands/help.js';
import { cmdCreate, cmdJoin, cmdLauncher, cmdResume, printError } from './commands/room-flow.js';
import { looksLikeCodeOrLink } from './commands/rooms.js';
import { resetStore, STORE_DIR } from './commands/store.js';

const COMMANDS = new Set(['create', 'join', 'resume', 'config', 'agenda', 'help', 'proto']);

function out(text: string): never {
  process.stdout.write(`${text}\n`);
  process.exit(EXIT.ok);
}

async function main(argv: string[]): Promise<void> {
  let d: DisplayOpts = { plain: false, color: false, ascii: false };
  try {
    const a = parseArgs(argv);
    d = displayOpts(a);
    let [cmd, arg1] = a.positionals;

    if (bool(a, 'version') && !cmd) {
      if (bool(a, 'json'))
        out(
          JSON.stringify(
            {
              name: '@xauyxau/hnch',
              version: VERSION,
              prototype: '#643',
              node: process.version,
              source: 'https://github.com/IIxauII/hnch',
              license: 'AGPL-3.0-only',
            },
            null,
            2,
          ),
        );
      out(`hnch ${VERSION_LABEL}\nSource code: https://github.com/IIxauII/hnch (AGPL-3.0-only)`);
    }

    // `hnch K7P9MR` and `hnch <link>` are a join (UX-090)
    if (cmd && !COMMANDS.has(cmd)) {
      if (looksLikeCodeOrLink(cmd)) {
        arg1 = cmd;
        cmd = 'join';
      } else
        throw new CliError(
          EXIT.usage,
          `"${cmd}" isn't a command.`,
          'Commands: create, join, resume, config (and the deprecated agenda).',
          'See examples: hnch -h',
        );
    }

    if (bool(a, 'help') || cmd === 'help') {
      const topic = cmd === 'help' ? (arg1 ?? 'main') : (cmd ?? 'main');
      const text = HELP[topic];
      if (!text)
        throw new CliError(
          EXIT.usage,
          `No help for "${topic}".`,
          `Topics: ${Object.keys(HELP)
            .filter((k) => k !== 'main')
            .join(', ')}.`,
          'For example: hnch help parity',
        );
      out(text);
    }

    switch (cmd) {
      case undefined:
        allowOnly(a, 'hnch', []);
        await cmdLauncher(a, d, () => HELP['main']!);
        break;
      case 'create':
        allowOnly(a, 'create', ['name', 'stories', 'password', 'password-stdin']);
        await cmdCreate(a, d);
        break;
      case 'join':
        allowOnly(a, 'join', ['name', 'watch', 'password-stdin']);
        await cmdJoin(a, d, arg1);
        break;
      case 'resume':
        allowOnly(a, 'resume', ['list', 'watch']);
        await cmdResume(a, d, arg1);
        break;
      case 'config':
        allowOnly(a, 'config', ['name', 'color', 'scale', 'relay-url', 'global']);
        await cmdConfig(a, d);
        break;
      case 'agenda':
        allowOnly(a, 'agenda', ['room']);
        cmdAgenda(a, d);
      case 'proto':
        if (arg1 !== 'reset')
          throw new CliError(
            EXIT.usage,
            'hnch proto takes one subcommand: reset.',
            `It deletes the prototype's state in ${STORE_DIR}.`,
            'Run: hnch proto reset',
          );
        resetStore();
        out(`Deleted ${STORE_DIR}. Recent rooms, saved stories and config are back to the seed.`);
    }
  } catch (e) {
    printError(e, d);
  }
}

await main(process.argv.slice(2));
