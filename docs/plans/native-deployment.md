# Plan: Native iOS + Android Builds — Local + CI

**Estimate:** ~34 SP across 10 PRs.

## 1. Context

hnch ships only a PWA today. Goal: produce signed native iOS + Android artifacts on every `client-v*` semantic-release tag, delivered to TestFlight (iOS) and Play Internal Testing (Android), with the same build pipeline working locally on the dev box. Capacitor 8.3.1 is already in deps but unconfigured — `appId: 'io.ionic.starter'`, no `ios/`/`android/` projects, no `@capacitor/ios` / `@capacitor/android` packages, no SQLite plugin, and the native Yjs persistence branch in `doc.service.ts` is a no-op stub. CI currently has no macOS runner. The user is enrolled in Apple Developer Program; Google Play Console enrollment is deferred — Android signing/build land now, Play upload is gated until enrollment.

## 2. Locked Decisions (user-confirmed)

| # | Topic | Decision |
|---|---|---|
| 1 | Bundle ID / applicationId (both platforms) | `dev.hnch.hnch` |
| 2 | iOS distribution | TestFlight via App Store Connect API key |
| 3 | Android distribution | Play Internal Testing, **gated** until Console enrolled |
| 4 | iOS signing | fastlane **match** w/ private encrypted cert repo |
| 5 | iOS export method | `app-store` |
| 6 | Android keystore custody | GH Actions secrets (base64), generated now |
| 7 | SQLite plugin | `@capawesome-team/capacitor-sqlite` (ADR-0004 reconfirmed) |
| 8 | Yjs SQLite adapter | Custom — append-only update log + debounced merge |
| 9 | AASA + assetlinks files | Live at `packages/client/src/.well-known/`; shipped via Angular asset copy; deployed with `deploy-client.yml`; `hnch-web` needs a MIME override for the no-extension AASA file (the Caddyfile is gone, ADR-0054) |
| 10 | Universal/App Link scope | `/join` + `/join/*` only |
| 11 | Custom URL scheme | Skip (`hnch://` not added) |
| 12 | Android CI host | Existing Linux Podman pool + `actions/setup-java@v4` (JDK 21) |
| 13 | macOS CI runner | Tart ephemeral VMs on Mac mini M4 (1 VM concurrency) |
| 14 | Tart golden image | `ghcr.io/cirruslabs/macos-sequoia-xcode:latest` (Apache-2.0) + custom layer for pnpm/fastlane |
| 15 | XCUITests in CI verify | Skip; documented as gap in `docs/native-roadmap.md` |
| 16 | Asset generation | `@capacitor/assets` CLI |
| 17 | iOS Deployment Target | 14.0 |
| 18 | Android minSdk / targetSdk | 23 / 35 |
| 19 | Version-code source | Version = latest `client-v*` git tag; build# = `git rev-list --count <tag>` |
| 20 | ADR split | 3 ADRs — 0040 native build+dist, 0041 Tart runner, 0042 Universal/App Links |
| 21 | Native projects in git | `ios/`+`android/` committed; build artifacts gitignored |
| 22 | PR rollout | 10 PRs (PR1 scaffold → PR10 enable Play upload post-enrollment) |

## 2a. Worktree-Per-PR Strategy

Every PR in this rollout lives in its own git worktree under `../hnch-<name>/` via `pnpm worktree:add`. This is non-negotiable — Capacitor's `cap add ios`/`cap sync` mutate `ios/`+`android/` directories (CocoaPods install alone is ~500MB), so parallel work on `main` would cross-contaminate. Per-worktree port isolation (`CLIENT_PORT` / `RELAY_PORT` offsets in `.env.local`) lets multiple dev servers run side-by-side.

**Standing protocol for each PR below:**
```bash
git fetch origin                                 # critical: stale local main → worktree missing recent merges
pnpm worktree:add <name> main                    # creates ../hnch-<name>/, branches off main, assigns unique ports, pnpm install
cd ../hnch-<name>
# … do the work, commit, push, open PR …
# after PR merges:
cd /Users/xau/Documents/projects/hnch
pnpm worktree:remove <name>
git branch -D <name>                             # optional, if branch ref no longer needed
```

