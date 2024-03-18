# Automated Conditions 5e

![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/main/module.json&label=Foundry%20Version&query=$.compatibility.verified&colorB=ff6400&style=for-the-badge)
![Dnd5e System Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/main/module.json&label=dnd5e%20Version&query=$.relationships.systems[0].compatibility.verified&colorB=red&style=for-the-badge)
![Latest Version](https://img.shields.io/badge/dynamic/json.svg?url=https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/main/module.json&label=AC5E%20Version&query=$.version&colorB=yellow&style=for-the-badge)

[![alt-text](https://img.shields.io/badge/-Kofi-%23f96854?style=for-the-badge)](https://ko-fi.com/thatlonelybugbear) 

[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https://forge-vtt.com/api/bazaar/package/automated-conditions-5e&colorB=68a74f&style=for-the-badge)](https://forge-vtt.com/bazaar#package=automated-conditions-5e)
![Latest Release Download Count](https://img.shields.io/github/downloads/thatlonelybugbear/automated-conditions-5e/latest/total?color=2b82fc&label=LATEST%20DOWNLOADS&style=for-the-badge)
![Total Download Count](https://img.shields.io/github/downloads/thatlonelybugbear/automated-conditions-5e/total?color=2b82fc&label=TOTAL%20DOWNLOADS&style=for-the-badge)

## For dnd5e v3.x, use manifest: 
<https://github.com/thatlonelybugbear/automated-conditions-5e/releases/latest/download/module.json>
## For dnd5e v2.x, use manifest: 
<https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/dndv2/module.json>


## Description
A small module for Foundry and Dnd5e which uses dnd5e system Hooks to add the correct config options for Rolls, trying to automate the most common Dnd5e Conditions.

Rolling with Core, will indicate the correct button to press, on Attack Rolls, Damage Rolls, Saving Throws, Ability Checks and Skill Checks, according to the 5e ruleset.
Fast Forwarding the rolls (holding SHIFT) will roll with advantage/disadvantage or when needed critical damage correctly.

# Dnd5e Conditions supported
- **Blinded**: Disadvantage on attacks and grants advantage to attack from others
- **Exhaustion 1**: Disadvantage on ability checks (and skill checks as a result)
- **Exhaustion 2**: no changes
- **Exhaustion 3**: Disadvantage on attacks and saving throws
- **Exhaustion 4**: no changes
- **Exhaustion 5**: no changes
- **Frightened**: Disadvantage on ability checks and attack rolls; v10.0.3 will be testing for Visibility of origin if available to add this or not
- **Invisible**: Advantage on attacks and grants Disadvantage to attacks by others
- **Paralyzed**: Auto fail (-99) strength/dexterity saves and attacker within 5ft of the creature deals critical damage
- **Petrified**: Grants Advantage on attacks by others, auto fail strength/dexterity saves
- **Poisoned**: Disadvantage on attacks and ability checks
- **Prone**: Disadvantage on attacks, grants advantage on attacks by others if within 5ft, otherwise grants disdvantage
- **Restrained**: Disadvantage on attacks and dexterity saves, grants advantage on attacks by others
- **Stunned**: Auto fail strength/dexterity saves, grants advantage on attacks by others
- **Unconscious**: Auto fails strength/dexterity saves, grants advantage on attacks by others, crit if hit within 5ft ++ Prone

# Settings added for:
- **Armor automation (default off)**
  - Ability Checks, Saves and Attack Rolls for (STR || DEX) based rolls, if the Actor is not proficient in the equipped suit of Armor.
  - Imposes disadvantage on Stealth checks when the relevant property of the Armor is selected.
- **Range automation (default off)**
  - Attacking with a ranged weapon at long range imposes disadvantage on the roll (Long Range).
  - Attacking with a ranged weapon, when an enemy is adjacent, imposes disadvantage on the roll (Nearby Foe).
  - Attacking with a ranged weapon at a distance longer than the long range, imposes a fail on the roll (Out of Range).
  - Crossbow Expert: Ignores Nearby Foes with
    - A flag on the Actor `flags.automated-conditions-5e.crossbowExpert | Override | 1` or
    - An Item named `Crossbow Expert`.
  - Sharpshooter: No disadvantage when shooting at long range with
    - A flag on the Actor `flags.automated-conditions-5e.sharpShooter | Override | 1` or
    - An Item named `Sharpshooter`.
- **Show/hide roll dialog tooltips (default on)**
- **Exhaustion automation (default on)**
  - If you want to not automatically process Exhaustion conditions uncheck this. Doing so will allow for other exhaustion modules to alter exhaustion automation or your own rules.
- **Encumbrance automation (default off)**
  - Dnd5e v3.x system offers a setting for Encumbrance rules. If that is set to `Variant`, and you turn this AC5e setting on, ability checks, attack rolls, and saving throws that use Strength, Dexterity, or Constitution will have disadvantage.
- **Targeting options (default From source only)**
  - When 0 or more than 1 targets are selected, AC5e will not be able by default to calculate correctly advantageMode/damageMode as this is done based on the first of the game.user.targets only. There is now a setting for the GM to decide how AC5e will deal with targeting and rolling an Attack or Damage, or try to Use an Item that has an attack and Target any of the Individual target options in its details tab. The options are as follows:
    - *From Source Only*: The advantageMode/damageMode will be calculated based on effects/conditions etc on the Source actor only (default option),
    - *Do nothing*: No calculations whatsoever will take place,
    - *Enforce targeting*: Will cancel the incoming Roll or Item use, and display a warning for the user to target 1 Target (Use with caution).

# Compatibility
- [x] Core highlights the correct buttons to press depending on the conditions on attacker and target, and Fast Forwards correctly.
- [ ] MidiQOL semi-compatible (needs tweaks)
- [ ] Ready Set Rolls semi-compatible (needs tweaks)
- [ ] Roll Groups, not tested.

# Credits
- Special thanks to [Zhell](https://github.com/krbz999) for using some of his code from [Babonus](https://github.com/krbz999/babonus).
