# Status Effects Overrides API

Runtime API since `13.5250.6`; persistent overrides since `14.605.1`.

This page documents the API for overriding AC5e built-in status automation rules.

## Overview

AC5e exposes a global registry:

```js
ac5e.statusEffectsOverrides
```

Methods:

- `register(override)` -> returns the registered `id`
- `remove(id)` -> returns `true` if removed
- `clear()` -> removes all registered overrides
- `list()` -> returns a shallow copy of current entries

You can register from `Hooks.on("ac5e.statusEffectsReady", ...)` or at runtime (for example from a macro).

## Register Signature

```js
const id = ac5e.statusEffectsOverrides.register({
  id,         // optional string
  persistent, // optional boolean, default false
  name,      // optional string
  priority,  // optional number, default 0
  status,    // optional string | string[], default "*"
  hook,      // optional string | string[], default "*"
  type,       // optional string | string[], default "*"
  condition,  // optional AC5E sandbox expression
  when,      // optional function | false
  apply,     // optional function
  result     // optional fallback result
});
```

## Parameter Reference

### `id` (optional)

Custom unique identifier.  
If omitted, AC5e generates one like:

```txt
ac5e-status-override-<n>
```

### `name` (optional)

Human-readable label for diagnostics/logging.

### `priority` (optional, default `0`)

Execution order for matching overrides.

- Lower values run first.
- Higher values run later.
- If you want your override to win last, use a higher priority.

### `status` (optional, default `"*"`)

Filters which status IDs this override applies to.

Accepted values:

- single string, e.g. `"prone"`
- array, e.g. `["prone", "restrained"]`
- wildcard `"*"` or `"all"`

### `hook` (optional, default `"*"`)

Filters roll context hook type.

Current built-in status hooks are typically:

- `"attack"`
- `"check"`
- `"save"`
- `"damage"`
- `"use"`

Also supports array and wildcards (`"*"` / `"all"`).

### `type` (optional, default `"*"`)

Filters side of evaluation:

- `"subject"`: the rolling actor side
- `"opponent"`: the opposed/target side

Also supports array and wildcards (`"*"` / `"all"`).

### `when` (optional)

Conditional guard.

- If `when` is a function and returns falsy, the override is skipped.
- If `when === false`, the override is always skipped.

Function signature:

```js
when({ status, hook, type, context, result }) => boolean
```

### `persistent` and `condition` (optional)

Set `persistent: true` to save a static override in the world settings so it survives reloads. Use a stable `id` to update or remove it later. A generated ID avoids collisions with existing overrides, but may differ between sessions. Use a serializable AC5E sandbox expression in `condition`, for example:

```js
ac5e.statusEffectsOverrides.register({
  id: "ignore-prone-low-hp",
  persistent: true,
  status: "prone",
  hook: "attack",
  type: "opponent",
  condition: "opponentActor.attributes.hp.value < 120",
  result: ""
});
```

`when: false` remains disabled after reload. Function-valued `when` and `apply` callbacks remain runtime-only and cause a requested persistent override to fall back to runtime registration. Registering a runtime override with the same `id` removes the saved version.

### `apply` (optional)

Main transform function for the matched result.

Function signature:

```js
apply({ status, hook, type, context, result }) => string | undefined
```

Behavior:

- Return a string to replace the current result.
- Return `undefined` to keep the current result unchanged.

### `result` (optional)

Static fallback replacement if `apply` is not provided.

If both `apply` and `result` exist, `apply` is used.

## Callback Payload

`when` and `apply` receive:

- `status`: current status id (e.g. `"prone"`)
- `hook`: current hook (e.g. `"attack"`)
- `type`: `"subject"` or `"opponent"`
- `result`: current computed status result before this override step
- `context`: status evaluation context object, including fields such as:
  - `subject`, `opponent` (actors)
  - `subjectToken`, `opponentToken` (tokens)
  - `activity`, `item`
  - `ability`, `attackMode`, `distance`, `distanceUnit`
  - `isInitiative`, `isConcentration`, `isDeathSave`
  - `modernRules`, `exhaustionLvl`, and related flags

## Tooltip Label Behavior

If an override applies and has a non-empty `name`, AC5e appends it to the base status label in roll tooltips:

```txt
Base Status (Override Name)
```

Example:

```txt
Prone (Ignore Prone in Rage)
```

## Practical Examples

### Example 1: Remove prone melee disadvantage for a specific actor

```js
const id = ac5e.statusEffectsOverrides.register({
  name: "Minotaur ignores prone melee disadvantage",
  status: "prone",
  hook: "attack",
  type: "subject",
  priority: 10,
  when: ({ context }) => context.subject?.name === "Minotaur",
  apply: ({ result }) => (result === "disadvantage" ? "" : result)
});
```

### Example 2: Force advantage when blinded beyond adjacent range (custom rule)

```js
ac5e.statusEffectsOverrides.register({
  status: "blinded",
  hook: "attack",
  type: "subject",
  priority: 20,
  when: ({ context }) => Number(context.distance) > Number(context.distanceUnit),
  result: "advantage"
});
```

`context.distance > context.distanceUnit` means the target is farther than 1 grid unit away (for example, farther than 5 ft on a 5-ft grid).  
It does not automatically mean dnd5e weapon "long range".

### Example 3: Register from ready hook (module-friendly)

```js
Hooks.on("ac5e.statusEffectsReady", ({ overrides }) => {
  overrides.register({
    status: "prone",
    hook: "attack",
    type: "subject",
    apply: ({ result }) => (result === "disadvantage" ? "" : result)
  });
});
```

## Removing and Inspecting

```js
// remove one
ac5e.statusEffectsOverrides.remove(id);

// list current entries
console.table(ac5e.statusEffectsOverrides.list());

// clear all
ac5e.statusEffectsOverrides.clear();
```

## Notes and Best Practices

- Keep override callbacks side-effect free.
- Guard against missing fields in `context`.
- Prefer narrow filters (`status`, `hook`, `type`) for performance and clarity.
- Use explicit `priority` when combining multiple overrides.
