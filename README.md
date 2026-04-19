# Automated Conditions 5e
![Latest Version](https://img.shields.io/badge/dynamic/json.svg?url=https://api.github.com/repos/thatlonelybugbear/automated-conditions-5e/releases/latest&label=AC5E%20Version&query=$.tag_name&colorB=yellow&style=for-the-badge)
![Total Download Count](https://img.shields.io/github/downloads/thatlonelybugbear/automated-conditions-5e/total?color=2b82fc&label=TOTAL%20DOWNLOADS&style=for-the-badge)
![Latest Release Download Count](https://img.shields.io/github/downloads/thatlonelybugbear/automated-conditions-5e/latest/total?color=2b82fc&label=LATEST%20DOWNLOADS&style=for-the-badge)
[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https://forge-vtt.com/api/bazaar/package/automated-conditions-5e&colorB=68a74f&style=for-the-badge)](https://forge-vtt.com/bazaar#package=automated-conditions-5e)
<br>
![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/dndv2/module.json&label=Foundry%20Version&query=$.compatibility.minimum&colorB=ff6400&style=for-the-badge)
![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/v12/module.json&label=Foundry%20Version&query=$.compatibility.minimum&colorB=ff6400&style=for-the-badge)
![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/v13/module.json&label=Foundry%20Version&query=$.compatibility.minimum&colorB=ff6400&style=for-the-badge)
![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/main/module.json&label=Foundry%20Version&query=$.compatibility.verified&colorB=ff6400&style=for-the-badge)
<br>
![Dnd5e System Compatible Version](https://img.shields.io/badge/dnd5e-2.4.1-red?style=for-the-badge)
![Dnd5e System Compatible Version](https://img.shields.io/badge/dnd5e-3.3.1-red?style=for-the-badge)
![Dnd5e System Compatible Version](https://img.shields.io/badge/dnd5e-4.4.4-red?style=for-the-badge)
![Dnd5e System Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/v13/module.json&label=dnd5e%20Version&query=$.relationships.systems[0].compatibility.verified&colorB=red&style=for-the-badge)

## Description
A Foundry VTT module for the D&D 5e game system that allows status effects and custom AC5e flags to dynamically influence any roll, including attacks, saves, ability checks, and damage. It highlights the correct roll button based on active effects and the 5e ruleset, ensuring rolls are made with the proper advantage, disadvantage, bonuses, or critical damage.

The module supports **auras** and **granting modes** that can affect nearby allies or enemies, automatically applying condition-based bonuses, penalties. etc. AC5e flags allow evaluation of data from the rolling actor, opposing actor, and aura source actors — enabling automation of more complex, context-sensitive scenarios.

<hr>
If you like what I do, consider supporting this lonely bugbear 🐾

Every shiny gold coin helps keep the ideas flowing and the goblins at bay.


<a href="https://www.patreon.com/thatlonelybugbear"><img src="https://img.shields.io/badge/-Patreon-%23f96854?style=for-the-badge&logo=patreon"/></a>
<a href="https://ko-fi.com/thatlonelybugbear"><img src="https://img.shields.io/badge/Ko–fi-00ADEF?style=for-the-badge&logo=kofi&logoColor=white"/></a>
<br/>
<br/>
You can also join the Bugbear’s Den to hang out, get help, or check what I might be working on!

<a href="https://discord.gg/KYb74fcsBt"><img src="https://img.shields.io/discord/1226846921474310194?style=for-the-badge&logo=discord&label=Discord&labelColor=%231c1e1f&color=%235865f2&link=https%3A%2F%2Fdiscord.gg%KYb74fcsBt"/></a>
<hr>

## Dnd5e Conditions supported
> [!IMPORTANT]
> The module will adjust it's behavior based on the 5e system's setting, for Modern vs Legacy rules.
For example if Modern rules are selected, AC5E will not handle Exhaustion, but respect the system's handling.
Small adjustments for differences in the rest of the conditions too, as needed.

<details>
  <summary><b>Legacy Rules</b></summary>
  
- `Blinded`: Disadvantage on attacks and grants advantage to attack from others
- `Exhaustion 1`: Disadvantage on ability checks (and skill checks as a result)
- `Exhaustion 2`: no changes
- `Exhaustion 3`: Disadvantage on attacks and saving throws
- `Exhaustion 4`: no changes
- `Exhaustion 5`: no changes
- `Frightened`: Disadvantage on ability checks and attack rolls;
- `Invisible`: Advantage on attacks and grants Disadvantage to attacks by others
- `Paralyzed`: Auto fail (-99) strength/dexterity saves and attacker within 5ft of the creature deals critical damage
- `Petrified`: Grants Advantage on attacks by others, auto fail strength/dexterity saves
- `Poisoned`: Disadvantage on attacks and ability checks
- `Prone`: Disadvantage on attacks, grants advantage on attacks by others if within 5ft, otherwise grants disdvantage
- `Restrained`: Disadvantage on attacks and dexterity saves, grants advantage on attacks by others
- `Stunned`: Auto fail strength/dexterity saves, grants advantage on attacks by others
- `Unconscious`: Auto fails strength/dexterity saves, grants advantage on attacks by others, crit if hit within 5ft ++ Prone
</details>

<details>
  <summary><b>Modern Rules</b></summary>
  
- No `exhaustion` automation, as this is handled by the system,
- `Grappled` will give disadvantage on all attacks, except for ones against your Grappler,
- `Hiding` will give advantage on initiative rolls,
- `Incapacitated` will give disadvantage on initiative rolls, in addition to the legacy rules,
- `Invisibility` will give advantage on initiative rolls, in addition to the legacy rules.
</details>

## AC5e flags: `flags.automated-conditions-5e`
Using the offered module flags in Active effects, you can affect rolls of actors, against actors or actors within the range of auras!!

More info in: <https://github.com/thatlonelybugbear/automated-conditions-5e/wiki/Flags-functionality>

> 💡 If you have DAE module enabled, the flags can be auto completed in the DAE effect sheets.

## Developer hook: status effect overrides
If you are integrating another module and want to customize AC5E status behavior, wait for the AC5E ready hook and then register overrides.

```js
Hooks.on("ac5e.statusEffectsReady", ({ tables, overrides }) => {
  const overrideId = overrides.register({
    name: "Example: ignore prone attack disadvantage for a specific actor",
    status: "prone",
    hook: "attack",
    type: "subject",
    priority: 10,
    when: ({ context }) => context.subject?.name === "Minotaur",
    apply: ({ result }) => (result === "disadvantage" ? "" : result)
  });

  // Store overrideId if you want to remove it later:
  // overrides.remove(overrideId);
});
```

`overrides` API:
- `register({ ... })` returns an override id.
- `remove(id)` removes one override.
- `clear()` removes all overrides.
- `list()` returns current registered overrides.

### On-demand status suppression
You can suppress a status by setting an actor flag like `noProne`.

Example Active Effect change keys:
- `flags.automated-conditions-5e.noProne` -> `true`

AC5E tooltips will show the suppressing entry under `Suppressed Statuses`.

### Cadence utility
AC5E exposes a cadence reset helper:

```js
// Reset cadence usage buckets for the current combat.
await ac5e.cadence.reset();

// Reset cadence usage buckets for a specific combat.
await ac5e.cadence.reset({ combatUuid: game.combat?.uuid });
```

### Usage rules utility
AC5E exposes dynamic usage-rule registration:

```js
ac5e.usageRules.register({
  key: "isSneak",
  hook: "damage",
  target: "subject",
  mode: "bonus",
  value: "@scale.rogue.sneak-attack",
  cadence: "oncePerTurn",
  condition: "(rwak || (mwak && fin)) && hasAdvantage",
  optin: true,
  name: "Sneak Attack",
  scope: "universal"
});
```

Quick helpers:

```js
ac5e.usageRules.list();
ac5e.usageRules.showKeys();
```

Persistence notes:
- Runtime registration is client-local.
- `persistent: true` stores world-level rules through a GM-authorized setting update.
- `evaluate` functions are runtime-only and are not persisted; use `condition` strings for persistent rules.
- `scope: "effect"` (default) is keyword-only (for effect-driven flags).
- `scope: "universal"` also injects a global pseudo-rule entry.
- Standalone booleans such as `optin`, `criticalStatic`, and `partialConsume` are supported in object-form `register({...})` definitions as well as raw `value: "..."` strings.
- Compatibility note: AC5E opt-ins depend on roll configuration dialogs. If another module forces `dialog.configure = false`, opt-in selection UI will not appear.

See full developer API details in `wiki/Usage-Rules-API.md`.

### Troubleshooter utility
AC5E exposes snapshot/export/import helpers for troubleshooting environment drift.

```js
// Build a snapshot object in memory.
const snapshot = ac5e.troubleshooter.snapshot();

// Export snapshot as JSON download.
ac5e.troubleshooter.exportSnapshot();

// exportSnapshot() includes lint data by default at snapshot.ac5e.lint.
// If you need a snapshot without lint:
const noLintSnapshot = ac5e.troubleshooter.snapshot({ includeLint: false });

// Import by opening a file chooser dialog and log parsed content in console.
const imported = await ac5e.troubleshooter.importSnapshot();

// Optional: still accepts a File object directly.
const importedFromFile = await ac5e.troubleshooter.importSnapshot(file);
```

Snapshot includes:
- AC5E settings.
- AC5E lint report under `ac5e.lint` (enabled by default).
- Foundry/system/module versions (AC5E, Midi-QOL, DAE, Times Up, Chris's Premades).
- Grid/canvas fields (`gridDiagonals`, grid type/distance/units/size).
- DnD5e rules version (`modern` vs `legacy`).
- Scene vision/environment info (`tokenVision`, `environment`, `globalLight.enabled`).

## Module Settings
<details>
  <summary><b>Quick walkthrough</b></summary>
  
- `Expanded Conditions` **(default off)**
  - `Dodging`: Attacker disadvantage if target not incapacitated, restrained and can see attacker (attacker doesn't have the Hiding condition). Also advantage on dex saves.
  - `Hiding`: Advantage on attacks.
- `Armor automation` **(default off)**
  - Ability Checks, Saves and Attack Rolls for (STR || DEX) based rolls, if the Actor is not proficient in the equipped suit of Armor.
  - Imposes disadvantage on Stealth checks when the relevant property of the Armor is selected.
  - From dnd5e v3.1.2 onwards, any Equipment type Item can impose stealth disadvantage too, not only Armor.
- `Casting spells checks automation` **(default Do nothing)**
  - When rolling a spell item, checks for:
    - Not being proficient in the equipped armor,
    - Raging (or Rage) active effect,
    - Silenced status and neither an active effect named Subtle Spell (localized), nor a `flags.automated-conditions-5e.subtleSpell | Override | 1`.
  - If set to `Enforce`, if any of the above are true, spell's use will be disallowed.
  - If set to `Warn`, there will be just a warning toast instead.
  - If set to `Do nothing`, well why should it do something?! :D
- `Range automation` **(default off)**
  - Attacking with a ranged weapon at long range imposes disadvantage on the roll (`Long Range`).
  - Attacking with a ranged weapon, when an enemy is adjacent, imposes disadvantage on the roll (`Nearby Foe`);
    - Added a separate setting for Nearby Foe (default off).
  - Attacking with a ranged weapon at a distance longer than the long range, imposes a fail on the roll (`Out of Range`).
  - These checks can be overridden per-effect (including `grants` and `aura`) using `range` flags:
    - `nearbyFoeDisadvantage` / `noNearbyFoeDisadvantage`
    - `longDisadvantage` / `noLongDisadvantage`
    - `fail` / `outOfRangeFail` / `noFail` / `noOutOfRangeFail`
  - Crossbow Expert: Ignores Nearby Foes with
    - A flag on the Actor `flags.automated-conditions-5e.crossbowExpert | Override | 1` or
    - An Item named `Crossbow Expert`.
  - Sharpshooter: No disadvantage when shooting at long range with
    - A flag on the Actor `flags.automated-conditions-5e.sharpShooter | Override | 1` or
    - An Item named `Sharpshooter`.
- `Show AC5e tooltips` for both Roll Dialog and Chat messages or any combination of these **(default both)**
- `Exhaustion automation` **(default on)**
  - If you want to not automatically process Exhaustion conditions uncheck this. Doing so will allow for other exhaustion modules to alter exhaustion automation or your own rules (eg [Alternative Exhaustion 5e](https://foundryvtt.com/packages/alternative-exhaustion-5e)).
- `Encumbrance automation` **(default off)**
  - Dnd5e v3.x system offers a setting for Encumbrance rules. If that is set to `Variant`, and you turn this AC5e setting on, ability checks, attack rolls, and saving throws that use Strength, Dexterity, or Constitution will have disadvantage.
- `Targeting options` **(default From source only)**
  - When 0 or more than 1 targets are selected, AC5e will not be able by default to calculate correctly advantageMode/damageMode as this is done based on the first of the game.user.targets only. There is now a setting for the GM to decide how AC5e will deal with targeting and rolling an Attack or Damage, or try to Use an Item that has an attack and Target any of the Individual target options in its details tab. The options are as follows:
    - `From Source Only`: The advantageMode/damageMode will be calculated based on effects/conditions etc on the Source actor only (default option),
    - `Do nothing`: No calculations whatsoever will take place,
    - `Enforce targeting`: Will cancel the incoming Roll or Item use, and display a warning for the user to target 1 Target (Use with caution).
- **For D&D5e v3.1**
  - Added `dnd5e.preRollConcentration` hook to deal with conditions affecting concentration saving throws.
    - Exhaustion 3-5 applies disadvantage.
    - Heavy Encumbrance applies disadvantage.
    - War Caster named Item applies advantage.
</details>

## Compatibility
- [x] Core highlights the correct buttons to press depending on the conditions on attacker and target, and Fast Forwards correctly
- [X] MidiQOL
- [ ] Ready Set Roll unknown compatibility currently. If the module is updated at some point, I will take another look.
 
## Credits
- Special thanks to [Illandril](https://github.com/illandril) for using some of his code from [Illandril's Token Tooltips](https://github.com/illandril/FoundryVTT-token-tooltips) for distance calculations.
- Special thanks to [Tim](https://gitlab.com/tposney) for parts of code used, from his [MidiQOL](https://gitlab.com/tposney/midi-qol) module!!

## Manual installation
<https://github.com/thatlonelybugbear/automated-conditions-5e/releases/latest/download/module.json>
### For dnd5e v3.x, use manifest: 
<https://github.com/thatlonelybugbear/automated-conditions-5e/releases/download/v12.331.3.2/module.json>
### For dnd5e v2.x, use manifest: 
<https://raw.githubusercontent.com/thatlonelybugbear/automated-conditions-5e/dndv2/module.json>

