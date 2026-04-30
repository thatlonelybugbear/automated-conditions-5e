# Automated Conditions 5e: Roll Flags Guide

Applies to version: `13.5250.18`

AC5e processes Active Effects with relevant module flags. If the effect's condition evaluates to `true`, it alters the relevant roll accordingly.

> 💡 Using in console `ac5e.logEvaluationData = true` outputs the available evaluation data in console after creation. A quick way to familiarize yourselves with what is available to use!

---

## Flag Types

### `flags.automated-conditions-5e.ACTIONTYPE.MODE`

Affects **rolls made by the actor** who has an Active effect with this flag.

Short alias is also accepted: `flags.ac5e.ACTIONTYPE.MODE`.

---

### `flags.automated-conditions-5e.aura.ACTIONTYPE.MODE`

Affects **rolls made by other actors** whose token is within range of the source token.

#### Required:
- `radius=10;` — Sets the aura range in grid units.

#### Optional:
- `singleAura;` – Only one aura of the same name applies (strongest or closest).
- `includeSelf;` – Affects the aura source as well.
- `allies;` – Affects only allies of the aura source.
- `enemies;` – Affects only enemies of the aura source.
- `wallsBlock;` - Walls between the aura source and subject actor will block the aura.

If neither `allies` nor `enemies` is used, the aura affects all tokens in range.

---

### `flags.automated-conditions-5e.grants.ACTIONTYPE.MODE`

Affects **rolls made against the actor** (i.e., when the actor is the *target* of the roll).

---

## How to Use

### Step 1: Choose `ACTIONTYPE`

Replace `ACTIONTYPE` with a roll type to affect:

#### General Types:
- `all`
- `attack`
- `check`
- `damage`
- `save`

#### Specific Types:
- `concentration`
- `death`
- `initiative`
- `skill`
- `tool`
- `use` (supported for `fail`)

---

### Step 2: Choose `MODE`

Replace `MODE` with one of the following:

- `advantage` - Grants advantage
- `noAdvantage` - Suppresses advantage
- `disadvantage` - Imposes disadvantage
- `noDisadvantage` - Suppresses disadvantage
- `critical` - Forces a critical success
  - For damage flags, `addTo=<damageType>` can localize critical application to matching damage parts.
- `noCritical` - Suppresses criticals
- `fumble` - Forces a critical failure  
- `success` - Treats the roll as a success  
- `fail` - Treats the roll as a failure  
- `bonus` - Adds a numeric or calculated bonus  
  - When using `MODE = bonus`, include: `bonus=XXX;` where XXX is:
    - A fixed number (e.g., bonus=2;)
    - A formula, referencing actors via:
      - `@` or `rollingActor` - e.g., `@abilities.cha.mod` or `rollingActor.cha.mod`
      - `#` or `opponentActor` - e.g., `##attributes.spell.dc` or `opponentActor.concentration.effects.size`
      - `auraActor` - e.g., `auraActor.attributes.ac.value` for any aura related ones.
   - For damage rolls, `bonus=1d6[fire]` adds 1d6 fire damage, and `bonus=2[necrotic]` adds 2 flat necrotic damage, while `bonus=1d6` adds 1d6 damage of the same type as the relevant damage part, and `bonus=1d6[random]` adds 1d6 damage of a random type every time the roll is evaluated.
   - Multi-type inline damage is also supported, for example `bonus=1d4[fire, lightning, thunder]`. AC5E creates a synthetic bonus damage part and D&D 5e's native damage-type dropdown chooses which of the offered types that part will use.
