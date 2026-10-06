# Usage Rules API

Applies to version: `13.5250.9`

AC5e exposes usage-rule helpers under:

```js
ac5e.usageRules
```

## Methods

- `register(definition)` -> `key | null`
- `remove(key)` -> `boolean`
- `clear()` -> `void` (runtime entries only)
- `list()` -> `Array`
- `exportJSON(options)` -> `Object` (v14.605.2+)
- `importJSON(data, options)` -> `Promise<Object | null>` (v14.605.2+)
- `showKeys()` -> `Object`
- `canPersist()` -> `boolean`
- `reloadPersistent()` -> `Array`

## Registration

```js
ac5e.usageRules.register({
  key: "isSneak",
  hook: "damage",
  target: "subject",
  mode: "bonus",
  value: "@scale.rogue.sneak-attack",
  cadence: "oncePerTurn",
  condition: "rollingActor.items.some(i=>i.identifier==='sneak-attack' || i.name === 'Sneak Attack') && (rwak || (mwak && fin)) && (hasAdvantage || (!hasDisadvantage && checkNearby(opponentId, 'enemy', 5, {count:(distance <= 5 ? 2 : 1)})))",
  optin: true,
  name: "Sneak Attack",
  scope: "universal"
});
```

Supported definition fields include:

- `key`, `hook`, `target`, `mode`
- `value`/`bonus`, `set`, `modifier`, `threshold`
- `chance`, `addTo`, `usesCount`
- `criticalStatic`, `partialConsume`, `enforceMode`
- `condition` (string expression), `evaluate` (runtime function)
- `cadence`, `optin`, `name`, `description`
- `effectName`, `effectUuid`, `sourceUuid` (label/source hints)
- `persistent` (boolean)
- `scope` (`"effect"` default, or `"universal"`)

## `showKeys()`

Use `showKeys()` to inspect the supported object-form registration keys directly in Foundry:

```js
ac5e.usageRules.showKeys()
```

This returns a plain object with short descriptions for fields such as:

- `key`
- `persistent`
- `scope`
- `hook`
- `target`
- `mode`
- `optin`
- `criticalStatic`
- `partialConsume`
- `enforceMode`
- `usesCount`
- `bonus`
- `set`

Treat it as an authoring reference helper, not a strict machine-stable schema contract.

## Scope behavior

- `scope: "effect"` (default):
  - Registers the key as a runtime keyword for sandbox expressions.
  - Does not auto-create a global pseudo-flag entry.
  - Intended for effect-driven usage, where real AC5e flags reference the key (for example `... | isSneak`).
- `scope: "universal"`:
  - Registers the key in sandbox expressions.
  - Also emits a direct usage-rule pseudo-flag entry for matching hook/target/mode/value.
  - Intended for world-wide/global behavior without requiring an effect flag.

## Opt-in compatibility note

- AC5E opt-in selection depends on roll configuration dialogs.
- If another module forces `dialog.configure = false`, AC5E opt-in controls cannot be displayed.

## Standalone boolean keywords in object-form registration

Structured registrations support standalone booleans directly, not only inside a raw `value` string.

Example:

```js
ac5e.usageRules.register({
  key: "finishingBlowInfo",
  persistent: true,
  scope: "universal",
  hook: "damage",
  target: "opponent",
  mode: "bonus",
  name: "Finishing Blow",
  condition: "opponentActor.attributes.hp.value === 0 && opponentActor.statuses.unconscious",
  bonus: "info",
  usesCount: "death.fail,(isCritical ? 2 : 1)",
  partialConsume: true,
});
```

Notes:

- `partialConsume: true` lets bounded counters consume only the remaining available amount instead of failing when the requested value would exceed the cap.
- `criticalStatic: true` is intended for `extraDice` rules and marks the entry as crit-only static extra dice logic.
- `enforceMode: "advantage" | "disadvantage" | "normal"` is intended for `info` rules on d20 hooks and forces the final resolved roll mode.

Example:

```js
ac5e.usageRules.register({
  key: "steadyAimOverride",
  persistent: true,
  scope: "universal",
  hook: "attack",
  target: "subject",
  mode: "info",
  name: "Steady Aim Override",
  enforceMode: "normal",
  condition: "rollingActor.statuses.prone",
});
```

