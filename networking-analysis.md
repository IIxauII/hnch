# hnch — Networking Architecture: P2P vs. Authoritative Server

A pros/cons review of the current "P2P-style CRDT over relay" architecture, with a recommendation.

## What the current design actually is

Worth naming this clearly upfront, because it changes the conversation: hnch as designed is **not** pure peer-to-peer. It's a **CRDT-synchronized client architecture with a stateless relay**. Specifically:

- **y-websocket relay** (self-hosted Node) is the *primary* sync path. Every client connects to it; it forwards Yjs updates to other connected clients in the same room. It holds no state.
- **WebRTC direct** is *opportunistic and v2* — used where supported (and `project.md` already acknowledges it's unreliable on iOS WKWebView).
- **Yjs CRDTs** mean every client has a full local replica and the relay never needs to interpret messages.

The "no central server" branding is therefore a bit aspirational. There *is* a server — it's just thin and stateless. That's an important distinction because most of the criticism aimed at "P2P" really targets WebRTC mesh topology and consensus problems, several of which the relay design already sidesteps.

## Pros of the current approach

**Server cost and operational simplicity are genuinely low.** A stateless WebSocket relay forwarding Yjs binary diffs for ≤20 concurrent peers per room is trivial to run. It scales horizontally without coordination, has no database, no auth, no per-user state. One small VM or container can handle a lot of rooms.

**Privacy posture is excellent.** Vote payloads pass through the relay as opaque CRDT updates. The server doesn't know who voted what, can't index session content, and has no PII to leak or comply about. For a tool sold partly on "no account required," this is coherent.

**Offline and reconnect behavior is essentially free.** Yjs handles partition recovery, late-joiner sync, and divergent edits without you writing reconciliation code. For a tool people use on flaky conference Wi-Fi, this is real value — reconnects just work.

**No accounts means no auth surface.** Nothing to phish, no password reset flow, no GDPR data subject requests. The whole identity-and-access stack collapses to "pick a nickname."

**Bounded participant count keeps the worst P2P problems hypothetical.** A 20-person cap means even if WebRTC mesh did light up, you have at most 190 pairwise connections per session — manageable, and the cap is enforced architecturally.

**The CRDT model fits the domain.** Planning poker is short-lived, low-throughput, eventually-consistent collaboration. There's no integrity-critical operation that needs strict ordering (votes are independently submitted and revealed once; you don't need a global lock).

## Cons and legitimate concerns

**"Stateless relay" is fragile when everyone disconnects.** If all peers leave a room and one returns later, there's no canonical state to rehydrate from — only what's in local IndexedDB/SQLite. If a participant joined yesterday on phone A and rejoins today on phone B, they get a stale or empty session. You can paper over this (a "host snapshot" persisted to the relay, an opt-in server-side store), but each fix erodes the stateless purity.

**Host migration is harder than the doc implies.** CRDTs solve *data convergence*, not *role authority*. Who owns the timer countdown? Who is allowed to trigger the reveal in manual mode? Who admits an invite-only joiner? These are decisions, not state, and you need a deterministic election protocol so two peers don't both think they're host after a partition. This is solvable (lowest peer ID wins, lease-based ownership, etc.) but it's real protocol work, not a free side effect of Yjs.

**Timer authority is genuinely awkward.** Each peer has its own clock. Whose countdown is canonical? If the host's tab is throttled by the browser, does the timer drift? With an authoritative server, the timer is a server-side scheduled event broadcast to all peers — trivial. P2P requires either (a) trust the host's clock and broadcast tick events, (b) all peers compute against an agreed start timestamp, or (c) accept some drift. (c) is probably fine for planning poker, but it's a quality concession.

**Vote integrity has no enforcement.** Any peer with a debugger can write whatever they want into the shared Yjs doc, including votes attributed to other participants. The doc already flags vote signing as a deferred future consideration. For a low-stakes internal tool this is fine; the moment anyone uses it for anything that matters (estimation tied to compensation, vendor bidding, etc.), it's a hole. An authoritative server gates vote writes per session-token and this problem disappears.

**WebRTC adds disproportionate complexity for marginal gain.** STUN works most of the time; restrictive corporate firewalls require TURN; TURN servers cost money to operate (bandwidth, not compute); TURN-over-TCP is needed where UDP is blocked. For 20 peers exchanging short text payloads, the latency savings of direct WebRTC over a relay are probably <50ms — imperceptible for a tool where humans take seconds to vote. The current plan correctly defers this, but it's worth being explicit that WebRTC may never be worth shipping.

