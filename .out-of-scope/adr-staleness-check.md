# ADR staleness check

hnch has no automated check that warns when an ADR stays `Proposed` for too long.

## Why this is out of scope

ADRs 0021 to 0029 once sat in `Proposed` after their code had shipped. That was fixed once (#38) and has not recurred: at the time of this decision every one of the 47 numbered ADRs is `Accepted` or `Superseded`. A script or CI step that scans `adr/*.md` for a `Proposed` status older than 30 days would guard a problem with no current instance, and it would need upkeep each time the status line or the template changes.

The existing controls are enough:

- `adr/README.md` defines when an ADR is required and how it moves from `Proposed` to `Accepted`.
- The `protect-accepted-adrs` hook blocks edits to accepted ADRs, so status changes are deliberate.
- A PR that lands code for a `Proposed` ADR is expected to flip the status in the same PR, and code review catches a miss.

If `Proposed` ADRs start piling up again, this decision can be revisited with that evidence.

## Prior requests

- #610: "Warn when an ADR stays Proposed past 30 days"
