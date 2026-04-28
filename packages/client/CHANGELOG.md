## [1.1.2](https://github.com/IIxauII/hnch/compare/client-v1.1.1...client-v1.1.2) (2026-04-28)


### Bug Fixes

* **client:** bump appVersion to current package version ([#20](https://github.com/IIxauII/hnch/issues/20)) ([d781b07](https://github.com/IIxauII/hnch/commit/d781b07913ec88a61f6bb8f863a7ffd7ba301cbc))

## [1.1.1](https://github.com/IIxauII/hnch/compare/client-v1.1.0...client-v1.1.1) (2026-04-28)


### Bug Fixes

* **client:** close ionic dynamic-import lint bypass ([#18](https://github.com/IIxauII/hnch/issues/18)) ([aaffaa0](https://github.com/IIxauII/hnch/commit/aaffaa0b2fd2a2000b2e4812ab5d12ebf6025d56))

# [1.1.0](https://github.com/IIxauII/hnch/compare/client-v1.0.0...client-v1.1.0) (2026-04-28)


### Bug Fixes

* **ci:** reorder semantic-release rules so scoped commits release ([#7](https://github.com/IIxauII/hnch/issues/7)) ([a5bdbf3](https://github.com/IIxauII/hnch/commit/a5bdbf38d4b14224a9207d2f9faf1467a2e790da))
* **cli:** default relay URL to https:// (fixes 'fetch failed' on hnch create) ([#15](https://github.com/IIxauII/hnch/issues/15)) ([f1d2be4](https://github.com/IIxauII/hnch/commit/f1d2be47b4b9166e2cec619b35ba01974f6f038b))
* **cli:** rename to @xauyxau/hnch (npm rejected unscoped name) ([#13](https://github.com/IIxauII/hnch/issues/13)) ([34555dd](https://github.com/IIxauII/hnch/commit/34555ddba3d068dc6640ed6e8752b10adfe06094))
* **infra:** drop MemoryDenyWriteExecute from relay systemd unit (V8 incompatibility) ([#11](https://github.com/IIxauII/hnch/issues/11)) ([b1c34d4](https://github.com/IIxauII/hnch/commit/b1c34d4de5eabb8c4936892e53aa514fbe1e75ef))


### Features

* **client:** wire PWA prod deploy to hnch.dev VPS ([#17](https://github.com/IIxauII/hnch/issues/17)) ([0f3ef64](https://github.com/IIxauII/hnch/commit/0f3ef64bbf8dfd0083a3e8783bb718b0dafec02d))
* **cli:** wire npm publish for @hnch/cli ([#12](https://github.com/IIxauII/hnch/issues/12)) ([6028946](https://github.com/IIxauII/hnch/commit/6028946a3f0a37da4dbf422b6f7837e8f3650cf5))
* **relay:** wire production deployment (ADR-0029) ([#6](https://github.com/IIxauII/hnch/issues/6)) ([ed47efe](https://github.com/IIxauII/hnch/commit/ed47efe93d734471d8ca470d0f09c17da4b15ad0))

# 1.0.0 (2026-04-27)


### Bug Fixes

* auto-reconnect handles offline-mode and gates toast during navigation ([bf7697a](https://github.com/IIxauII/hnch/commit/bf7697a5bc71dcfc35d174a648affe76be99e1ef))
* **ci:** add @semantic-release/npm to bump package.json version on release ([#5](https://github.com/IIxauII/hnch/issues/5)) ([89de23f](https://github.com/IIxauII/hnch/commit/89de23f7c483e9dcbe665bfb9a73cabeafef478b))
* **e2e:** scope estimating chip/count selectors to active Ionic page ([739da35](https://github.com/IIxauII/hnch/commit/739da35426686c314c3302878ba8c435abf7fd49))
* **e2e:** stabilize three-client host-election tests ([17cfb02](https://github.com/IIxauII/hnch/commit/17cfb026a78bcaf4e5666770e8ffea8afb8a2653))
* exclude viewers from "X of Y voted" denominator ([3ae61e8](https://github.com/IIxauII/hnch/commit/3ae61e8b741163d215cc7d06ced2f221438e4560))
* improve CLI scale picker UX and preset override reactivity ([f6041c1](https://github.com/IIxauII/hnch/commit/f6041c1d82af3a58027638f1fc89185d378395fe))
* **jump-back-in:** preserve lastSession in e2e fixture; precheck unknown-room via GET /rooms ([e8639eb](https://github.com/IIxauII/hnch/commit/e8639eb9ce5c61d09c7a70d8376855dff2e04916))
* **lobby:** dismiss QR modal on Done via modal.dismiss() ([2440815](https://github.com/IIxauII/hnch/commit/24408153745870a91926448ebd2acd468f3a81a1))
* resolve tsc errors in test files and remove dead window hook ([09c8331](https://github.com/IIxauII/hnch/commit/09c83315ac577c4e7f60f882670d2b0ef32da0e2))


### Features

* a11y polish, muted stale banner, and audit-driven test coverage ([9bcd731](https://github.com/IIxauII/hnch/commit/9bcd731aad407c60f009b426d0b5e006835e7d4b))
* accessibility sweep (Phase 6a) ([dd44e1e](https://github.com/IIxauII/hnch/commit/dd44e1edd689f785d2de48809c5eab92e5e825b0))
* add `hnch resume` command for CLI session resume ([867db4b](https://github.com/IIxauII/hnch/commit/867db4b53d30cda3f7730a15547605f874784f7e))
* add CLI config defaults and host lobby settings panel ([0632215](https://github.com/IIxauII/hnch/commit/06322158622f056c59d48f51185ef830678835d2))
* add custom scale CRUD to CLI ScalePicker ([547da90](https://github.com/IIxauII/hnch/commit/547da90d5151a3fb85139b3664c7c36b807b5130))
* add default scale preference, unify scale picker component ([43e82a2](https://github.com/IIxauII/hnch/commit/43e82a29fe9c115afacb7578036f712af778d827))
* add end-session-for-everyone, auto-reconnect, reconnecting banner ([c869b8d](https://github.com/IIxauII/hnch/commit/c869b8d8a6f05966335d55af11d8a30889d81281))
* add full-screen QR display modal on Lobby (Phase 5.2) ([ef5749c](https://github.com/IIxauII/hnch/commit/ef5749cadb70b4365073abd841e21fed6f7ffeea))
* add host change notification to CLI and mobile ([b84aab5](https://github.com/IIxauII/hnch/commit/b84aab581992529a8ef76e28cb2429b963e45422))
* add leave confirmation prompt to CLI ([a9afd81](https://github.com/IIxauII/hnch/commit/a9afd81486a7083e8dabd62482fd0b0ac5a99eb1))
* add manual host handoff to CLI and mobile ([1418ef6](https://github.com/IIxauII/hnch/commit/1418ef6692fdac46020e6753fdf7117a5ce98dce))
* add mobile parity — room name edit, session defaults, relay URL override ([dee2e8f](https://github.com/IIxauII/hnch/commit/dee2e8f41b07afa91524a2a03249cbf4f3265e67))
* add participant cap, round titles, viewer/voter roles, consensus celebration ([c40adf5](https://github.com/IIxauII/hnch/commit/c40adf56a6e70fc6b680d5f4021d5f700fd8599c))
* add password-protected rooms (Phase 5, ADR-0017) ([67e9ffb](https://github.com/IIxauII/hnch/commit/67e9ffbde6985076127faf8a4aa0bd854448eed0))
* add QR scanner on Join page with auto-submit (Phase 5.3) ([fa4cc2c](https://github.com/IIxauII/hnch/commit/fa4cc2c6efd6689cda566b2c73af49c7c7a24e16))
* add scale customization — 5 presets, toggle cards, custom scales ([6f1ced8](https://github.com/IIxauII/hnch/commit/6f1ced884c2b974322b75cac79d82a35f5daf6eb))
* add ScalePicker with inline preset card editing to CLI settings ([6b93f56](https://github.com/IIxauII/hnch/commit/6b93f56ef1fb2afe300552516cbc7eff24ce4bb2))
* add Settings screen with theme picker + display name editor (Phase 6a) ([ee12d40](https://github.com/IIxauII/hnch/commit/ee12d400cc58ff1a52bcec0ac835c6fd226587f0))
* add staggered fade-in-up reveal animation (Phase 6a) ([8713787](https://github.com/IIxauII/hnch/commit/871378719319b46df8c8ab603852a3eb1fe5bdc3))
* auto-save custom scale editor, fix relay shutdown ([1ffb311](https://github.com/IIxauII/hnch/commit/1ffb3115b7cc830fbc092b897387df3966c9248a))
* centralize toasts behind ToastService matching ux.md spec ([55e38b5](https://github.com/IIxauII/hnch/commit/55e38b514da08fa26f29374461bfe300b6c5c049))
* **client:** nav polish for Phase 2 round loop ([8c472ca](https://github.com/IIxauII/hnch/commit/8c472ca697949aca23396301015ed573e822b40b))
* deep-link auto-submit and expired-room jump-back-in coverage ([782f843](https://github.com/IIxauII/hnch/commit/782f843b04523301f81c9b0aac3625a9bb02992e))
* expand /plan command with user journey, UX, and acceptance criteria phases ([e5c7d0e](https://github.com/IIxauII/hnch/commit/e5c7d0ebc9173eaa00d9fa0bf6f3b503ba686200))
* persist Yjs doc on PWA and toast on repeat unknown WS rejections ([5e2503c](https://github.com/IIxauII/hnch/commit/5e2503c1f679730cf1e1165c427e39f3b882d193))
* redesign CLI settings with Ink components and add access control ([06b4aec](https://github.com/IIxauII/hnch/commit/06b4aec6ed7d8c074f19801797853ccd83add303))
* remove timer, add unanimous reveal, lobby-centric results ([cef1671](https://github.com/IIxauII/hnch/commit/cef16712ad8eb65408f981430221c612dab1e66a))
* wire full haptic feedback map (Phase 6a) ([03c2367](https://github.com/IIxauII/hnch/commit/03c2367b2a2fc8ca7d9ae094c39e32d3f46044c7))
* wire Share invite + /join?code deep link (Phase 5.1) ([e393636](https://github.com/IIxauII/hnch/commit/e3936365649f89bcb143d5d5b5fe500d5169678e))
