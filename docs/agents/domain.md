# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: one glossary at the root, one ADR directory at the root.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root — the domain glossary.
- **`adr/`** (note: root-level, _not_ `docs/adr/`) — read the ADRs that touch the area you're about
  to work in. Where a skill says `docs/adr/`, it means `adr/` here; never create `docs/adr/`. Filenames are `NNNN-kebab-title.md`; `adr/0000-template.md` is the template.
- **`adr/README.md`** — authoritative for when an ADR is required, immutability / superseding rules,
  and conventions. Read it before writing or amending any ADR.

The repo also carries product docs that are authoritative in their own lanes — `docs/project.md`
(what the product is), `docs/schema.md` (Yjs doc shape), `docs/ux.md` (user flows). Consult them when
the topic falls in one of those lanes; `GLOSSARY.md` remains the naming authority.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── GLOSSARY.md                ← domain glossary
├── adr/
│   ├── README.md              ← ADR conventions (read first)
│   ├── 0000-template.md
│   ├── 0001-networking-crdt-over-relay.md
│   └── …
├── docs/
│   ├── project.md  schema.md  ux.md  roadmap.md
│   └── agents/                ← this directory
└── packages/
    ├── cli/  client/  relay/  shared/  e2e/
```

Despite the pnpm workspace layout, packages do **not** carry per-package `GLOSSARY.md` or ADR
directories. All decisions are system-wide and live in `adr/`. If a package's vocabulary ever
genuinely diverges, that's the signal to reconsider a `GLOSSARY-MAP.md` — until then, one glossary.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a
test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly
avoids — each entry lists its `_Avoid_` set.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language
the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0009 (access control via relay tokens), but worth reopening because…_

ADRs are immutable once accepted — a changed decision is a **new, superseding** ADR, never an edit
to the old one. The `adr-writer` agent drafts new and superseding ADRs following those conventions.
