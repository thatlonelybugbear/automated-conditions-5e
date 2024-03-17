## v11.315.304.6.4
* Closing [43](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/43) (encumbrance automation).
* Closing [57](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/57) (more translations about attack/damage rolls and targets selected).
* Closing [58](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/58) (bail out of attack/damage rolls suggestions, if no targets selected).

## v11.315.304.6.3
* Closes [53](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/53)

## v11.315.304.6.2
* 51-  fix saves advantage mode when not proficient with the armor

## v11.315.304.6.1
* Finally fix attackrolls issue in https://github.com/thatlonelybugbear/automated-conditions-5e/pull/48
* Closes #44

## v11.315.304.6 <hl>
* Closes https://github.com/thatlonelybugbear/automated-conditions-5e/issues/44
* Add lang file by in https://github.com/thatlonelybugbear/automated-conditions-5e/pull/47
* Fixed Armor automation issues and tooltips.

## v11.315.304.5.4 <hl>
- Added a setting for automating Exhaustion 5e rules or not. Closing: <https://github.com/thatlonelybugbear/automated-conditions-5e/issues/37>
  - Should allow for compatibility with modules offering alternative rules for exhaustion (will add the dndOne rules as an option soon).
 
## v11.315.304.5.1 and v11.315.304.5.2 <hl>
- Some typos
- Sharpshooter: limit to only `rwak`

## v11.315.304.5 <hl>
- Use game.i18n.translations as a first step in <https://github.com/thatlonelybugbear/automated-conditions-5e/pull/27>
- Add helpers for disposition and checking nearby tokens <https://github.com/thatlonelybugbear/automated-conditions-5e/pull/29>
- Prone fix and nearby foes for ranged attacks check <https://github.com/thatlonelybugbear/automated-conditions-5e/pull/31>
- Dialog tooltip show/hide settings <https://github.com/thatlonelybugbear/automated-conditions-5e/pull/32>
- Settings and logic for armor and range automation <https://github.com/thatlonelybugbear/automated-conditions-5e/pull/33>
  - Armor automation (default off)
    - Ability Checks, Saves and Attack Rolls for (STR || DEX) based rolls, if the Actor is not proficient in the equipped suit of Armor.
    - Imposes disadvantage on Stealth checks when the relevant property of the Armor is selected.
  - Range automation (default off)
    - Attacking with a ranged weapon at long range imposes disadvantage on the roll (Long Range).
    - Attacking with a ranged weapon, when an enemy is adjacent, imposes disadvantage on the roll (Nearby Foe).
    - Attacking with a ranged weapon at a distance longer than the long range, imposes a fail on the roll (Out of Range).
    - Crossbow Expert: Ignores Nearby Foes with
      - A flag on the Actor `flags.automated-conditions-5e.crossbowExpert | Override | 1` or
      - An Item named `Crossbow Expert`.
    - Sharpshooter: No disadvantage when shooting at long range with
      - A flag on the Actor `flags.automated-conditions-5e.sharpShooter | Override | 1` or
      - An Item named `Sharpshooter`.
  - Show/hide roll dialog tooltips (default on)

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
