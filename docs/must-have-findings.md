Planner did deep codebase audit. Here's what's missing:

  Must-have (in spec, not built)

  ┌─────┬─────────────────────────────────────────────┬────────────┬──────────────────────────────────────────────┐
  │  #  │                     Gap                     │   Where    │                  Complexity                  │
  ├─────┼─────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────┤
  │ e   │ "End session for everyone" (host action)    │ Both       │ Medium — new doc mutation + relay handling + │
  │     │                                             │            │  both UIs                                    │
  ├─────┼─────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────┤
  │ g   │ Participant cap (20)                        │ Relay +    │ Low — relay counts connections, rejects at   │
  │     │                                             │ both       │ 20                                           │
  ├─────┼─────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────┤
  │ p   │ Phase 6b: native iOS build, universal       │ Mobile     │ Large — tracked in roadmap                   │
  │     │ links, SQLite                               │            │                                              │
  └─────┴─────────────────────────────────────────────┴────────────┴──────────────────────────────────────────────┘

  Nice-to-have (meaningful improvement)

  ┌─────┬────────────────────────────────────────────────┬─────────────┬───────────────────────────────────────────┐
  │  #  │                      Gap                       │    Where    │                Complexity                 │
  ├─────┼────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────┤
  │ a   │ Round title input on CLI                       │ CLI         │ Low — prompt before newRound()            │
  ├─────┼────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────┤
  │ c   │ Missing builtin scales (Modified Fibonacci,    │ Shared      │ Trivial — add constants                   │
  │     │ time-based)                                    │             │                                           │
  ├─────┼────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────┤
  │ h   │ Viewer/voter role switching                    │ Both +      │ Medium — schema change, both UIs,         │
  │     │                                                │ schema      │ auto-reveal logic                         │
  ├─────┼────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────┤
  │ l   │ Voted-participants popover (tap avatar row →   │ Mobile      │ Low                                       │
  │     │ details)                                       │             │                                           │
  ├─────┼────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────┤
  │ n   │ Clipboard/markdown export of results           │ Both        │ Low-medium                                │
  ├─────┼────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────┤
  │ o   │ Re-vote lineage display (parentRoundId chain)  │ Both        │ Low                                       │
  ├─────┼────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────┤
  │ j   │ "Reconnecting..." banner                       │ Both        │ Low                                       │
  ├─────┼────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────┤
  │ b   │ Round description/ticketId UI (schema          │ Both        │ Low-medium                                │
  │     │ supports, no UI)                               │             │                                           │
  ├─────┼────────────────────────────────────────────────┼─────────────┼───────────────────────────────────────────┤
  │ q   │ Offline support (project.md requires, nothing  │ Both        │ Medium-high                               │
  │     │ built)                                         │             │                                           │
  └─────┴────────────────────────────────────────────────┴─────────────┴───────────────────────────────────────────┘

  Stretch

  ┌─────┬────────────────────────────────────────────────────────────────┬────────┬────────────────────┐
  │  #  │                              Gap                               │ Where  │     Complexity     │
  ├─────┼────────────────────────────────────────────────────────────────┼────────┼────────────────────┤
  │ d   │ ? unsure card (removed by ADR-0019, project.md still mentions) │ Both   │ Trivial if decided │
  ├─────┼────────────────────────────────────────────────────────────────┼────────┼────────────────────┤
  │ m   │ Consensus celebration (deferred per ux.md)                     │ Both   │ Low                │
  ├─────┼────────────────────────────────────────────────────────────────┼────────┼────────────────────┤
  │ k   │ Card press scale animation                                     │ Mobile │ Trivial CSS        │
  └─────┴────────────────────────────────────────────────────────────────┴────────┴────────────────────┘

  Doc sync issues found

  - project.md lists 6 builtin scales → only 5 exist (Modified Fibonacci + 2 time-based never added)
  - project.md says "all presets include ?" → ADR-0019 removed sentinels
  - Viewer/voter roles described in project.md but no schema/UI anywhere