**iOS WKWebView is an ongoing headache.** Already acknowledged in the doc. y-webrtc unreliability there is the canary — Apple's WebView restrictions are the kind of thing that quietly worsens over OS releases. Capacitor doesn't fully insulate you. Any "P2P everywhere" promise has an asterisk on iOS.

**Observability and debuggability are weaker.** When a user reports "the reveal didn't happen for me," there are no server logs to grep. You're reliant on client-side telemetry (which conflicts with the privacy posture) or asking users to reproduce. Stateful servers give you an authoritative record; CRDTs give you N possibly-divergent records.

**The "no server" pitch is half-true.** You still operate a relay (Node.js, deployment, monitoring, uptime, DDoS protection, TLS certs, etc.). For users this is invisible; for you the operator, the operational burden is much closer to "you run a server" than "you don't." This isn't a reason not to do it, but it should temper any marketing copy that leans on "serverless."

**Late-joiner sync cost.** A new joiner downloads the full Yjs doc state from a peer. For a long session with many rounds and metadata, this grows. Yjs is efficient (binary diffs, GC), but it's not zero, and there's no server-side snapshot to bootstrap from unless you add one.

**Browser connection caps and battery.** Less acute at 20 peers than at 100, but maintaining many WebSocket/WebRTC connections drains mobile batteries and runs into per-origin connection limits in some browsers. Relay-only mostly avoids this; mesh WebRTC reintroduces it.

## The alternative: thin authoritative server

For comparison, the other path is a small Node/Go server that owns session state authoritatively. Clients send intent ("I vote 5"), server broadcasts state changes. Roughly:

The wins are: simpler timer (server-side `setTimeout`), simpler reveal authority, simpler late-join (server snapshot), simpler host migration (server *is* the host, kind of), enforceable vote integrity, real audit logs, easier rate limiting, and dramatically simpler client code (no CRDT merge logic to reason about).

The losses are: the server now has session content in memory (privacy regression — though mitigable by ephemeral in-memory state and no persistence), the offline story gets worse (you can't vote while disconnected because the server is the source of truth), and you've taken on real per-session compute and state.

For planning poker specifically, the offline regression matters less than it sounds. People estimate together, in a meeting, with connectivity. Truly offline planning poker is a rare scenario.

## Recommendation

**Keep the Yjs + y-websocket relay core. Drop "P2P" from the marketing and the mental model. Defer or quietly kill WebRTC direct.**

Concretely:

The CRDT-over-relay design is a good fit for the domain *if* you stop treating it as a stepping stone toward "real" P2P and start treating it as the destination. Most of the elegance — privacy, offline tolerance, simple stateless server, no accounts — comes from the CRDT layer, not from WebRTC. WebRTC is what causes the iOS pain, the TURN cost, the mesh complexity, and the operational opacity. Removing it from the roadmap (or marking it permanently experimental) sheds most of the legitimate concerns without sacrificing the things that make the design appealing.

Two specific changes I'd make to the plan:

First, **re-frame the relay as a first-class component, not a fallback.** Update `project.md` to describe the architecture as "real-time CRDT sync via lightweight relay, with privacy by design (server holds no session content)" rather than "P2P with relay fallback." This is honest and avoids over-promising. The principle "Local-first / P2P — no central server required" should become "Local-first sync — clients hold the canonical state."

Second, **add a small concession to the relay: optional ephemeral room snapshots.** When a room goes empty, the relay holds the last Yjs state in memory (or briefly on disk) for, say, 24 hours. Returning peers rehydrate from it. This breaks "pure stateless" but solves the "everyone left and came back" problem at very low cost and with no real privacy loss (the data is the same opaque CRDT blob the relay was forwarding anyway).

If you find yourself needing strong vote integrity, server-side timer authority, or audit logs *later* — for example, if a customer says "we want to use this for sprint commitment ceremonies and need a record" — that's the trigger to migrate to authoritative server, not before. Build the simpler thing first; the migration later is mechanical (Yjs doc shape maps cleanly to a relational schema).

The one scenario where I'd push you toward authoritative server *now* is if you anticipate selling this into regulated industries or larger orgs where the lack of audit trail and vote enforcement is a deal-breaker. For an indie / open-source / SMB-focused tool, the current direction is the right one.

## TL;DR

The current design isn't really P2P — it's a CRDT app with a stateless relay and an aspirational WebRTC layer. The CRDT-over-relay part is a genuinely good fit for planning poker. The WebRTC part is where most of the legitimate "P2P concerns" actually live, and it's also the part of the design that's most reasonable to drop. Keep the core, lose the WebRTC ambition, soften the "no server" framing, and add a tiny ephemeral snapshot to handle the empty-room-rejoin case.
