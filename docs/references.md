# External references

Canonical AI-oriented and best-practices resources for the technologies used in hnch. Point Claude and other AI assistants at these when you want them to match the conventions of the upstream projects; cite them in review when a judgment call is contested.

Only resources verified to exist (via search or direct fetch) are listed. Where no good resource exists, see the [Gaps](#gaps) section — those are the places a project-local house-rules file (like `angular.md`) earns its keep.

## Angular

- [LLM prompts and AI IDE setup](https://angular.dev/ai/develop-with-ai) — the Angular team's official guidance for feeding AI tools Angular-aware context. Links to the `best-practices.md` file that `angular.md` in this repo is adapted from. Source: Angular team (official).
- [llms-full.txt](https://angular.dev/context/llm-files/llms-full.txt) — compiled Angular context as a single file, intended to be attached as system instructions. Source: Angular team (official).
- [Design patterns with AI](https://angular.dev/ai/design-patterns) — patterns for building Angular apps that interact with LLMs. Source: Angular team (official).

## TypeScript

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) — the most widely-cited TypeScript style guide. Notable rules: `const`-by-default, forbid `@ts-ignore`, treat `as` casts and `!` assertions as unsafe. Source: Google (official; Google-internal sections removed).
- [ts.dev/style](https://ts.dev/style/) — mirror/maintained version of the Google TS style guide.

## Yjs and y-websocket

- [docs.yjs.dev](https://docs.yjs.dev) — primary docs. The README + demos are still the best starting point per the maintainers.
- [Awareness protocol](https://docs.yjs.dev/api/about-awareness) — how presence/cursor data propagates. Relevant to the host-election and peer-presence concerns in ADR-0010.
- [y-websocket docs](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket) — the provider hnch's relay implements. Describes the client-server model, cross-tab broadcast, and default 30s awareness heartbeat.
- [yjs/y-websocket on GitHub](https://github.com/yjs/y-websocket) — reference server implementation. Read the source when extending the relay.

## Capacitor and plugin ecosystem

- [Capacitor docs](https://capacitorjs.com/docs) — the core docs. No official `llms.txt` at the time of this audit.
- [Capawesome llms.txt](https://capawesome.io/llms.txt) — AI-oriented index for the Capawesome plugin ecosystem, which hnch uses for native SQLite (ADR-0004). Source: Capawesome team.

## Ionic

- [Ionic Framework docs](https://ionicframework.com/docs) — no official `llms.txt` (verified 404 on `ionicframework.com/llms.txt`). Standard docs only.

## pnpm workspaces

- [pnpm-workspace.yaml reference](https://pnpm.io/pnpm-workspace_yaml) — workspace root config. Authoritative for include/exclude patterns.
- [pnpm settings](https://pnpm.io/settings) — full list of configurable settings.

## Gaps

No AI-oriented / best-practices resource confirmed for:

- **Ionic** — core framework. The 404 on `ionicframework.com/llms.txt` means there's no official AI context file. A project-local `ionic.md` (or a section in `angular.md`) covering slot usage, platform checks, safe-area handling, and the navigation/Angular-router split would be the highest-leverage fill.
- **Capacitor** (core framework, as distinct from Capawesome's plugin ecosystem) — no `llms.txt` on `capacitorjs.com` visible in search. Plugin lifecycle, platform detection, and permission prompts are the patterns most worth encoding locally.
- **Yjs coding patterns** — the docs are good prose, but there is no "rules" file equivalent to Angular's. Conventions worth encoding locally: shared-type selection per schema field (cross-ref `schema.md`), transaction grouping, awareness-vs-doc-state boundaries, undo-manager scope. Candidate file: `yjs.md`.
- **Node / y-websocket relay patterns** — no canonical resource; the relay's "content-blind" invariant (ADR-0003) and auth-token rules (ADR-0009) need to be expressed as coding rules, not just architecture. Candidate file: `relay.md`.
- **Cross-package testing conventions** — no shared external resource covers Yjs-flavored tests (simulated peers, deterministic clocks, convergence assertions). Candidate file: `testing.md`.

## Maintenance note

External docs drift. Re-verify this list when onboarding a new contributor or at each major version bump of a listed technology. If a link 404s, either update it or move it to a `Removed` section with a date — don't silently delete (future readers will wonder where it went).
