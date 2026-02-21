Applies to version: `13.5250.5`
## Expanded Conditions (default off)
- `Dodging`: Attacker disadvantage if target not incapacitated, restrained and can see attacker. Also advantage on dex saves.
- `Hiding`: Advantage on attacks rolls.

## Environmental Hazards (default off)
- `Burning`: A burning creature or object takes 1d4 Fire damage at the start of each of its turns.
- `Suffocating`:  A suffocating creature gains 1 Exhaustion level at the end of each of its turns.

## Armor automation (default off)
- Ability Checks, Saves and Attack Rolls for (STR || DEX) based rolls, if the Actor is not proficient in the equipped suit of Armor.
- Imposes disadvantage on Stealth checks when the relevant property of the Armor is selected.
  - From dnd5e v3.1.2 onwards, any Equipment type Item can impose stealth disadvantage too, not only suits of armor.

## Automate range checks (default none selected)
* `Melee diagonal reach`: All adjacent squares count as within reach no matter the diagonal rules.
* `Melee out of range`: Melee attacks further than weapon reach fail.
* `Ranged long disadvantage`: Ranged attacks beyond short range but within long range have disadvantage.
* `Ranged out of range`: Ranged attacks beyond long range fail.
* `Ranged nearby foes`: Hostiles adjacent to attacker impose disadvantage on ranged attacks.
* Special item or features:
  * `Crossbow Expert` (Ignores Nearby Foe disadvantage). To use add on the Actor, either:
    * AE with a `flags.automated-conditions-5e.crossbowExpert | Override | 1` or
    * Item named Crossbow Expert
  * `Sharpshooter` flag (Ignore Long Range disadvantage). To use add on the Actor, either:
    * AE with a `flags.automated-conditions-5e.sharpShooter | Override | 1` or
    * Item named Sharpshooter

## Show AC5e tooltips for both Roll Dialog and Chat messages or any combination of these (default both).

## Exhaustion automation (default on)
- Automates only 5e `legacy` exhaustion rules.

## Encumbrance automation (default off)
Dnd5e v3.x system offers a setting for Encumbrance rules. If that is set to Variant, and you turn this AC5e setting on, ability checks, attack rolls, and saving throws that use Strength, Dexterity, or Constitution will have disadvantage.

## Targeting options (default From source only)
When 0 or more than 1 targets are selected, AC5e will not be able by default to calculate correctly advantageMode/damageMode for Attack Rolls, and this is done based on the first of the game.user.targets only. There is now a setting for the GM to decide how AC5e will deal with targeting and rolling an Attack or Damage, or try to Use an Item that has an attack and Target any of the Individual target options in its details tab. The options are as follows:
- `Use only source actor conditions`: The advantageMode/damageMode will be calculated based on effects/conditions etc on the Source actor only (default option),
- `Cancel roll silently`: Will cancel the incoming Roll or Item use! (Use with caution).
- `Cancel roll with warning`: Will cancel the incoming Roll or Item use and display a warning!

## Show tokenless actor warning (default enabled)
A Boolean world setting to show a warning when rolling from a token-less actor (rolling from sidebar actors is not yet fully supported).

## For D&D5e v3.1+
Conditions affecting concentration saving throws.
- Exhaustion 3-5 applies disadvantage.
- Heavy Encumbrance applies disadvantage.
- War Caster named Item applies advantage.

## Hidden settings (API only)
These are internal AC5e settings (`config: false`) and are not shown in the UI.

### Heavy property automation (internal toggle)
Setting key: `automateHeavy`

```js
await game.settings.set("automated-conditions-5e", "automateHeavy", true);
await game.settings.set("automated-conditions-5e", "automateHeavy", false);
```

### Show only D&D5E statuses (internal toggle)
Setting key: `displayOnly5eStatuses`

```js
await game.settings.set("automated-conditions-5e", "displayOnly5eStatuses", true);
await game.settings.set("automated-conditions-5e", "displayOnly5eStatuses", false);
```

<<<<<<< HEAD
### Development mode diagnostics (internal toggle)
Setting key: `devModeEnabled`

```js
await game.settings.set("automated-conditions-5e", "devModeEnabled", true);
await game.settings.set("automated-conditions-5e", "devModeEnabled", false);
```

When enabled, AC5e emits extra READY diagnostics (including local build-state markers) intended for debugging.

=======
>>>>>>> ade0f4667d5ddf84b4a9f3c7a18605c9f7c369e3