## Key uniqueness

- Usage rules are uniquely identified by `key`.
- You cannot have two active entries with the exact same key (for example one `effect` and one `universal`).
- Registering a rule with an existing key replaces that key's previous entry.
- Runtime and persistent registries are merged by key; runtime wins if both define the same key.
- If you need both behaviors, use two different keys (for example `isSneakEffect` and `isSneakUniversal`).

## Persistence

To persist a rule world-wide:

```js
ac5e.usageRules.register({
  key: "isSneak",
  hook: "damage",
  target: "subject",
  mode: "bonus",
  value: "@scale.rogue.sneak-attack",
  scope: "universal",
  persistent: true
});
```

Behavior:

- Runtime rules are client-local (per client session).
- Persistent rules are world-level (module setting), shared across clients, and survive reloads.
- Persistent writes are GM-authorized; non-GM clients route through `activeGM.query(...)`.

## `evaluate` and persistence

- `evaluate` functions work for runtime registration.
- `evaluate` cannot be serialized into world settings.
- If `persistent: true` is used together with `evaluate`, AC5e falls back to runtime registration for that rule.
- For persistent behavior, use `condition` string expressions.

## Label behavior

For usage-rule opt-ins, labels resolve as:

1. Primary name: registered `name` when provided.
2. Fallback primary name: `effectName`, then resolved `effectUuid`/`sourceUuid` document name, then `key`.
3. Optional suffix name: inline `name=...` from the rule value, shown only when distinct from primary.

This avoids duplicate labels and supports explicit API-first naming.

## JSON export and import (v14.605.2+)

```js
ac5e.usageRules.exportJSON();
ac5e.usageRules.exportJSON({ filename: "my-usageRules.json", persistentOnly: true });
const snapshot = ac5e.usageRules.exportJSON({ download: false });
```

`exportJSON({ filename = null, download = true, persistentOnly = false } = {})` downloads a JSON file and returns the same snapshot as an object. It does not change registrations or world settings.

The snapshot contains `schema: 1`, `moduleId`, `moduleVersion`, `kind`, `generatedAt`, `entries`, and `skipped`. Each entry is a registration definition, preserving its key or ID, condition, payload, and persistence setting. Document UUIDs remain unchanged; they may need updating when moving definitions between worlds.

By default, export includes the active runtime and persistent definitions. `persistentOnly: true` exports saved definitions only (including saved rules shadowed by a runtime rule with the same key). Entries containing callbacks such as `evaluate` or other values JSON cannot preserve are omitted entirely and reported in `skipped`, with a console warning. This prevents an exported entry from losing its predicate and becoming unconditional.

### Import

```js
// Pick a JSON export file.
const report = await ac5e.usageRules.importJSON();

// Import an exported object or JSON string; existing keys or IDs are skipped.
await ac5e.usageRules.importJSON(snapshot);

// Explicitly replace matching entries.
await ac5e.usageRules.importJSON(snapshot, { overwrite: true });

// Import every definition as runtime-only, regardless of its saved setting.
await ac5e.usageRules.importJSON(snapshot, { persistent: false });
```

`importJSON(data = null, { overwrite = false, persistent = null } = {})` accepts an exported object, JSON string, or `File`. Without data it opens a file picker; cancellation returns `null`.

The entire snapshot is validated before applying any entries. Unsupported schema, module, or registry kind; invalid definitions; and repeated keys or IDs in the file reject the import. Callback definitions are not accepted. Document UUIDs and sandbox conditions are retained, but their applicability in the destination world is not verified.

Existing entries are skipped unless `overwrite: true`. Other registrations remain intact. The returned report contains `imported` (keys or IDs) and `skipped` (entries with `reason: "exists"`). Entries omitted during export are not restored.

Persistence is preserved by default. `persistent: true` or `false` overrides it for all imported entries. An active GM is required for changes to saved definitions, including replacing a persistent entry with a runtime one. Imports await persistence and restore the previous local registry state if saving fails.

Replacing a usage-rule key removes both its runtime and persistent definitions before adding the imported definition, so an older runtime rule cannot shadow an imported saved rule.
