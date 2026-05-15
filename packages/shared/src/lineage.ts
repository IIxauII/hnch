import type { Round } from './doc.js';

/**
 * Resolved re-vote lineage for a round.
 *
 *  - `chainRoot` — the first round in the chain (the one with no `parentRoundId`).
 *  - `depth` — 1-indexed position of the queried round along the root→leaf path
 *    (root itself is depth 1; first re-vote is depth 2).
 *  - `total` — total number of rounds in the chain reachable from `chainRoot`
 *    via `parentRoundId` (BFS over descendants, including the root).
 */
export interface RoundLineage {
  chainRoot: Round;
  depth: number;
  total: number;
}

/**
 * Returns lineage info for a round when it is a re-vote (i.e. has a
 * `parentRoundId`). Returns `null` for first rounds, standalone rounds,
 * cycles, or when the chain references a missing round — callers treat
 * `null` as "no breadcrumb" (issue #111, AC#3, AC#6).
 *
 * Pure function — no side effects, derived live from the rounds array.
 * Cross-consumer (mobile client + CLI) so behavior stays identical.
 */
export function resolveRoundLineage(
  roundId: string,
  allRounds: readonly Round[],
): RoundLineage | null {
  const byId = new Map<string, Round>();
  for (const r of allRounds) byId.set(r.id, r);

  const target = byId.get(roundId);
  if (target === undefined) return null;
  if (target.parentRoundId === undefined) return null;

  // Walk up to root, guarding cycles and missing parent refs.
  const visited = new Set<string>([target.id]);
  let cursor: Round = target;
  let depth = 1;
  while (cursor.parentRoundId !== undefined) {
    const parent = byId.get(cursor.parentRoundId);
    if (parent === undefined) return null;
    if (visited.has(parent.id)) return null;
    visited.add(parent.id);
    cursor = parent;
    depth += 1;
  }
  const chainRoot = cursor;

  // Index children by parent for descendant BFS.
  const childrenByParent = new Map<string, Round[]>();
  for (const r of allRounds) {
    if (r.parentRoundId === undefined) continue;
    const list = childrenByParent.get(r.parentRoundId);
    if (list === undefined) childrenByParent.set(r.parentRoundId, [r]);
    else list.push(r);
  }

  // BFS descendants from root. Each round has at most one `parentRoundId`,
  // so descendants form a tree — no revisit-guard needed beyond the
  // parent-chain cycle check above.
  let total = 0;
  const queue: Round[] = [chainRoot];
  while (queue.length > 0) {
    const node = queue.shift() as Round;
    total += 1;
    const children = childrenByParent.get(node.id);
    if (children !== undefined) queue.push(...children);
  }

  return { chainRoot, depth, total };
}
