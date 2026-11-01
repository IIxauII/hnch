# Comments

How to comment code in every package. Reviewers apply this; no lint rule checks it.

- **Say what the code cannot.** Write a comment for units, invariants, side effects, what throws, and the reason behind a choice that is not obvious. Leave out anything the name and signature already say.
- **JSDoc follows the same rule.** No JSDoc that restates the identifier. An undocumented member is better than a restated one.
- **No banner rule lines** (`// -----`, `/* --- */`, `// ── x ──`), whatever the file size. If a long file needs a section marker, use one plain `// Title` line. A file that leans on banners to be navigable is a candidate for splitting.
- **Cite an ADR by ID** (`ADR-0036`) only where the code exists because of that decision.
- **Refer to issues and PRs as `(#N)`.** Not `issue #N` or `PR #N`.
- **A TODO names its issue:** `// TODO(#N): …`. A TODO without one is not added.
- **No plan-phase or acceptance-criteria IDs** (`Phase 2`, `AC-16`, `plan §3.8`). Plans live outside the repo, so those IDs stop meaning anything. Write the reason itself.
- **Tests:** the convention covers new and touched test code. Old test prose is not swept separately.

```ts
// Bad: restates the name, carries a plan ID.
/** Whether this client is the host (Phase 2). */
isHost(): boolean;

// Good: states an invariant the type cannot (packages/shared/src/doc.ts).
/** Who wrote `leftAt` (own id: leave, host's id: kick). Set exactly when `leftAt` is set. */
removedBy?: string;
```
