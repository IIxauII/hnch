/**
 * PROTOTYPE (#643). The CLI Room: one alternate-screen Ink TUI with the same
 * three phases as the web Room (waiting / voting / revealed). Layout and frames
 * per plan §5.9 / §6.6; the pure frame builder lives in tui/frame.ts.
 *
 * Exit (R-50): the exit promise is taken at render time; closing renders an
 * empty tree, waits one tick, unmounts, leaves the alternate screen, and only
 * then resolves, so main.ts prints the summary to normal scrollback.
 */
import { render } from 'ink';

import { Room } from './tui/Room.js';
import type { RunRoomTui, TuiExit } from './types.js';

const ALT_ON = '\u001B[?1049h\u001B[H\u001B[?25l';
const ALT_OFF = '\u001B[?25h\u001B[?1049l';

export const runRoomTui: RunRoomTui = (opts) =>
  new Promise<TuiExit>((resolve) => {
    const out = process.stdout;
    const alt = !opts.plain && out.isTTY === true;
    if (alt) out.write(ALT_ON);
    let closing = false;
    const onExit = (exit: TuiExit) => {
      if (closing) return;
      closing = true;
      app.rerender(<></>);
      setImmediate(() => {
        app.unmount();
        if (alt) out.write(ALT_OFF);
        resolve(exit);
      });
    };
    const app = render(
      <Room
        model={opts.model}
        plain={opts.plain}
        color={opts.color}
        ascii={opts.ascii}
        webUrl={opts.webUrl}
        onExit={onExit}
      />,
      { exitOnCtrlC: false, patchConsole: false },
    );
  });
