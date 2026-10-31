/** PROTOTYPE (#643). CLI command surface. Stub, to be replaced by the commands owner. */
import { RoomModel } from './room-model.js';
import { runRoomTui } from './room-tui.js';

const model = new RoomModel('waiting', 'hana');
await runRoomTui({
  model,
  plain: false,
  color: true,
  ascii: false,
  webUrl: 'https://hnch.dev/join?code=K7P9MR',
});
process.exit(0);
