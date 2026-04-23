# Plan: Extend `hnch config` with lobby creation defaults

## Context

CLI config (`~/.config/hnch/config.json`) only stores identity + relay URL. Room creation preferences must be passed as flags every time. Extending config to store persistent creation defaults.

## New config fields

Add to `CliConfig` in `packages/cli/src/config.ts`:

```ts
defaultScale?: string        // 'fibonacci' | 'tshirt' — scale ID
defaultSessionName?: string  // e.g. "Sprint Planning"
defaultPassword?: boolean    // true = always prompt for password on create
```

## Flag mode

`hnch config` gains new options:

```
hnch config --scale tshirt
hnch config --session-name "Sprint Planning"
hnch config --password              # sets defaultPassword: true
hnch config --no-password           # sets defaultPassword: false
hnch config --scale ""              # clears defaultScale (empty string = delete key)
hnch config --session-name ""       # clears defaultSessionName
```

Multiple flags combinable: `hnch config --scale tshirt --session-name "Sprint"`

## Interactive mode

`hnch config` with no flags:

1. Print current config as JSON (existing behavior)
2. Ask: `Edit settings? [y/N]`
3. If yes → show numbered menu of all settings with current values:
   ```
   1. Display name        [Alice]
   2. Relay URL            [http://localhost:1234]
   3. Default scale        [fibonacci]
   4. Default session name [not set]
   5. Default password     [off]
   
   Pick a setting to edit (1-5), or q to quit:
   ```
4. User picks number → prompt for new value → save → show menu again
5. `q` exits

## Wire defaults into `hnch create`

Resolution order for each field (CLI flag → config default → hardcoded fallback):

| Field | Flag | Config key | Fallback |
|-------|------|-----------|----------|
| scale | `--scale` | `defaultScale` | `'fibonacci'` |
| name | `--name` | `defaultSessionName` | `undefined` (no name) |
| password | `--password` | `defaultPassword` | `false` |

Remove hardcoded `default: 'fibonacci'` from yargs scale option. Remove hardcoded `default: false` from yargs password option. Resolve at runtime in `handleCreate`.

## Files to modify

- `packages/cli/src/config.ts` — extend `CliConfig`, update `updateConfig` to handle new fields + empty-string-means-delete
- `packages/cli/src/index.ts` — add config options, interactive menu, wire defaults into create command

## Verification

1. `pnpm --filter shared build && pnpm --filter cli build`
2. `hnch config` → shows JSON, asks to edit, menu works
3. `hnch config --scale tshirt` → config updated
4. `hnch create` without `--scale` → uses tshirt from config
5. `hnch create --scale fibonacci` → flag overrides config
6. `hnch config --scale ""` → clears, falls back to fibonacci
7. `hnch config --password` → sets defaultPassword true
8. `hnch create` → prompts for password without needing `--password` flag