- `modifier`:
   - Adds `max` or `min` modfiers to **d20 rolls**: `modifier=(rollingActor.attributes.hp.pct > 50 ? min15 : max10)` which will roll `1d20min15` when the rolling actor's health is above 50% and `1d20max10` otherwise
   - Adds [Foundry roll modifiers](https://foundryvtt.com/article/dice-modifiers/) to **damage rolls**.
      - Use `modifier=adv` for damage _advantage_ and `modifier=dis` for _disadvantage_.
- `extraDice` - Adds or multiplies dice count on damage terms.
   - Use `bonus=Number` to add dice count, for example `bonus=2` on `1d8` -> `3d8`.
   - Use `bonus=x2` or `bonus=^2` to multiply dice count, for example `2d12` -> `4d12`.
   - Add `criticalStatic` to make the extra dice not to be multiplied on a crit.
   - `criticalStatic; bonus=1` adds one extra matching die term.
     - `bonus=1` will be multiplied on a crit
- `diceUpgrade` - Upgrades damage dice step (`d6` -> `d8`) by the provided steps.
- `diceDowngrade` - Downgrades damage dice step (`d8` -> `d6`) by the provided steps.
- `typeOverride` - Replaces the damage type set of matching base/native damage rolls.
   - Include `set=fire` to force a single type.
   - Include `set=fire,lightning,thunder` to offer multiple damage types through D&D 5e's native dropdown.
   - `addTo=...` targeting works the same way as other damage-entry modes.
   - Current limitation: `damage.typeOverride` applies to base/native damage rolls only, not to synthetic appended bonus damage parts.
- `range` - Adjusts ranged profile values and ranged-penalty behavior.
   - Use the shared `flags.automated-conditions-5e.range` surface for range automation. Do not use legacy `...attack.range` paths for new flags.
   - You can use `bonus`, `short`, `long`, `reach`.
   - Canonical toggle keys for ranged checks are:
      - `longDisadvantage` / `noLongDisadvantage`
      - `nearbyFoeDisadvantage` / `noNearbyFoeDisadvantage`
      - `outOfRangeFail` / `noOutOfRangeFail`
   - Legacy aliases such as `fail`, `noFail`, `nearbyFoes`, and `noNearbyFoes` are still accepted for compatibility, but the canonical names above are preferred.
   - Example:
      - `key: flags.automated-conditions-5e.range`
      - `value: short=120; noLongDisadvantage` will set the short range to 120 and suppress long range disadvantage for the roll.
      - `value=+20; noLongDisadvantage` will add 20 to the short range and suppress long range disadvantage for the roll.
   - Granular keys such as `flags.automated-conditions-5e.range.short` are still supported when that shape is more convenient.
      - Use a direct value or expression there, for example `2` or `(rollingActor.statuses.prone ? +5 : 0)`, not packed `short=...; ...` syntax.
- Special case `modifyAC` - Adds a numeric or calculated bonus to the AC of actors.
   - Include `bonus=XXX` in the effect value, following the same logic as a normal bonus to be added or subtracted from the default roll's DC.
   - Or include `set=XXX` in the effect value to **set** the AC to the specified value (number or dice roll).
   - You do not need to select an ActionType for that mode, and it will always just affect attack rolls.
   - `flags.automated-conditions-5e.modifyAC` will modify the AC of the actor it has the affect on.
   - `flags.automated-conditions-5e.grants.modifyAC` will modify the AC of the target of an attack made by the actor that has the affect on.
   - `flags.automated-conditions-5e.aura.modifyAC` will modify the AC of the actors in the radius.
   - Caveat with MidiQOL: Midi may snapshot `flags.dnd5e.targets` during `preRollAttack` and not pick up later AC5e target rewrites. Validate `modifyAC` behavior in your Midi workflow setup.
- `modifyDC`: Adds a numeric or calculated bonus to the DC of the rolled action
   - Include `bonus=XXX` in the effect value, following the same logic as a normal bonus to be added or subtracted from the default roll's DC.
   - Or include `set=XXX` in the effect value to **set** the DC to the specified value (number or dice roll).
   - With MidiQOL save/check cards, AC5E updates the displayed item-card DC after final resolution.
   - If a shared card represents mixed per-target modified DCs, the shared label is marked as `DC X (*)` and the per-target Midi attribution remains the detailed source of truth.
- `criticalThreshold` - Alters the threshold for critical on d20 attack rolls.
    - `threshold=(opponentActor.creatureType.includes('dragon') ? -2 : -1)` which, when the opponent is a Dragon, will reduce the critical threshold by `2`, otherwise it is reduced by 1. If you increase the critical threshold to more than 20, you won't be able to crit :wink:
    - You can also use dice rolls, `threshold=1d4` will add the result to the critical threhold
    - Or include `set=XXX` in the effect value to **set** the critical threshold to the specified value (number or dice roll).
    - `set=` also accepts numeric expressions with dice and math helpers such as `min(...)`, `max(...)`, `round(...)`, `floor(...)`, `ceil(...)`, and `abs(...)`.
      - Example: `set=min(4, 1d8)`
- `fumbleThreshold` - Alters the threshold for fumble on d20 attack rolls.
    - Same logic like the `criticalThreshold` flag above.
- `info` - Adds an informational AC5E entry without changing the rolled formula by itself.
   - Can be paired with `enforceMode=advantage`, `enforceMode=disadvantage`, or `enforceMode=normal` to force the final d20 roll mode after other advantage/disadvantage calculations.
   - Short aliases are also accepted: `adv`, `dis`, `norm`.
   - Canonical Active Effect usage:
     - `key: flags.automated-conditions-5e.attack.info`
     - `value: enforceMode=normal;`
   - When `enforceMode` wins, overridden pure d20-state entries (`advantage`, `disadvantage`, `noAdvantage`, `noDisadvantage`) do not consume `once`, cadence, or `usesCount`.


> 💡 For `criticalThreshold`, `fumbleThreshold`, `modifyAC` and `modifyDC` flags, you can use `set=` instead of the normal `threshold` or `bonus`, to **set** the value provided, instead of adding or subtracting from the actor values.

---


### Step 3: Add Conditions in the Effect's `value` Field

Conditions are **semicolon-separated** expressions evaluated using a dynamic "sandbox" of data relevant to the current roll.

> 💡 If **any one condition is true**, the roll is affected.

#### What Is the Evaluation Sandbox?

The sandbox contains detailed data about the actor performing the roll, potential targets, and other contextual information. This data can be referenced in condition expressions like so:

```js
rollingActor.abilities.cha.mod >= 4 &&  opponentActor.attributes.hp.pct < 50 && ['fire', 'cold'].some(type=>damageTypes[type]); opponentActor.statuses.incapacitated;
```

#### Keywords in effect's value field

| Key                    | Description |
|------------------------|-------------|
| `itemLimited`          | Will limit the effect to rolls of the source item |
| `enforceMode=normal/advantage/disadvantage` | For `info` entries on d20 hooks, forces the final resolved roll mode |
| `once`                 | Will apply the effect once |
| `usesCount=Number`     | Will limit the effect to the number of uses provided |
| `usesCount=origin`     | For actor owned items, uses from the item or activity origin of the effect will be consumed |
| `usesCount=UUID`       | For actor owned items, uses from the item or activity retrivable by the UUID will be consumed |
| `usesCount=Item.ID.Activity.ID`| `ID` can be either an `id`, `identifier` or `name`. The `Activity.ID` part is optional. If added, the uses from that activity will be consumed, otherwise from the relevant Item. |
| `usesCount=_, Number`  | If a comma separated Number is added, multiple uses will be consumed if available |
| `usesCount=ActorAttr, Number`   | Use consumable resources on the Actor instead of item/activity uses |
| | `ActorAttr` can be `hp`, `hpmax`, `hptemp`, `hd`, `hdlargest`, `hdsmallest`, `abilityXYZ` (like `str`), `senseXYZ` (like `darkvision`), `currency` (like `gp`), `spellXYZ` (like `pact` or `spell3`), `movementXYZ` (like `walk`), `exhaustion`, `inspiration`, `resources` (like `primary`, `legact` etc), or any of the actor's `flags` . |
| | For any hp `ActorAttr` which would lead to hp loss (temp or current), using `noconc` (or `noconcentration`, `noconcentrationcheck`) will disable concentration checks on that loss. |
|                        | The `Number` is optional. If omitted 1 use or relevant value will be consumed by default! |
| `partialConsume`       | For bounded `usesCount` targets, consume only the remaining available amount instead of failing when the full requested amount would exceed the cap |
| `optin`                | Shows the flag as an optional checkbox in the relevant roll dialog |
| `addTo=all`            | Targets all damage parts (where supported, e.g. `bonus`, `extraDice`, `diceUpgrade`, `diceDowngrade`, `critical`) |
| `addTo=fire,cold`      | Targets only matching damage types |
| `chance=Number`        | Applies only when a d100 roll is greater than or equal to the threshold |
| `name=Text`            | Custom label for tooltips/dialog opt-in entry |
| `description=Text`     | Custom opt-in description/reason text |
| `oncePerTurn` / `oncePerRound` / `oncePerCombat` | Cadence limits for usage. `cadence=turn|round|combat` aliases are supported. |
| `noProne` (and similar status keys) | Suppresses a specific status for roll automation while the effect is active. Current stable usage is boolean-style only, for example `true`. Conditional expressions and `optin` handling are reserved for later work. |

If multiple same-action-type entries are present on the same effect, AC5e disambiguates labels automatically (for example by appending `#2`).

> When `enforceMode` forces the final d20 mode, AC5E and MidiQOL attribution surfaces show the forced result and suppress overridden d20-state reasons for clarity.

> When using `once` or `usesCount` and the uses are depleted, the effect will either be disabled or deleted, based on it being a transfer effect or not.

> When using comma separated Number in usesCount, the item or activity will need to have at least that Number of available uses for the effect to apply

> With `partialConsume`, bounded counters such as death saves, item/activity uses, and local effect counters can still apply by consuming only the remaining available amount.

> 💡 When using comma separated Number in usesCount, a negative value will recover uses!

> Examples:

>`usesCount=Scene.9gP78CMgo7ZmATt2.Token.B7sWVuLXxDn5v3gS.Actor.sa8PesDM1sZviqJ6.Item.42AGHJQzJZfUYxF9, 2`

> `usesCount=Item.Longsword.Activity.attack, 2` will consume two uses of the activity with the `attack` identifier from the first item that is named Longsword on the Actor that has the effect applied.

> `usesCount=Item.Longsword, Ablaze` will consume one use from an item named `Longsword, Ablaze`

>`bonus=1d6[force]; once; itemLimited; opponentActor.attributes.hp.pct < 50 && opponentActor.statuses.prone`

#### Actor Roles in the Sandbox

Depending on the type of roll, actors are categorized like this:

- **`effectActor`** - the actor that has the effect applied on.
  - Depending on the type of roll, this can be equal to `rollingActor` (attack, damage, use hooks), or `opponentActor` (checks, saves)
- **`nonEffectActor` - the actor that isn't the `effectActor` 😅 
- **`rollingActor`** – the actor performing the roll.
- **`opponentActor`** – the opposing actor (if any). For example:
  - During an **attack**, this is the target of the attack.
  - During a **saving throw**, this is the actor whose item or effect triggered the save.
    - `targetActor` for backwards compatibility only; use opponentActor instead.
- **`auraActor`** – only present if the roll is affected by an aura. Represents the aura's source.
- **`effectOriginActor`** - the actor that is the owner/source of the origin of an effect.

---
#### What Data Can I Use?

Each actor type (`xyzActor`, matching the one mentioned just above, eg rollingActor, auraActor) includes the following

#### `system` Data (Actor's abilities, attributes, etc.)
This mirrors the Foundry system data structure. Example fields:
```js
xyzActor.abilities.cha.mod       // Charisma modifier
xyzActor.attributes.hp.value     // Current HP
```

#### `token` Data (from the active scene token)
Includes token-specific information:
```js
xyzActor.token.name
xyzActor.uuid                 // the token.actor.uuid
xyzActor.tokenSize            // token.width x token.height
xyzActor.tokenElevation       // token.document.elevation
xyzActor.tokenSenses          // List of token's detection modes
xyzActor.tokenUuid            // Unique token UUID
xyzActor.combatTurn           // If in combat, its combat turn (Number starting from 0, for the one with highest initiative)
xyzActor.isTurn               // If in combat, true if it is that actor's turn
xyzActor.movementTurn         // If in combat, the movement during its last turn
xyzActor.movementLastSegment  // If in combat, the distance travelled in the last segment (last 2 way points) of its movement during its last turn.
```

#### `effects` and equipment
```js
xyzActor.currencyWeight
xyzActor.effects                   // List of enabled active effects
xyzActor.equippedItems.names       // Array of equipped item names
xyzActor.equippedItems.identifiers // Array of equipped item identifiers
xyzActor.hasArmor                  // If the actor has a suit of armor equipped
xyzActor.hasArmorLight             // If the armor equipped is light
xyzActor.hasArmorMedium            // If the armor equipped is medium
xyzActor.hasArmorHeavy             // If the armor equipped is heavy
xyzActor.hasShield                 // If the actor has a shield equipped
xyzActor.items                     // Array of items (not the actual document)
xyzActor.level                     // Returns the level or the CR of the actor
```

#### `statuses`
Includes token statuses like `prone`, `bloodied`, etc.
```js
xyzActor.statuses.prone  // true if the rolling actor is prone
```

#### Creature Type
An Array of data, derived from race or custom type:
```js
xyzActor.creatureType.includes('elemental') || opponentActor.creatureType.includes('green')
```

### Global or Roll-Specific Context

In addition to actor data, some useful values are also available:

| Key                    | Description |
|------------------------|-------------|
| `actorId`              | The rolling actor's ID |
| `actorUuid`            | The rolling actor's UUID |
| `tokenId`              | Rolling actor's active token ID |
| `tokenUuid`            | Rolling actor's active token document UUID |
| `canMove`              | `true` if the rolling actor has at least a non zero movement type |
| `canSee`               | `true` if the rolling actor can see the target |
| `isTurn`               | `true` if it's currently the rolling actor's turn |
| `opponentActorId`      | The opponent actor's ID if any |
| `opponentActorUuid`    | The opponent actor's UUID if any |
| `opponentId`           | The opponent token's ID if any |
| `opponentUuid`         | The opponent token's document UUID if any |
| `opponentAC`           | The opponent actor's AC value |
| `isSeen`               | `true` if the opponent can see the rolling actor |
| `isOpponentTurn`       | `true` if it's the opponent's turn |
| `ability`              | the associated ability of a roll; usage `ability.str` |
| `skill`                | if relevant roll; usage `skill.acr` |
| `tool`                 | if relevant roll; usage `tool.thief` |
| `distance`             | Distance between rolling and target token if both available |
| `hasAttack`            | `true` if the activity has an attack |
| `hasAdvantage`         | `true` if the attack had advantage |
| `hasDisavantage`       | `true` if the attack had disadvantage |
| `isCritical`           | `true` if the d20 roll was a critical |
| `isFumble`             | `true` if the d20 roll was a fumble |
| `hasDamage`            | `true` if the activity deals damage |
| `hasHealing`           | `true` if the activity heals |
| `hasSave`              | `true` if the activity is a save |
| `isConcentration`      | `true` if this is a concentration check |
| `isInitiative`         | `true` if this is an initiative roll |
| `isDeathSave`          | `true` if this is a death saving throw |
| `isCantrip`            | `true` if the rolling item is a cantrip |
| `isSpell`              | `true` if the rolling item is a spell |
| `spellLevel`           | spell slot level used if relevant |
| `castingLevel`         | spell slot level used if relevant |
| `baseSpellLevel`       | the item's original spell level if relevant |
| `scaling`              | the difference between spellLevel and baseSpellLevel if relevant |
| `attackRollTotal`      | if relevant, available after an attack roll has been made |
| `attackRollD20`        | if relevant, the attack dice result |
| `attackRollOverAC`     | the attack roll total minus the opponent's AC or undefined |
| `worldTime`            | Current world time in seconds |
| `combat`               | some combat data if one is active |
| `singleTarget`         | true if there is only 1 target selected |
| For v5.1.x             | |
| `movementLastSegment`  | when in combat, returns the distance of the rollingActor's token's last movement distance, between the 2 last waypoints) |
| `movementTurn`         | when in combat returns the distance the rollingActor's token has travelled during that turn |
| `effectOriginTokenId`  | ID of the effect's origin active token |

