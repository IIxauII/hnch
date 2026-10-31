/** PROTOTYPE (#643). The CLI Room. Stub, to be replaced by the TUI owner. */
import { render, Text } from 'ink';

import type { RunRoomTui } from './types.js';

export const runRoomTui: RunRoomTui = async (opts) => {
  const app = render(<Text>Room TUI not built yet ({opts.model.state.code})</Text>);
  app.unmount();
  return { reason: 'quit' };
};
