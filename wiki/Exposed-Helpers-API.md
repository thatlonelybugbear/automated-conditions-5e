# Exposed Helpers API

AC5E exposes helper functions on the global `ac5e` object for macros, module integrations, and advanced condition authoring.

## Roll and scene helpers

```js
ac5e.checkArmor(actor)
ac5e.checkCreatureType(actor, dataType = "race")
ac5e.checkDistance(tokenA, tokenB, gridSpaces = false, wallsBlock = true, includeElevation = true)
ac5e.checkNearby(tokenId, disposition, distance, options = {})
ac5e.checkRanged(activity, sourceToken, targetToken, options = {})
ac5e.checkVisibility(sourceToken, targetToken)
ac5e.getLightLevel(token, options = {})
```

`ac5e.checkNearby(token, disposition, distance, options)` supports:
```js
{
  count: false,
  includeToken: false,
  includeIncapacitated: false,
  includeHidden: false,
  hasEffects: [],
  hasItems: [],
  itemOptions: {},
  hasStatuses: [],
  partyMember: false,
  canSee: false,
  creatureTypes: []
}
```

Use `canSee: true` to return only tokens visible to the source token:
```js
ac5e.checkNearby(token.id, '!enemy', 0, { canSee: true })
```

Use `creatureTypes` to filter by creature type:
```js
ac5e.checkNearby(token.id, '!enemy', 0, { canSee: true, creatureTypes: ['dragon'], count: 1 })
ac5e.checkNearby(token.id, '!enemy', 0, { creatureTypes: ['dragon', 'fiend'] })
```

`ac5e.getLightLevel(token, options)` returns:
- `bright`
- `dim`
- `darkness`

Useful option:
```js
ac5e.getLightLevel(token, { considerSceneDarkness: true })
```

In Foundry v14, light level checks use canvas lighting, including point-sensitive darkness, global illumination, darkness sources, bright and dim radii, and token/light elevation.

## Item helpers

```js
ac5e.getItem(source, itemIdentifier, options = {})
ac5e.getItems(source, itemIdentifier, options = {})
ac5e.hasItem(source, itemIdentifier, options = {})
ac5e.getItemOrActivity(itemID, activityID, actor)
```

`source` can be an actor, token, token ID, token UUID, actor ID, or actor UUID.

Examples:
```js
ac5e.getItem(actor, "arts-dice")
ac5e.getItems(token.id, ["arts-dice", "Superiority Die"], { getProperty: "system.uses.value" })
ac5e.getItems(actor, null, { properties: "mgc" })
ac5e.hasItem(token, "shield", { type: "spell" })
```

## Evaluation helpers

```js
ac5e.evaluationData({ subjectToken, opponentToken, options })
ac5e.safeEval({ expression, sandbox, mode, debug })
ac5e.resolveEffectOriginContext(effect, options = {})
```

These are intended for debugging, integrations, and advanced macros. Their object shapes can change more often than the simpler helpers above.

## Related API pages

- [Cadence API](<https://github.com/thatlonelybugbear/automated-conditions-5e/wiki/Cadence-API>)
- [Context Keywords API](<https://github.com/thatlonelybugbear/automated-conditions-5e/wiki/Context-Keywords-API>)
- [Status Effects Overrides API](<https://github.com/thatlonelybugbear/automated-conditions-5e/wiki/Status-Effects-Overrides-API>)
- [Troubleshooter API](<https://github.com/thatlonelybugbear/automated-conditions-5e/wiki/Troubleshooter-API>)
- [Usage Rules API](<https://github.com/thatlonelybugbear/automated-conditions-5e/wiki/Usage-Rules-API>)
