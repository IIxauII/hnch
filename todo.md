# hnch — TODO

## Phase 1: Foundation
- [ ] Architecture design — folder structure, data models (Yjs doc schema), component layout, service layer, sync/signaling integration
- [ ] Project scaffolding — `ionic start` with Angular, configure Capacitor, install Yjs + dependencies
- [ ] y-websocket signaling/relay server setup (Node.js)

## Phase 2: Core Features
- [ ] Identity — nickname setup on first launch, device ID, color/avatar assignment
- [ ] Session creation — host creates session, configures scale + reveal mode + timer
- [ ] Joining — shareable link, room code, QR code
- [ ] Voting — card selection, vote submission, reveal (auto/manual), re-vote
- [ ] Round management — metadata (title, description, ticket ID), round history
- [ ] Round analytics — distribution visualization, average, median, outlier flagging, time to vote
- [ ] Participant management — voter/viewer role switching, connection status indicators
- [ ] Host migration — automatic ownership transfer on host disconnect

## Phase 3: Persistence & Offline
- [ ] Local storage — Capawesome SQLite (native), y-indexeddb (PWA)
- [ ] Offline mode — UI interaction without connectivity, sync on reconnect
- [ ] Session persistence — survive reloads, reconnections, app restarts

## Phase 4: Access Control & Polish
- [ ] Password-protected sessions
- [ ] Invite-only sessions
- [ ] Export — clipboard + markdown
- [ ] Custom estimation scales
- [ ] WCAG AAA accessibility audit + custom theming
- [ ] Dark/light mode (system preference)

## Phase 5: Enhanced Connectivity (v2)
- [ ] WebRTC direct P2P where supported
- [ ] Nearby discovery — Bluetooth, NFC, mDNS
- [ ] Vote signing via device keys (future consideration)
