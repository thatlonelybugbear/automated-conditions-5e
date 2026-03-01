# Dev Regression Checklist

Internal checklist for quick smoke coverage before release.

## Message/use resolution precedence

Goal: verify prehook data (`message.data.flags`) is preferred, with safe fallback to `message.flags`.

1. Trigger message has only `data.flags.dnd5e` (no `flags.dnd5e`).
   - Expected: `getMessageData` resolves `item`, `activity`, `use`, and targets correctly.
2. Trigger message has only `flags.dnd5e` (no `data.flags.dnd5e`).
   - Expected: same result as above.
3. Trigger message has both, but values differ.
   - Expected: `data.flags` values win.
4. Originating/usage message split:
   - `usage` contains `dnd5e.use` and `targets`.
   - `originating` contains AC5E module `use` data.
   - Expected: merged config keeps expected spell level/scaling/targets/activity/item without losing existing options.
5. Registry-only recovery (`dnd5e.registry.messages`) with sparse trigger message.
   - Expected: originating and usage context is still resolved; no undefined access errors.

Useful debug:
- `ac5e.debug.getMessageDataHook = true`
- `ac5e.debug.originatingUseConfig = true`
- `ac5e.debug.getConfigLayers = true`
- `ac5e.debug.checksReuse = true`

## usesCount matrix

Goal: keep parsing/eval stable for numeric, actor-resource, item-origin, death counters, and malformed legacy tails.

1. Numeric only:
   - `usesCount=5`
   - Expected: requires at least 5, consumes default 1.
2. Numeric with explicit consume:
   - `usesCount=5,2`
   - Expected: requires at least 5, consumes 2.
3. Death counters:
   - `usesCount=deathsuccess`
   - `usesCount=deathsuccess,1`
   - Expected: resolves to death success counter path and consumes correctly.
4. Origin item/activity:
   - `usesCount=origin`
   - `usesCount=origin,2`
   - Expected: consumes from effect origin owner; no crash when origin missing (warn + no-op/false path as designed).
5. Malformed legacy tail recovery:
   - Example with rewritten tail artifacts (legacy comma segments).
   - Expected: parser does not corrupt top-level consume segment and does not throw.
6. Non-actor/invalid targets:
   - Expected: no-op behavior, no throw.

Quick validation pass:
- Roll attack/save/damage once with each case.
- Confirm no `Unable to simplify formula` or `Cannot read properties of undefined` errors in console.
