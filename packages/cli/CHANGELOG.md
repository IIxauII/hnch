## [1.2.1](https://github.com/IIxauII/hnch/compare/cli-v1.2.0...cli-v1.2.1) (2026-05-01)


### Bug Fixes

* **cli:** correct relay-url scheme in usage docblock ([#66](https://github.com/IIxauII/hnch/issues/66)) ([4835104](https://github.com/IIxauII/hnch/commit/4835104ea43c069072d3b1f41a92e8ae1b79871a))
* **client:** drop stale phase-history docblock from jump-back-in-banner ([#67](https://github.com/IIxauII/hnch/issues/67)) ([1935baa](https://github.com/IIxauII/hnch/commit/1935baad1c0d10ad80aaecb14743c51216e97f37))
* **infra:** add openssh-client to self-hosted runner image ([#64](https://github.com/IIxauII/hnch/issues/64)) ([192c4f1](https://github.com/IIxauII/hnch/commit/192c4f1d40cebebd5c5d14b974290436a7a1a23c))
* **infra:** bake gh CLI into self-hosted runner image ([#63](https://github.com/IIxauII/hnch/issues/63)) ([0f59d1c](https://github.com/IIxauII/hnch/commit/0f59d1cb4135b4fcf5fa171b005c28e36a7f478b))
* **relay:** correct stale entry-point docblock ([#62](https://github.com/IIxauII/hnch/issues/62)) ([df1e4ea](https://github.com/IIxauII/hnch/commit/df1e4ea63a8534daba86ef08fc7c4e57c6a00c97))
* surface relay rejections on deep-link join ([#49](https://github.com/IIxauII/hnch/issues/49)) ([0f825b7](https://github.com/IIxauII/hnch/commit/0f825b724c513c27e4a12f3a2636c9dd0519fa20))


### Features

* **client:** collapse lobby participants accordion post-reveal ([#50](https://github.com/IIxauII/hnch/issues/50)) ([0a468b0](https://github.com/IIxauII/hnch/commit/0a468b0da5de870f011c28fc67342a30cabc571f))
* **client:** participant removal lifecycle (leave + host kick) ([#52](https://github.com/IIxauII/hnch/issues/52)) ([a15e3df](https://github.com/IIxauII/hnch/commit/a15e3df6c1c00bda3f1aac4ba32d24e2f49fc7fd))
* **client:** web QR scanning via plugin startScan + lazy polyfill ([#48](https://github.com/IIxauII/hnch/issues/48)) ([53f7e23](https://github.com/IIxauII/hnch/commit/53f7e236482e54c90a0c7c3794b8b218f0426e2f))

# [1.2.0](https://github.com/IIxauII/hnch/compare/cli-v1.1.2...cli-v1.2.0) (2026-04-30)


### Bug Fixes

* **ci:** runner health check uses dedicated read-only PAT ([#35](https://github.com/IIxauII/hnch/issues/35)) ([2693536](https://github.com/IIxauII/hnch/commit/2693536e215decaf1fee0dc92508291e42050910))
* **client:** auto-sync appVersion from package.json ([#37](https://github.com/IIxauII/hnch/issues/37)) ([72ac623](https://github.com/IIxauII/hnch/commit/72ac6239b4bacb74675e5d2cda991048724644d8))
* **client:** bump appVersion to current package version ([#20](https://github.com/IIxauII/hnch/issues/20)) ([d781b07](https://github.com/IIxauII/hnch/commit/d781b07913ec88a61f6bb8f863a7ffd7ba301cbc))
* **client:** close ionic dynamic-import lint bypass ([#18](https://github.com/IIxauII/hnch/issues/18)) ([aaffaa0](https://github.com/IIxauII/hnch/commit/aaffaa0b2fd2a2000b2e4812ab5d12ebf6025d56))
* correct repo owner refs from xau/hnch to IIxauII/hnch ([#32](https://github.com/IIxauII/hnch/issues/32)) ([f70d417](https://github.com/IIxauII/hnch/commit/f70d417ae956807a95fd9819677483c7ecc8d49f))
* **infra:** chown /var/www to deploy in bootstrap ([#21](https://github.com/IIxauII/hnch/issues/21)) ([f448dbc](https://github.com/IIxauII/hnch/commit/f448dbced96d63b83fa934da6165d6b26b507655))
* **infra:** chown /var/www to deploy in bootstrap ([#22](https://github.com/IIxauII/hnch/issues/22)) ([1aa73aa](https://github.com/IIxauII/hnch/commit/1aa73aa040ac88db076486d103f82adcd53b058c))
* **runner:** macOS-portable install + plist PATH + flock-free lock ([#33](https://github.com/IIxauII/hnch/issues/33)) ([025a259](https://github.com/IIxauII/hnch/commit/025a2591930129d38bddef4d30855c687971156b))


### Features

* **cli:** end-session menu, share clipboard, voting settings ([#41](https://github.com/IIxauII/hnch/issues/41)) ([f929c26](https://github.com/IIxauII/hnch/commit/f929c26393460b08af94b091eddfb509e938f31b))
* **client:** URL-parameterized in-session routes + session resume ([#23](https://github.com/IIxauII/hnch/issues/23)) ([eec01a6](https://github.com/IIxauII/hnch/commit/eec01a691cf314b09dce34025691ce2c856c0631))
* **client:** wire PWA prod deploy to hnch.dev VPS ([#17](https://github.com/IIxauII/hnch/issues/17)) ([0f3ef64](https://github.com/IIxauII/hnch/commit/0f3ef64bbf8dfd0083a3e8783bb718b0dafec02d))

## [1.1.2](https://github.com/IIxauII/hnch/compare/cli-v1.1.1...cli-v1.1.2) (2026-04-28)


### Bug Fixes

* **cli:** default relay URL to https:// (fixes 'fetch failed' on hnch create) ([#15](https://github.com/IIxauII/hnch/issues/15)) ([f1d2be4](https://github.com/IIxauII/hnch/commit/f1d2be47b4b9166e2cec619b35ba01974f6f038b))

## [1.1.1](https://github.com/IIxauII/hnch/compare/cli-v1.1.0...cli-v1.1.1) (2026-04-28)


### Bug Fixes

* **cli:** rename to @xauyxau/hnch (npm rejected unscoped name) ([#13](https://github.com/IIxauII/hnch/issues/13)) ([34555dd](https://github.com/IIxauII/hnch/commit/34555ddba3d068dc6640ed6e8752b10adfe06094))

# [1.1.0](https://github.com/IIxauII/hnch/compare/cli-v1.0.0...cli-v1.1.0) (2026-04-28)


### Bug Fixes

* **ci:** reorder semantic-release rules so scoped commits release ([#7](https://github.com/IIxauII/hnch/issues/7)) ([a5bdbf3](https://github.com/IIxauII/hnch/commit/a5bdbf38d4b14224a9207d2f9faf1467a2e790da))
* **infra:** drop MemoryDenyWriteExecute from relay systemd unit (V8 incompatibility) ([#11](https://github.com/IIxauII/hnch/issues/11)) ([b1c34d4](https://github.com/IIxauII/hnch/commit/b1c34d4de5eabb8c4936892e53aa514fbe1e75ef))


### Features

* **cli:** wire npm publish for @hnch/cli ([#12](https://github.com/IIxauII/hnch/issues/12)) ([6028946](https://github.com/IIxauII/hnch/commit/6028946a3f0a37da4dbf422b6f7837e8f3650cf5))
* **relay:** wire production deployment (ADR-0029) ([#6](https://github.com/IIxauII/hnch/issues/6)) ([ed47efe](https://github.com/IIxauII/hnch/commit/ed47efe93d734471d8ca470d0f09c17da4b15ad0))