### Activity and Item Data

If the roll involves a specific action or item, you'll also have access to:

### `activity`
- `activity.name`
- `activity.activation.type` — e.g., `action`, `bonus`, `reaction`
- `activity.actionType` — e.g., `mwak`, `rsak`, `save`
- `activity.type` — item type (e.g., `spell`, `feat`)
- `activity.damageTypes` — array of damage types involved

### `item`
- `item.name`, `item.school` (for spells), etc
- `item.identifier`
- `item.classIdentifier`
- `item.properties` or `itemProperties`
- `item.type` is essentially an object that contains the basic data of the item rolled, for example: `{value: 'martialR', baseItem: 'longbow', label: 'Martial Ranged', identifier: 'Compendium.dnd5e.equipment24.Item.phbwepLongbow000'}`
- `itemType` is one of the following `equipment`, `feat`, `spell`, `tool`, `weapon` etc (full list in `CONFIG.Item.typeLabels`)

All these are accessible directly as paths. For example:
```text
(itemProperties.mgc && itemProperties.fin) || (itemName.Claw && damageTypes.poison)   // true if either an the roll involves a magical finesse weapon, or one named Claw and dealing poison damage
```

### Damage Types
If the activity deals specific damage types, each one is added to the sandbox:
```text
damageTypes.cold || damageTypes.fire  // true if the damage type is either cold or fire
```

### Action Types
If the activity has an action type (e.g., `mwak`, `rsak`, `save`, etc.), that is also flagged:
```text
actionType.mwak // true for Melee Weapon Attack
```
These work in combination with other flags:
```text
actionType.mwak && damageTypes.fire // true for fire-dealing melee weapon attacks
```

---

## Config and Utilities

The sandbox also exposes some config constants:
```js
CONFIG = {
  abilities, skills, tools, damageTypes, spellSchools,
  attackModes, actionTypes, itemProperties, etc.
}
```
And helpers like:
```js
checkDistance(), checkVisibility(), checkCreatureType(), checkArmor()
```

---

This sandbox gives you powerful control over **when** a specific AC5e module flags should apply, letting you create smart, level-aware, context-sensitive automation with minimal code.
