/**
 * Wall-clock source for the room's time rules (TTL, keepalive, presence expiry,
 * write coalescing). Tests swap `now` to move time; production never does.
 */
export const clock = {
  now: (): number => Date.now(),
};