Worktree names per PR are listed in §9 (Rollout Order). Dependent PRs (e.g., PR6 needs PR4 merged) branch off `main` **after** the prerequisite merge — never off the prerequisite's branch.

The canonical, committed copy of this plan lives at `docs/plans/native-deployment.md` in the repo (created in PR1) so it's reviewable in PR diffs and survives across conversations.

## 3. High-level Architecture

```
git tag client-vX.Y.Z (semantic-release on Linux Podman pool)
    │
    ├─► deploy-client.yml   (Linux pool) → Angular www/ → hnch-web   [exists; ships /.well-known/ too]
    ├─► deploy-ios.yml      (macOS Tart) → cap sync ios → fastlane match → xcodebuild → .ipa → TestFlight
    └─► deploy-android.yml  (Linux pool) → cap sync android → gradle bundleRelease → signed .aab → Play Internal (gated)

CI verify (ci.yml):
    Linux pool   — vitest, lint, typecheck, e2e (chromium), PWA build           [exists]
    macOS Tart   — pod install + xcodebuild build CODE_SIGNING_ALLOWED=NO       [new; paths-filter gated]
    Linux pool   — ./gradlew assembleDebug                                       [new; paths-filter gated]

Native runtime stack:
    Angular www/ + .well-known/ → npx cap sync → ios/App + android/app
    iOS:     SQLite (Capawesome) on device, AASA universal-link → /join
    Android: SQLite (Capawesome) on device, assetlinks.json App Link → /join
```

## 4. Phased Breakdown

Exit bar = "this must be green before next phase merges."

### Phase A — Capacitor native bootstrap (local only)
- Rewrite `packages/client/capacitor.config.ts`: `appId: 'dev.hnch.hnch'`, `appName: 'hnch'`, `webDir: 'www'`, `ios: { scheme: 'hnch' }`, `server: { androidScheme: 'https' }`, SplashScreen plugin config.
- Deps: `@capacitor/ios@^8`, `@capacitor/android@^8`, `@capawesome-team/capacitor-sqlite`, `@capacitor/assets` (devDep), `fastlane` (Gemfile, not npm).
- `npx cap add ios && npx cap add android` — commit generated `packages/client/ios/` and `packages/client/android/`.
- `.gitignore` additions: `ios/App/App/public/`, `ios/App/Pods/`, `ios/DerivedData/`, `ios/App/build/`, `android/app/build/`, `android/build/`, `android/.gradle/`, `android/local.properties`, `android/app/release/`, `android/key.properties`, `*.keystore`, `*.jks`.
- Asset source `packages/client/resources/{icon.png 1024², splash.png 2732², splash-dark.png}`. `npx @capacitor/assets generate` populates `ios/.../Assets.xcassets` + `android/.../res/mipmap-*`.
- iOS Deployment Target 14.0 in `ios/App/App.xcodeproj`. Android `minSdk=23, targetSdk=35, compileSdk=35` in `android/app/build.gradle`.
- New file `packages/client/src/app/core/doc/sqlite-persistence.ts` — custom Yjs persistence provider using Capawesome SQLite. Schema: `CREATE TABLE yjs_updates(doc_id TEXT, idx INTEGER PRIMARY KEY AUTOINCREMENT, update BLOB)`. API mirrors `IndexeddbPersistence`: constructor `(docName, ydoc)`, `whenSynced: Promise<this>`, `destroy()`. Per update: append row. On `Y.Doc.on('update')` quiescence (debounce 5s via `setTimeout`): read all rows for doc, `Y.mergeUpdates([...])`, replace with single row.
- Wire into `packages/client/src/app/core/doc/doc.service.ts:391-394` native branch.
- New script `packages/client/scripts/inject-native-version.mjs`: `git describe --tags --match 'client-v*' --abbrev=0` → strip `client-v` prefix → `CFBundleShortVersionString` + `versionName`. `git rev-list --count <tag>` → `CFBundleVersion` + `versionCode`. Idempotent. Invoked from new `cap:sync` script.
- New `packages/client/package.json` scripts:
  - `cap:sync`: `pnpm run build && cap sync && node scripts/inject-native-version.mjs`
  - `cap:open:ios`: `cap open ios`
  - `cap:open:android`: `cap open android`
  - `assets:generate`: `capacitor-assets generate`
  - `native:version:inject`: `node scripts/inject-native-version.mjs`

