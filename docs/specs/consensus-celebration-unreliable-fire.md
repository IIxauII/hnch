# Consensus celebration fires unreliably on unanimous auto-reveal

**Status:** Draft
**Date:** 2026-05-23
**Source:** https://github.com/IIxauII/hnch/issues/310

## Problem

After the gravity-burst rework shipped in #308, the consensus celebration overlay rarely fires after a unanimous reveal. "Most reveals = no animation … occasionally fires." Reproduces on current `origin/main` (post-#308, client v1.36.0).

This contradicts the fix shipped in #293, which armed the overlay for the live first-reveal transition. The new gravity-burst implementation appears to have regressed the trigger reliability — the celebration intermittently fails to mount on the unanimous auto-reveal path even though all online voters cast the same value.

Likely cause per the issue: timing / signal-effect ordering between the projection update (round transitions to revealed + consensus computed) and the overlay mount in `vote-results.component.ts` / `celebration.service.ts`. The bug is intermittent, which rules out a pure logic error and points at a race.

## Current behavior

Visual baseline (post-#308 celebration on `main`):

- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/reveal/reveal-02-post-reveal-lobby.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/reveal/reveal-01-pre-reveal-estimating.png?raw=true

In the bad case, the post-reveal lobby renders results + history with no overlay, no emoji burst, no "hnch'd!" badge — same visual as a non-consensus reveal.

## Users

All participants in a room — voter, host, viewer — when an **unanimous auto-reveal** fires. Reporter tested only as host but the trigger is shared, so every connected peer is presumed affected. Manual host-tap reveal path is out of scope for this spec (not reported as broken).

## Proposed behavior

When all online voters submit the same value and the unanimous auto-reveal fires, every connected participant sees the consensus celebration on the live transition — every time, not intermittently. The gravity-based emoji burst, "hnch'd!" badge, dim scrim, click-to-dismiss, ~3 s auto-dismiss, and `prefers-reduced-motion` fallback all behave as shipped in #308. No visual changes — this spec is a reliability fix only.

A late joiner (reload, or join-after-reveal inside the celebration window) continues to see the overlay as before. Non-consensus reveals continue to show no overlay.

## Success criteria

- The consensus celebration overlay fires on **every** unanimous auto-reveal, observed across at least 10 consecutive repros in a 2-voter room. No more "occasionally fires."
- Trigger reliability holds for both the reveal-actor's own client and other connected peers (verify with two browsers / one mobile + one CLI).
- Late-join / reload behavior unchanged — overlay still appears for a peer that connects after reveal while the round is still inside the celebration window.
- Non-consensus reveals show no overlay (no false-positive regression).
- Existing `prefers-reduced-motion` path unchanged.
- Existing screenshot scenes under `reveal/consensus-*` continue to capture the overlay rendered (no blank post-reveal captures).
- No visible change to overlay styling, emoji burst physics, badge text, dismiss timing, or scrim behavior from the #308 shipped look.

## Scope

**In:**
- Diagnose and fix the timing / signal-effect ordering race that prevents the overlay from mounting on the live unanimous auto-reveal transition.
- Regression coverage that fails before the fix and passes after (unit and/or e2e — `/plan` decides shape).

**Out (explicit anti-goals):**
- Any visual change to the celebration (badge, emoji, scrim, animation curves, durations).
- Manual host-tap reveal trigger reliability (not reported broken).
- Non-consensus reveal effects.
- Re-litigating the gravity-burst design from #308.

## Open questions

- Is the race in `celebration.service.ts` (effect ordering vs. projection signal) or in `vote-results.component.ts` (conditional render vs. mount lifecycle), or in the projection layer feeding both? `/plan` should reproduce with devtools open and pinpoint which branch short-circuits before choosing a fix.
- Does the bug correlate with reveal source — host's own auto-reveal vs. observing another peer's auto-reveal? Reporter only tested host-side.
- Does the bug correlate with the number of voters (2 vs. 3+) or specific scales?

## ADR impact

None — pure client bug fix. No change to the Yjs schema, reveal protocol (ADR-0018), or any other ADR. If the root cause turns out to require restructuring the celebration signal source (e.g. moving from a derived signal to an explicit event), `/plan` should flag that and revisit — but the default assumption is no ADR.

## References

- Issue: https://github.com/IIxauII/hnch/issues/310
- Prior fix (first-reveal arm): #293 (`fbc638d`)
- Gravity-burst rework: #308 (`6ab2a3a`)
- Adjacent spec (visual/scope fix, already shipped): `docs/specs/celebration-overlay-fix.md`
- ADR-0018 — manual reveal + unanimous auto-reveal

## Screenshot scope (suggested)

Reveal scenes already exist (`reveal/consensus-*`). `/plan` should consider whether a new tag is needed or whether asserting the existing consensus capture renders the overlay (rather than the blank post-reveal lobby) is enough.
