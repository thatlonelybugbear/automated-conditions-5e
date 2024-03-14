### v11.315.304.5.1 and v11.315.304.5.2 <hl>
- Some typos
- Sharpshooter: limit to only `rwak`

## v11.315.304.5 <hl>
* Use game.i18n.translations as a first step by @thatlonelybugbear in https://github.com/thatlonelybugbear/automated-conditions-5e/pull/27
* Add helpers for disposition and checking nearby tokens by @thatlonelybugbear in https://github.com/thatlonelybugbear/automated-conditions-5e/pull/29
* Prone fix and nearby foes for ranged attacks check by @thatlonelybugbear in https://github.com/thatlonelybugbear/automated-conditions-5e/pull/31
* Dialog tooltip show/hide settings by @thatlonelybugbear in https://github.com/thatlonelybugbear/automated-conditions-5e/pull/32
* Settings and logic for armor and range automation by @thatlonelybugbear in https://github.com/thatlonelybugbear/automated-conditions-5e/pull/33

## v11.315.304.1 <hl>
- Move to dnd5e v3.x.
  - For dnd5e v3.x, use manifest: <https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/main/module.json>
  - For dnd5e v2.x, use manifest: <https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/dndv2/module.json>
- Added tooltips on roll dialogs to indicate the reasons why AC5E suggests the specific roll.
- Moved to using the `Actor5e#statuses`

## v11.11.2 <hl>
- Make sure that `config.parts:<string>`
- Use falsy checks for `!Array.length`

## v11.11.1 <hl>
- Bump for v11 only branch and some small additions. More things to come :)

## v11.0.11 <hl>
- Hotfix for v10.

## v11.0.10 <hl>
- Version bump that will be the last v10 compatible one.

## v11.0.1 <hl>
- Compatibility bump for Foundry v11.300 and make system dnd5e required with minimum version 2.0.1.

## v11.0.0 <hl>
- Compatibility bump for Foundry v11.

## v10.0.3 <hl>
- Quick fix for unlinked tokens.

## v10.0.2 <hl>
- Closing https://github.com/thatlonelybugbear/automated-conditions-5e/issues/3: Melee attacks on Prone targets will have advantage when distance <=5, and disadvantage otherwise. 
- Closing https://github.com/thatlonelybugbear/automated-conditions-5e/issues/4: Added RollDeathSaves. Exhaustion levels 3-5 will grant disadvantage of death Saves.

## v10.0.1 <hl> 
- Closing https://github.com/thatlonelybugbear/automated-conditions-5e/issues/1: Using `CONFIG.DND5E.conditionTypes` to fetch effect labels.
- `_getMinimumDistanceBetweenTokens` should respect diagonal movement types (will make sense in the future)

## v10.0.0 <hl> 
- Initial commit