**Exit bar:** `pnpm -F @hnch/client run cap:sync` clean; `npx cap doctor` zero issues; Xcode sim + Android emulator launch app and persist a join across cold-launch (SQLite verified).

### Phase B — Local iOS build, signing, on-device
- `packages/client/ios/App/App/Info.plist`:
  - `NSCameraUsageDescription` = "Scan a room QR code to join a session."
  - Remove placeholder `CFBundleURLTypes` (no custom scheme per decision #11).
- `App.entitlements`: `com.apple.developer.associated-domains` = `["applinks:hnch.dev"]`.
- Xcode: select Apple Developer Team, automatic signing for Debug, manual for Release (Match owns Release certs from Phase G onward).
- `packages/client/src/app/app.component.ts` `ngOnInit`: register `App.addListener('appUrlOpen', ...)`. Parse URL host=`hnch.dev`, path begins with `/join`, extract `code` query param, `Router.navigate(['/join'], { queryParams: { code } })`. Handle both cold-launch (use `App.getLaunchUrl()`) and warm-foreground.
- One-time TestFlight upload manually via Xcode Organizer for sanity-check before automating in Phase G.

**Exit bar:** Manual Xcode archive uploads to TestFlight; Universal Link tap from Messages opens app to join screen.

### Phase C — Local Android build, keystore, App Links
- Generate release keystore: `keytool -genkey -v -keystore hnch-release.jks -alias hnch -keyalg RSA -keysize 2048 -validity 10000`. Store outside repo. Capture SHA-256 fingerprint for `assetlinks.json`.
- `android/app/build.gradle`: `signingConfigs.release` reads `key.properties` (gitignored). `buildTypes.release.signingConfig = signingConfigs.release`. `applicationId = 'dev.hnch.hnch'`, `minSdk 23`, `targetSdk 35`, `compileSdk 35`.
- `AndroidManifest.xml` intent-filter on `MainActivity`:
  ```xml
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="https" android:host="hnch.dev" android:pathPrefix="/join"/>
  </intent-filter>
  ```

**Exit bar:** `./gradlew bundleRelease` produces signed `.aab` locally; `adb install` of release APK works; `adb shell pm get-app-links dev.hnch.hnch` shows `verified`; cold-launch from tapped `https://hnch.dev/join?code=ABC123` opens app.

### Phase D — `.well-known/` deep-link files (ships with client)
- New files in repo:
  - `packages/client/src/.well-known/apple-app-site-association` (no extension):
    ```json
    { "applinks": { "apps": [], "details": [
      { "appID": "<APPLE_TEAM_ID>.dev.hnch.hnch", "paths": ["/join", "/join/*"] }
    ]}}
    ```
  - `packages/client/src/.well-known/assetlinks.json`:
    ```json
    [{ "relation": ["delegate_permission/common.handle_all_urls"],
       "target": { "namespace": "android_app", "package_name": "dev.hnch.hnch",
                   "sha256_cert_fingerprints": ["<UPPER:HEX:COLON:FINGERPRINT>"] }}]
    ```
- `packages/client/angular.json`: add `src/.well-known/` to `architect.build.options.assets[]` with `output: ".well-known/"` so files copy to `www/.well-known/` verbatim.
- MIME override for AASA's no-extension file: `infra/Caddyfile` was removed (ADR-0054) and `hnch-web` serves `www` through Workers Static Assets. Add the rule to `packages/client/src/_headers` and verify on `hnch.dev` that it sets `Content-Type: application/json`:
  ```
  /.well-known/apple-app-site-association
    Content-Type: application/json
  ```
- Real `<APPLE_TEAM_ID>` lands in PR5 (alongside iOS signing setup). Real Android cert fingerprint lands in PR7 (alongside keystore generation). PR3 commits the files with placeholder values; AASA validators fail by design until those PRs land.

**Exit bar:** `curl -i https://hnch.dev/.well-known/apple-app-site-association` → `200`, `Content-Type: application/json`, valid JSON. `curl -i https://hnch.dev/.well-known/assetlinks.json` → `200`, valid JSON. After PR5/PR7: Apple AASA validator + Google Digital Asset Links API both pass.

### Phase E — Tart macOS runner pool
Mirror `infra/runner/` → `infra/runner-macos/`:
- `Brewfile`: `node@22`, `pnpm` (corepack), `cocoapods`, `fastlane`, `xcbeautify`, `cirruslabs/cli/tart`.
- `bootstrap.sh`: Brew install, Tart install, accept Xcode license, warm `xcrun simctl list`.
- `golden-image.sh`: `tart pull ghcr.io/cirruslabs/macos-sequoia-xcode:latest`, tag as `hnch-macos-runner-base`. `tart run` to install pnpm + fastlane inside, `tart stop`, snapshot as `hnch-macos-runner:vN`.
- `supervisor.sh` (long-loop): per iteration — `tart clone hnch-macos-runner:vN ephemeral-$JOB`, `tart run --net-bridged ephemeral-$JOB &`, SSH in, register with GH API token (`hnch-macos-runner-pat` from Keychain), `./run.sh --ephemeral --labels self-hosted,macos,arm64,hnch-tart`, wait for runner exit, `tart delete ephemeral-$JOB`. Crashloop guard mirroring `infra/runner/supervisor.sh:1-136`.
- `prune.sh`: delete leaked `ephemeral-*` VMs, stale snapshots, daily. LaunchAgent triggered.
- `dev.hnch.macos-runner.plist`, `dev.hnch.macos-runner-prune.plist`: LaunchAgents.
- `install.sh`: mirrors `infra/runner/install.sh` shape.
- `README.md`: setup runbook.

Concurrency: 1 VM. New repo var `vars.MACOS_RUNNER` (default `["macos-latest"]` for fallback). Same flip pattern as `vars.LINUX_RUNNER`.

**Exit bar:** LaunchAgent supervises Tart VM lifecycle across 5 successive synthetic workflow runs green; no-op workflow with `hnch-tart` label completes; disk usage stable.

### Phase F — Secrets and signing material
GitHub repo secrets to add (`gh secret set …`):
- `APPLE_API_KEY_ID` — App Store Connect API key id.
- `APPLE_API_KEY_ISSUER_ID` — issuer UUID.
- `APPLE_API_KEY_P8` — full .p8 contents.
- `APPLE_TEAM_ID` — 10-char team id (also embedded in AASA `appID`).
- `MATCH_PASSWORD` — fastlane match encryption passphrase.
- `MATCH_GIT_URL` — private repo URL holding encrypted certs (e.g. `https://github.com/xau/hnch-match.git`).
- `MATCH_GIT_TOKEN` — fine-grained PAT for the match repo (contents:read).
- `ANDROID_KEYSTORE_BASE64` — `base64 -w0 hnch-release.jks`.
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — added post-enrollment; workflow conditional on presence.

Match setup one-time: create private GH repo `hnch-match`, `fastlane match init` from dev box, generate appstore certs + profiles, commit encrypted to match repo.

`packages/client/fastlane/`:
- `Fastfile`: lane `ios beta` — `match(type: 'appstore', readonly: true)`, `build_app(workspace: 'ios/App/App.xcworkspace', scheme: 'App', export_method: 'app-store')`, `upload_to_testflight(api_key_path: ENV['ASC_KEY_PATH'], skip_waiting_for_build_processing: true)`. Lane `android internal` — `supply(track: 'internal', aab: '<aab path>', json_key_data: ENV['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'])`, conditionally invoked.
- `Appfile`: `app_identifier 'dev.hnch.hnch'`, `apple_id` placeholder (resolved via API key).
- `Matchfile`: `git_url ENV['MATCH_GIT_URL']`, `storage_mode 'git'`, `type 'appstore'`, `app_identifier(['dev.hnch.hnch'])`.

### Phase G — CI workflows

`.github/workflows/deploy-ios.yml`:
- Triggered: `workflow_dispatch` from `release.yml` per client tag.
- `runs-on: ${{ fromJSON(vars.MACOS_RUNNER || '["macos-latest"]') }}` (with `hnch-tart` label).
- `concurrency: deploy-ios`.
- Steps:
  1. Checkout `ref: ${{ inputs.ref }}`.
  2. Corepack + setup-node 22.
  3. `pnpm install --frozen-lockfile`.
  4. Build shared + client (`pnpm -F @hnch/client run build`).
  5. `node packages/client/scripts/inject-native-version.mjs`.
  6. `npx cap sync ios`.
  7. `cd packages/client/ios/App && pod install`.
  8. Write ASC API key to disk from secrets.
  9. `bundle exec fastlane ios beta` (env: MATCH_PASSWORD, MATCH_GIT_URL, ASC_KEY_PATH, etc.).
  10. Attach `.ipa` to GH release for the tag as fallback artifact.
- Timeout 45 min.

`.github/workflows/deploy-android.yml`:
- `runs-on: ${{ fromJSON(vars.LINUX_RUNNER || '["ubuntu-latest"]') }}`.
- Steps:
  1. Checkout, corepack, node, pnpm install.
  2. `actions/setup-java@v4` with JDK 21 (Temurin).
  3. Build shared + client.
  4. Inject version script.
  5. `npx cap sync android`.
  6. Decode `ANDROID_KEYSTORE_BASE64` → `packages/client/android/app/hnch-release.jks`; write `key.properties` from passwords.
  7. `cd packages/client/android && ./gradlew bundleRelease --no-daemon`.
  8. Always attach `.aab` to GH release.
  9. Conditional Play upload: `if: secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON != ''` → `bundle exec fastlane android internal`.

`packages/client/.releaserc.json` change: extend `publishCmd` to fan out three dispatches:
```
gh workflow run deploy-client.yml --ref ${nextRelease.gitTag} && \
gh workflow run deploy-ios.yml    --ref ${nextRelease.gitTag} && \
gh workflow run deploy-android.yml --ref ${nextRelease.gitTag}
```

No changes to `.github/workflows/release.yml`.

### Phase H — `ci.yml` verify additions
Two gated jobs:
- `verify-ios-native`: `runs-on: hnch-tart`. `dorny/paths-filter` on `packages/client/ios/**`, `packages/client/capacitor.config.ts`, `packages/client/package.json`. Steps: web build → `cap sync ios` → `pod install` → `xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO | xcbeautify`. No signing, no XCUITests (gap documented in `docs/native-roadmap.md`).
- `verify-android-native`: Linux pool. paths-filter on `packages/client/android/**`, capacitor config. Steps: setup-java 21 → web build → `cap sync android` → `./gradlew assembleDebug --no-daemon`. Debug-signed, no secrets.

Excluded from default fast-path verify-summary aggregation (own dependents).

### Phase I — Docs & ADRs
New ADRs (verify number 0040+ at PR time):
- **ADR-0040** — Native build & distribution: bundle id `dev.hnch.hnch`, iOS TestFlight via ASC API key + fastlane match, Android Play Internal via service account (gated), keystore in GH secrets, version injection from git tag, JDK 21, iOS DT 14.0, minSdk 23 / targetSdk 35.
- **ADR-0041** — Tart-based macOS self-hosted runner pool: supersedes Phase 9 deferral in ADR-0032/0037. Defines `hnch-tart` label, `vars.MACOS_RUNNER` toggle, Cirrus base image.
- **ADR-0042** — Universal Links + App Links via `.well-known/`: file locations in `packages/client/src/.well-known/`, Angular asset copy, `hnch-web` MIME override for AASA, link path scope `/join`+`/join/*`, no custom URL scheme.

Doc updates:
- `docs/native-roadmap.md` (new): explicit gaps — no XCUITests in CI, no on-device automated smoke, Play Console enrollment pending, future iOS simulator test pipeline, Android emulator instrumented tests, app-store metadata automation. Tracking-only.
- `CONTRIBUTING.md`: "Native development" section — local cap sync, opening Xcode/Android Studio, signing setup, link to ADR-0040.
- `README.md`: status — native iOS + Android in CI.
- `docs/roadmap.md`: mark Phase 6b as superseded by this plan; note user has acknowledged roadmap is stale.
- `docs/project.md`: cross-link new ADRs.

## 5. Files to Create / Modify

### Create
- `docs/plans/native-deployment.md` — canonical committed copy of this plan (created in PR1)
- `adr/0040-native-build-and-distribution.md`
- `adr/0041-tart-macos-self-hosted-runner.md`
- `adr/0042-universal-links-and-app-links.md`
- `docs/native-roadmap.md`
- `.github/workflows/deploy-ios.yml`
- `.github/workflows/deploy-android.yml`
- `packages/client/scripts/inject-native-version.mjs`
- `packages/client/src/app/core/doc/sqlite-persistence.ts`
- `packages/client/src/app/core/doc/sqlite-persistence.test.ts`
- `packages/client/src/.well-known/apple-app-site-association`
- `packages/client/src/.well-known/assetlinks.json`
- `packages/client/resources/icon.png` (1024²)
- `packages/client/resources/splash.png` (2732²)
- `packages/client/resources/splash-dark.png`
- `packages/client/fastlane/Fastfile`
- `packages/client/fastlane/Appfile`
- `packages/client/fastlane/Matchfile`
- `packages/client/Gemfile` (+ `Gemfile.lock`) — fastlane, cocoapods
- `packages/client/ios/**` (generated by `cap add ios`)
- `packages/client/android/**` (generated by `cap add android`)
- `infra/runner-macos/Brewfile`
- `infra/runner-macos/bootstrap.sh`
- `infra/runner-macos/golden-image.sh`
- `infra/runner-macos/supervisor.sh`
- `infra/runner-macos/prune.sh`
- `infra/runner-macos/install.sh`
- `infra/runner-macos/dev.hnch.macos-runner.plist`
- `infra/runner-macos/dev.hnch.macos-runner-prune.plist`
- `infra/runner-macos/README.md`
- Off-repo: private GH repo `hnch-match` (fastlane match storage)

### Modify
- `packages/client/capacitor.config.ts` (full rewrite)
- `packages/client/package.json` (deps + scripts)
- `packages/client/.gitignore`
- `packages/client/angular.json` (`.well-known/` in assets)
- `packages/client/src/app/core/doc/doc.service.ts` (wire SQLite persistence on native — line 391-394)
- `packages/client/src/app/app.component.ts` (`App.addListener('appUrlOpen')` handler)
- `packages/client/.releaserc.json` (publishCmd dispatches 3 workflows)
- `packages/client/src/_headers` (AASA MIME header rule)
- `.github/workflows/ci.yml` (verify-ios-native + verify-android-native gated jobs)
- `CONTRIBUTING.md`, `README.md`, `docs/roadmap.md`, `docs/project.md`

## 6. Existing Utilities to Reuse
- Self-hosted runner pattern → mirror exactly: `infra/runner/{Dockerfile,entrypoint.sh,supervisor.sh,prune.sh,install.sh,dev.hnch.runner*.plist}`. Same LaunchAgent + Keychain PAT model.
- Runner toggle pattern: `runs-on: ${{ fromJSON(vars.LINUX_RUNNER || '["ubuntu-latest"]') }}` (e.g. `release.yml:23`). Mirror with `vars.MACOS_RUNNER`.
- semantic-release `publishCmd` dispatch: existing pattern in `packages/client/.releaserc.json` `@semantic-release/exec`. Extend, don't replace.
- Smoke-test pattern from `deploy-client.yml` (retry curl loop). Reuse shape for AASA + assetlinks validation post-deploy.
- Native-platform branch in `packages/client/src/app/core/doc/doc.service.ts:391-394` (`Capacitor.isNativePlatform()`). Persistence wiring goes there.
- `packages/client/scripts/run-ng-dev.mjs` style for new `inject-native-version.mjs` (small ESM script).
- `.releaserc.base.json` per-package extends pattern.

## 7. Open Risks / Deferred

**R1: Google Play Console enrollment timing.** Until enrolled, Android `.aab` archives to GH release only. Add `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret and re-run a deploy when ready (PR10).

**R2: Capawesome SQLite license confirmation.** Free for personal/non-commercial; verify free tier before PR2 merge. App is free → user's case fits; reconfirm at implementation.

**R3: Match repo cert custody.** Initial `match init` requires interactive dev-box run. Document recovery procedure (if `MATCH_PASSWORD` lost, all certs must be regenerated and `nuke` run).

**R4: Mac mini RAM headroom for Tart.** 16 GB total. Tart VM at 8 GB, Linux Podman pool (4×) at ~4 GB ceiling combined, host macOS ~4 GB. Tight but workable for 1 Tart VM. Measure during Phase E exit-bar runs; if swap spikes, throttle Linux pool to 3 concurrent during iOS deploys.

**R5: AASA propagation delay.** iOS caches AASA aggressively (~24h on first install). Real-world testing of Universal Links after PR5 may require reinstalling the app or using the swcd refresh trick.

**R6: Cirrus image macOS version cadence.** Cirrus updates the `macos-sequoia-xcode` image on every Xcode release. Plan to bump golden image quarterly; pin specific sha256 tags rather than `:latest` for reproducibility.

## 8. Verification

**Phase A:**
```
pnpm -F @hnch/client run cap:sync
cd packages/client/ios/App && pod install && open App.xcworkspace
cd packages/client/android && ./gradlew assembleDebug
```

**Phase B (iOS local + on-device):**
- Xcode → Product → Archive → Distribute → TestFlight & App Store.
- On iPhone: tap `https://hnch.dev/join?code=ABC123` from Notes/Messages → app opens to join screen.

**Phase C (Android local):**
```
keytool -list -v -keystore hnch-release.jks
cd packages/client/android && ./gradlew bundleRelease
adb install app/build/outputs/apk/release/app-release.apk
adb shell pm get-app-links dev.hnch.hnch     # expect "verified"
```

**Phase D:**
```
curl -i https://hnch.dev/.well-known/apple-app-site-association | jq .
curl -i https://hnch.dev/.well-known/assetlinks.json | jq .
# Apple AASA validator: https://branch.io/resources/aasa-validator
# Google validator: https://developers.google.com/digital-asset-links/tools/generator
```

**Phase E:**
```
tart list
launchctl list | grep hnch.macos-runner
gh workflow run <synthetic-noop> --label hnch-tart
```

**Phase G end-to-end (after merge to main):**
```
gh run watch    # release → deploy-client + deploy-ios + deploy-android
# TestFlight build appears in App Store Connect ~10 min later
# .aab in GH release assets
```

**Phase H:**
- PR touching `packages/client/capacitor.config.ts` → verify-ios-native + verify-android-native both run and pass.
- PR touching only `packages/relay/**` → neither runs.

## 9. Rollout Order

Every PR runs in its own worktree (§2a). Each row lists the worktree name, the spawn command (run from repo root), the PR title, and the scope. After merge: `pnpm worktree:remove <name> && git branch -D <name>`.

| # | Worktree | Spawn | PR title | Notes |
|---|---|---|---|---|
| 1 | `native-bootstrap` | `git fetch origin && pnpm worktree:add native-bootstrap main` | `chore(client): scaffold Capacitor native projects` | Phase A minus SQLite wiring + commits `docs/plans/native-deployment.md`. Lowest risk. |
| 2 | `native-sqlite` | (after PR1 merges) `git fetch origin && pnpm worktree:add native-sqlite main` | `feat(client): SQLite-backed Yjs persistence on native` | Phase A finish. `sqlite-persistence.ts` + tests + wire into `doc.service.ts`. |
| 3 | `well-known-deeplinks` | (parallel-safe with PR2; branch off main) `git fetch origin && pnpm worktree:add well-known-deeplinks main` | `feat(client): scaffold .well-known files + AASA MIME` | Phase D, placeholder TEAM_ID + fingerprint. |
| 4 | `tart-macos-runner` | (parallel-safe; infra-only) `git fetch origin && pnpm worktree:add tart-macos-runner main` | `chore(infra): Tart macOS runner pool scaffolding` | Phase E. All `infra/runner-macos/*` + ADR-0041 + `vars.MACOS_RUNNER`. |
| 5 | `ios-universal-links` | (after PR1 + PR3 merge) `git fetch origin && pnpm worktree:add ios-universal-links main` | `feat(client): iOS Universal Links + Info.plist` | Phase B + AASA real TEAM_ID. ADR-0040 + ADR-0042. |
| 6 | `ci-ios-testflight` | (after PR4 + PR5 merge) `git fetch origin && pnpm worktree:add ci-ios-testflight main` | `ci(client): iOS native build + TestFlight deploy` | Phase G iOS half + Phase H verify-ios. `deploy-ios.yml`, Fastfile. |
| 7 | `android-app-links` | (after PR1 merges) `git fetch origin && pnpm worktree:add android-app-links main` | `feat(client): Android App Links + signing config` | Phase C + assetlinks.json real SHA-256. |
| 8 | `ci-android-play` | (after PR7 merges) `git fetch origin && pnpm worktree:add ci-android-play main` | `ci(client): Android bundle + Play upload (gated)` | Phase G android half + Phase H verify-android. |
| 9 | `native-docs` | (after PR8 merges) `git fetch origin && pnpm worktree:add native-docs main` | `docs: native build runbook + native-roadmap` | Phase I tail. |
| 10 | `enable-play-upload` | (post Play Console enrollment) `git fetch origin && pnpm worktree:add enable-play-upload main` | `ci(client): enable Play Internal upload` | Add Play service-account secret; tweak `deploy-android.yml`. |

**Parallelism map.** PRs 2, 3, 4, 7 can be developed in parallel (4 independent worktrees) since none touch the same files. PR5 blocks on PR1 (needs ios/) + PR3 (AASA file location). PR6 blocks on PR4 (Tart runner) + PR5 (iOS signing). PR8 blocks on PR7 (Android signing). With 4 active worktrees the critical path is PR1 → PR2 → PR5 → PR6 → PR9.

PR titles use `feat(client)` / `chore(client)` / `ci(client)` / `docs` scope per Conventional Commits. Infra-only PR4 uses `chore(infra)` — no semantic-release bump. The `docs/plans/native-deployment.md` deliverable belongs to PR1 (`chore(client)` scope is fine since the plan describes client work).

## 10. Key Files Reference
- `/Users/xau/Documents/projects/hnch/packages/client/capacitor.config.ts` (rewrite)
- `/Users/xau/Documents/projects/hnch/packages/client/src/app/core/doc/doc.service.ts:391-394` (native branch)
- `/Users/xau/Documents/projects/hnch/packages/client/.releaserc.json` (publishCmd)
- `/Users/xau/Documents/projects/hnch/.github/workflows/release.yml`
- `/Users/xau/Documents/projects/hnch/.github/workflows/deploy-client.yml` (pattern to mirror)
- `/Users/xau/Documents/projects/hnch/.github/workflows/ci.yml`
- `/Users/xau/Documents/projects/hnch/packages/client/src/_headers`
- `/Users/xau/Documents/projects/hnch/infra/runner/install.sh` (pattern to mirror)
- `/Users/xau/Documents/projects/hnch/infra/runner/supervisor.sh` (pattern to mirror)
- `/Users/xau/Documents/projects/hnch/infra/runner/dev.hnch.runner.plist` (pattern to mirror)
- `/Users/xau/Documents/projects/hnch/adr/0004-local-persistence-sqlite-indexeddb.md`
- `/Users/xau/Documents/projects/hnch/adr/0029-relay-deployment.md`
- `/Users/xau/Documents/projects/hnch/adr/0032-self-hosted-github-actions-runner.md`
- `/Users/xau/Documents/projects/hnch/adr/0034-qr-scan-native-web-split.md`
- `/Users/xau/Documents/projects/hnch/adr/0037-self-hosted-runner-pool-covers-all-non-health-jobs.md`
- `/Users/xau/Documents/projects/hnch/CONTRIBUTING.md`
