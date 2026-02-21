## 13.5250.6
* Compatibility note: AC5E opt-ins require roll configuration dialogs; if another module enforces `dialog.configure = false`, opt-in controls cannot be presented.
* Opt-in dialog entries are now split into two <fieldset>:
  * `AC5E` for normal self-sourced opt-ins.
  * `AC5E Ask for permission` for opt-ins sourced from actors other than the rolling actor.
    * For ask-permission entries, labels include the source actor name to make ownership context explicit.
    * Attack `modifyAC` opt-ins now use context-aware routing:
      * `flags.ac5e.modifyAC` entries route to ask-permission.
      * `flags.ac5e.grants.modifyAC` entries remain in the main `AC5E` fieldset.
      * `flags.ac5e.aura.modifyAC` entries stay in `AC5E` only when the aura source is the rolling actor; otherwise they route to ask-permission.
  * Non-opt-in entries remain treated as GM-authorized automation.
* Cadence related changes:
  * Fixed cadence reset behavior for `oncePerTurn` entries so opt-in and non-opt-in cadence flags unlock correctly on turn changes.
  * Cadence persistence now replaces the full `flags.automated-conditions-5e.cadence` object to prevent stale nested usage entries from surviving updates.
  * Hardened AC5E effect-deletion handling against double-delete races with other combat/effect automation modules:
    * Duplicate UUID deletions are deduped before dispatch.
    * Missing-document delete errors are treated as no-op instead of noisy failures.
* Roll dialogs now keep AC5E's chosen default button focused more reliably, even when other modules try to move focus.
* Final Stand presentation was tightened for HP-consuming effects:
  * Non-opt-in entries are only converted to Final Stand when they would drop HP to `0` or below.
  * Effects that do not risk dropping HP are no longer forced into disabled opt-in checkboxes.
* DAE autocomplete now shows only canonical AC5E keys under `flags.automated-conditions-5e.*` for cleaner authoring.
  * Short aliases like `flags.ac5e.*` remain supported at runtime, but their usage is discouraged.
* Added `no<Status>` support across `source`, `grants`, and `aura` paths, including keys like `flags.automated-conditions-5e.grants.noProne`.
  * Status override tooltips can now include override names for clearer context.
    * Example: `Prone (Ignore Prone in Rage)`.
* Added a context keyword registry API for reusable evaluation aliases.
  * Runtime registration: `ac5e.contextKeywords.register({ key, expression })` or `ac5e.contextOverrideKeywords.myKeyword = (context) => ...`
  * Persistent world registration: `ac5e.contextKeywords.registerPersistent({ key, expression })`
  * Hook and helpers: `ac5e.contextKeywordsReady`, `isPlayerPersistEnabled`, `setPlayerPersistEnabled`
* Added `ac5e.usageRules` API for runtime rule registration and opt-in/cadence-compatible injections.
  * Supports `register/remove/clear/list`, plus `canPersist` and `reloadPersistent`.
  * Added `persistent: true` registration path for world-level usage rules stored in module settings.
  * Runtime registrations remain client-local.
  * `evaluate` function rules are runtime-only; persistent rules must use serializable expression fields (for example `condition`).
  * Usage-rule opt-in labels now avoid duplicate naming when a provided `name` matches the primary rule/effect label.
  * Added `scope` support:
    * `scope: "effect"` (default) keeps the rule as an effect-driven keyword helper.
    * `scope: "universal"` additionally emits direct pseudo-rule entries for global application.
* Troubleshooter snapshots now include an AC5E flag lint report to help quickly spot malformed keys, typo-like keywords, and other risky flag entries.
* Flag parsing and warnings are now more reliable, reducing false positives and correctly treating standard condition expressions (for example `targetUuid === "0"`).
* Improved runtime resilience and tooltip clarity for advanced flags:
  * Better handling of malformed `once`/`usesCount` references to avoid queued-job crashes.
  * Threshold-style tooltip labels now render cleanly instead of showing `[object Object]`.
* Fixed a dialog-cancel edge case for attack rolls where canceling with targets selected could log `roll.evaluate is not a function`.
  * AC5E now avoids creating placeholder roll entries during live dialog updates and only mutates existing roll objects.

## 13.5250.5
### New Opt-in Features
* Added `optin` keyword, which transforms any AC5E flag into an optional add-on in the relevant roll dialog instead of a forced effect.
* Added opt-in metadata and labeling keywords for dialog UX, including `name=...` and `description=...`, with localized auto-description fallback and clearer target AC phrasing.
* Added opt-in usage timing keywords: `oncePerTurn`, `oncePerRound`, and `oncePerCombat`.
  * `oncePerTurn`: usable once per turn (and not blocked out of combat).
  * `oncePerRound`: refreshes on the owning combatant's next turn (and not blocked out of combat).
  * `oncePerCombat`: usable once per active combat.
* Added support for multiple same-action-type flags (opt-in or non-opt-in) in a single Active Effect.
  * Unnamed duplicates are now disambiguated automatically (for example `#1`, `#2`) in the roll dialog.
* Added Final Stand handling for HP-consuming `usesCount` flags: when usage would drop HP to `0` or below, the flag is exposed as an opt-in with a localized `Final stand (drops to X)` label suffix and fallback description support.
* Added support for localized damage critical opt-ins with `addTo=<damageType>` to apply critical handling only to matching damage parts.
* Added visibility gating for non-bonus damage opt-ins (such as `critical`, `noCritical`, `advantage`) based on currently selected damage types.

### New Damage Flag Capabilities
* Added `addTo` targeting support for damage flags across `bonus`, `extraDice`, `diceUpgrade`, and `diceDowngrade`.
  * Example: `bonus=2d6[acid];addTo=fire` applies only to fire damage parts.
  * Example: `bonus=^2;addTo=all` applies to every damage part.
* Added `extraDice` multiplier syntax for damage terms (`x2`, `X2`, `^2`).
* Added `@spellLevel` token support for damage bonus formulas, resolved from originating item-use data.

### Improved Dialog Stability and Compatibility
* Improved damage roll dialog stability so bonuses and extra dice no longer duplicate during re-renders or damage type changes.
* Improved third-party damage dialog compatibility (including C'est Sit Bon) by keeping damage parts stable during live dialog updates.
* Allowed self-targeted activities to be used when no explicit token target is selected.
* Prevented `usesCount` consumption when a roll is canceled before completion (empty post-roll `rolls` payload).

### Tooling and UX Updates
* Expanded DAE autocomplete support for AC5E flags, including `use.fail`, explicit action-type keys, and damage-only dice size keys for source/grants/aura paths.
* Improved pre-use fail warnings with `AC5E:` attribution, optional `description=` reason text, and `chance=<number>` roll context in feedback.
* Added granular range flag support for source/grants/aura contexts, including opt-in usage.
* Updated status automation to initialize tables once on ready, expose `ac5e.statusEffectsReady` for override registration, and support on-demand status suppression flags (for example `noProne`) with tooltip visibility.
  * Override example: `Hooks.on("ac5e.statusEffectsReady", ({ overrides }) => overrides.register({ status: "prone", hook: "attack", type: "subject", apply: ({ result }) => result === "disadvantage" ? "" : result }));`
  * Override helpers: `overrides.remove(id)`, `overrides.clear()`, `overrides.list()`.
  * Cadence reset helper: `await ac5e.cadence.reset()` (or `await ac5e.cadence.reset({ combatUuid })`).
* Added `ac5e.troubleshooter` snapshot helpers to export/import a diagnostics JSON package with AC5E settings, Foundry/system/module versions, and scene/grid configuration (`ac5e.troubleshooter.snapshot()`, `ac5e.troubleshooter.exportSnapshot()`, `ac5e.troubleshooter.importSnapshot(file)`).
* Synced locale key coverage so missing non-English keys are populated with English fallback values.
* Added a contributor documentation path, including a `Contributing.md` guide for anyone wanting to help with module documentation.

## 13.5250.3.2
* Fix for diagonal distance calculation when height difference is involved.
  * Closes [#716](<https://github.com/thatlonelybugbear/automated-conditions-5e/issues/716>)

## 13.5250.3.1
* Closes [#714](<https://github.com/thatlonelybugbear/automated-conditions-5e/issues/714>) - Fix for `activity` being undefined

## 13.5250.3
* Patched `CONFIG.Actor.documentClass.prototype.applyDamage` to include the `messageId` when it's triggered by a Chat message
  * `dnd5e.preApplyDamage` and `dnd5e.applyDamage` Hooks should now include `options.messageId` making it easier to retrieve relevant data.
* Added more options in the `checkNearby(tokenRef, dispositionRef, radius, parameters)` parameters Object.
  * `count` can now be:
    * `true`: returns the Number of valid tokens
    * `Number`: the function returns the Boolean result of the check `validTokens.length >= count`
  * `hasStatuses`: an Array of statuses that the valid tokens need to have to be included.
  * change for `radius` logic. If the user inputs `0`, the whole map will be checked.
  * for example: `checkNearby(tokenId, 'all', 0, {count: true, hasStatuses: ['silenced', 'deafened']})` will return the Number of tokens that are silenced and/or deafened
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## 13.5250.2
* Fix for damage enrichers throwing
* Fix for Heavy automation and actionTypes
* Fix for attack activities not applying their effects if MidiQOL is active and Save workflow data to chat messages setting is enabled.

## 13.5250.1
* Verified for D&D5e v5.2.5
* Refactored actionType assignment in sandbox
* Fixed some typos.

## 13.5240.2
* Ensure enchantment effects origins are not overwritten
* Sanitize `midiOptions` before cloning to avoid circular refs when MidiQOL is active.

## 13.5240.1.1
* Full items' roll data are no longer collected during `_ac5eActorRollData()` calls. A limited subset is now available instead.
  * `actorType.items`: `[{ name, id, identifier, uuid, uses, equipped }]`
  * `actorType.equippedItems.names`: Array of equipped item names
  * `actorType.equippedItems.identifiers`: Array of equipped item identifiers
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.5240.1
* Verified for D&D5e v5.2.4
* Added filters in `checkNearby()` for:
  * `partyMember` Boolean (default false) to return only `game.actors.party` members
  * `includeIncapacitated`, `false`, `true` or `'only'` (default false)
    * `'only'` will return only incapacitated tokens
* Added a Boolean world setting to show a warning when rolling from a token-less actor (rolling from sidebar actors is not yet fully supported).

## 13.5230.1
* System 5.2.3 compatibility bump
* Grappled condition for 2024 rules will only be testing for disadvantage if the grappled active effect has a proper origin. If it is toggled from the actor's effects tab or token assign status HUD, the disadvantage is up to the user to adjudicate.

## 13.5220.5
* Fix for destructuring errors when triggering ability rolls via macros
* Enhance current MidiQOL attacks attribution, creating a different category in the AC5e tooltips

## 13.5220.4
* Expand `usesCount` to consume from other actors too
  * `usesCount=opponentActor.exhaustion, -1` will add one exhaustion level on the opponent of the relevant roll.
 
## 13.5220.2.2
* Fix for attackMode changes during the Attack Roll configuration dialog not properly resetting the target's AC

## 13.5220.2.1
* Allow `bonus=info` to pass through so AE names appear in tooltips without requiring additional changes.
 * An AE named `Secret bonus` with a change value of `flags.automated-conditions-5e.save.bonus | bonus=info; once` will now show `Bonus: Secret bonus` in the tooltip without applying any actual bonus once before deleted.

## 13.5220.2
* Fix for not trimmed `once`, not working :)
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## 13.5220.1
* System 5.2.2 compatibility bump
* Fix condition evaluation where logical expressions (||, &&) fail due to missing keyword variables

## 13.5200.1
* System 5.2.0 compatibility bump

## 13.5110.8.8
* Better handle unary minus and coin flips.

## 13.5110.8.7
* If an `aura` flag doesn't include a `radius` keyword, it will apply to the whole scene no matter the distance from the source.
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.5110.8.6
* Another fix for adjacency

## 13.5110.8.5
* Quick fix for effect deletions

## 13.5110.8.4
* Properly break when `testAdjacency` returns true

## 13.5110.8.3
* Replaced `canvas.grid.testAdjacency` calls with a custom testAdjacency function which doesn't consider diagonal rules.

## 13.5110.8.2
* Quick fix for `criticalThreshold` fumbled checks...

## 13.5110.8.1
* Added `nonEffectActor` which will be returning the data of the actor that isn't the `effectActor`. Should make the decision about which type of actor to use each time (`rollingActor` or `opponentActor`) easier 🤞. The actor that has the ac5e flag applied via the active effect, versus the one that doesn't!

## 13.5110.8
* Added `fumbleThreshold` flags for attacks
  * `flags.automated-conditions-5e.attack.fumbleThreshold`
  * `flags.automated-conditions-5e.grants.attack.fumbleThreshold`
  * `flags.automated-conditions-5e.aura.attack.fumbleThreshold`
* Added `effectActor` which will always point to the actor which has the effect applied.
* For `usesCount=consumptionTarget, consumptionValue`, if provided, the `consumptionValue` can be fully evaluated.
  * Example, `usesCount=Item.amulet-of-soulcatching, -max(1, opponentActor.details.cr, opponentActor.details.level); opponentActor.statuses.dead;` will increase the uses of the Amulet by the maximum of the opponent's CR, level or 1, if the opponent has the Dead condition.
* Added actor flags as consumption targets for `usesCount`, getting them from the effect's actor.
  * `usesCount=flags.world.myName`

## 13.5110.7.5
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## 13.5110.7.4
* Migration errors quick fix

## 13.5110.7.2
* Fix for `flags.automated-conditions-5e.grants.attack.criticalThreshold` typo in DAE hints

## 13.5110.7.1
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.5110.7
* Compatibility bump Foundry v13.351
* Allow `isCritical` and `isFumble` for all d20 rolls
* Fix for `modeCounts` being undefined for some rolls
* Move `autoRangeChecks` into a multi select type setting. Split checks to discreet settings:
   * `Melee diagonal reach`: All adjacent squares count as within reach no matter the diagonal rules.
   * `Melee out of range`: Melee attacks further than weapon reach fail.
   * `Ranged long disadvantage`: Ranged attacks beyond short range but within long range have disadvantage.
   * `Ranged out of range`: Ranged attacks beyond long range fail.
   * `Ranged nearby foes`: Hostiles adjacent to attacker impose disadvantage on ranged attacks.
* Migration for new `autoRangeChecks`
* AC5e checks will now always override MidiQOL (if enabled) distance calculations
* Fix for tiny targets distance calculations
* Updated Czech translation by [Lethrendis](https://github.com/Lethrendis/) 🤗

## 13.5110.6.3
* Fix item effects' origins when added on actors from sidebar or compendiums.

## 13.5110.6.2
* Cleanup `actorData.creatureType` Array from empty or double elements.
* `itemLimited` should be now available for non transfer active effects too.
* Better error handling, parser returning `0` for failing to evaluate formulas, `ac5e.debugEvaluations` per client Boolean setting for quick checks. When a formula evaluation fails due to malformed user entries, the effect uuid and change key logged as a client error notification and in console.
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.5110.6.1
 * HP related: `hp`, `hptemp` and `hpmax` (will target temporary max hp)
    * Added `noconc` keyword for those hp updates to **not** trigger concentration checks (use by adding in the effect value `noconc` or `noconcentration` or `noconcentrationcheck` which are not case sensitive).
  * HD related: `hdLargest`, `hdSmallest`, `hd` (for hd when consuming, will move from largest to smallest and vice versa for recovering)
  * Abilities: `str`, `dex`, `con`, `int`, `wis`, `cha`. For example `usesCount=str, 2` will reduce the actor's Strength value by 2 forever! **Use with extra care!**
  * Other Attributes:
    * `exhaustion`, `inspiration`, `deathfailure`, `deathsuccess`
    * movement: `walk`, `fly` etc **(be wary of those)**
    * senses: `blindsight`, `darkvision`, `tremorsense`, `truesight` **(be wary of those)**
  * Currency: `gp`, `sp` etc 
  * Resources: `primary`, `secondary`, `tertiary`, `legact`, `legres`
  * Spell slots: `spell1`, `spell5`, etc or `pact`
  * Examples: 
    * `usesCount=deathfailure,3` will *add* 3 death save fails until removed!
    *  `usesCount=hdlargest, 2` will give back 2 used HD (largest available  for each of the two)
    * `usesCount=hpmax, -5` will increase the actor's max hp by 5, adding 5 temp max hp until removed.
    * `usesCount=hp, 5;noconc;` will decrease the current hp by 5 and won't trigger a conc save!
* Fix distance checks to respect unit choices. Based on `distanceUnit = canvas.grid.distance`
  * `nearbyFoes` checks against 1 distanceUnit.
  * `paralyzed`, `prone` and `unconscious` check against 1 distanceUnit.
  * `Spell Sniper 2024` adds a bonus of 12 distanceUnits if the cantrip range >= 2 * distanceUnits.
* Post a warning if you roll from a sidebar actor without a relevant token on the scene.
  
## 13.5110.5.2
* Fix for unlinked tokens `usesCount = origin` consuming from the sidebar actor
* Fix for `usesCount` not properly identifying if a flag was supposed to alter a roll or not
* If `usesCount` points to an Item that has a `quantity` and **no** `uses`, the quantity will be consumed
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.5110.5.1
* Fix for `noCritical` flags not working

## 13.5110.5
* Fix for `Array.from(undefined)` throw
* Introducing queries for updating `usesCount` of non-owned documents.
* Added logic for using `usesCount=Item.id.Activity.id` for items owned by the actor affected by the effect.
  * The `id` can be id, identifier or name, for example: `usesCount=Item.Longsword.Activity.attack, 2` to consume 2 uses of the activity with the identifier `attack` on an Item named Longsword.
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## 13.5110.4.3
* Correct extraDice multiplication for critical damage
* Makes sure that normal defaultButton isn't forced

## 13.5110.4.2
* Added directly in sandbox `activity.attack.type.value` and `activity.attack.type.classification`.
  * You can now use directly `melee`, `ranged` and `spell`, `unarmed`, `weapon` 
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.5110.4.1
* Fix for throw when Encounter actors are on scene

## 13.5110.4
* Fix for damage type tags getting consumed after evaluation of parenthetical terms.

## 13.5110.3
* Make sure that `itemData.school` can be called directly on conditions
* Fix for `actorData.details.level` throwing when Encounter actors are on the scene
* English translation fixes

## 13.5110.2.1
* Guard against advantage on attack rolls, giving advantage on damage rolls by default (MidiQOL relevant).
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.5110.2
* Rename `actorType.levelCr` to `actorType.level` foe ease of use.

## 13.5110.1
* Compatibility bump for d&d5e v5.1.10 (killing my versioning schema 🤣)
* `noAdvantage`, `noCritical`, `noDisadvantage` flags, used to suppress the relevant modes.

## 13.519.6
* Compatibility updates for keypress overrides.
* Compatibility updates for System flags countmodes, suppressing and overriding roll modes.
* Fixes for MidiQOL integration.
* Fix for concentration handling.
* Added `actorType.items` helper, returning an Array of the relevant actor's items rollData.
* Added `actorType.levelCr` helper, returning the level or CR of the relevant actor.
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗
  
## 13.519.5.1
* Make operator removal safer
* Proper formula mode evaluations for aura's radius
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.519.5
* Adds dis/advantage flags for damage rolls. From now on it is suggested that you are using:
  * `flags.automated-confitions-5e.damage.advantage` etc
* Properly parse formulas starting with `-`
* Remove quotes from bonuses in en.json lang file
* Make `itemData.type.value` available as shorthand
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## 13.519.4.1
* Backwards compatibility, fixing issues with remnant quoted parts in formulas.

## 13.519.4
* Reworked `_ac5eSafeEval`
* Introduced new parser
 * full ternary operators support while evaluating formulas
 * any bonuses are folded in a final value before added to the Rolls
* `sandbox` lazy load
* Moved repetitive code to Functions in `ac5e-setpieces`
* Reworked `bonus` and `set`
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## 13.519.3.1
* Hotfix
* Added `ac5e.info.version`

## 13.519.3
* Added a console only setting, to remove all non 5e statuses from the Token HUD.
  * `game.settings.set('automated-conditions-5e', 'displayOnly5eStatuses', true);`
* Reworked sandbox evaluations to make conditionals syntax more user friendly.
* Added damage roll modifiers, with the keyword `modifier` and any of the [Foundry dice modifiers](<https://foundryvtt.com/article/dice-modifiers/>)
  * Added logic for damage advantage and disadvantage, using `modifier='adv'` and `modifier='dis'`
* Added flags a new flag for Damage Rolls. `extraDice` mode, increasing or decreasing the number of dice per denomination.
  * `flags.automated-conditions-5e.damage.extraDice` with a `bonus=5` will add 5 to each dice part of the formula.
    * eg. 1d4 + 4 + 2d8 => 5d4 + 4 + 7d8 (respects doubling up for critical; not compatible with other critical rules yet)
  * Same for `aura` and `grants` keys
* Added `set` keyword, similar to `bonus`, but that will set a value to the provided.
  * eg. for the `modifyAC` if one uses `set=15`, it will set the AC to 15.
  * to be used in flags for `criticalThrehsold`, `modifyAC`, `modifyDC`
* Added `actorType.uuid` as the actor's uuid
* Changed the equippedItems logic:
  * `actorType.equippedItems.names` and `actorType.equippedItems.identifiers` are Arrays of the relevant data.
* Fix for aura mode of `modifyAC` and `allies/enemies`
* Fix for removal of `!` from conditions in some cases.
* Fix for missing `itemProperties` from sandbox data.

## 13.519.2
* Added `hasArmor`: Boolean, `hasArmorType`: Boolean, `hasShield`: Boolean
  * `hasArmorLight`, `hasArmorMedium`, `hasArmorHeavy`
* Removed `maximum: 13` from the manifest for users to test on v14 Prototype 1.

## 13.519.1
* Fix for initiative bonuses added twice
* Verified for d&d5e v5.1.9

## 13.518.2
* Migrated to non-V2 system hooks

## 13.518.1.1
* Hotfix for error when calculating `spent` uses and `isNaN(consumeMoreUses)`

## 13.518.1
* Added `getItemOrActivity(itemID, activityID)` helper for evaluation conditions or macros
  * Will return the Item (if no activityID is provided) or the Activity of the rolling actor
  * `itemID` can be:
    * `name`
    * `identifier`
    * `id` (not that useful)
    * `uuid`  (not that useful, use instead fromUuidSync(uuid))
  * `activityID` can be:
    * `activity.name`
    * `activity.type`
    * `activity.identifier` (available only if MidiQOL is active)
    * `activity.id` (not that useful)
    * `activity.uuid` (not that useful, use instead `fromUuidSync(activityID)` in this case)
  * Can also be used in macros if you provide an Actor, which can be
    * `Actor` document
    * `name` (useful for linked actors)
    * `id` (useful for linked actors)
    * `uuid` (more useful for unlinked actors)
    * example `const shield = ac5e.getItemOrActivity("Shield", null, "Bob the Fighter");` returning the Item named Shield on the linked actor named Bob the Fighter.
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗
* Verified for D&D 5e system v5.1.8
   
## 13.514.1.1
* Added `equippedItemIdentifiers` for condition evaluations
* Properly populate item.getRollData().item.type

## 13.514.1
* Verified for d&d5e v5.1.4
* Expanded `<actorType>.movementTurn`, `<actorType>.movementLastSegment`, `<actorType>.isTurn` and `<actorType>.combatTurn`
  * Replace `<actorType>` with one of `auraActor`, `effectOriginActor`, `opponentActor` or `rollingActor`

## 13.513.1
* Verified for D&D5e v5.1.3
* Properly add getters for activities `hasAttack`, `hasCheck`, `hasDamage`, `hasHealing`, `hasSave` returning true if relevant

## 13.512.3
* Added `rollingActor.combatTurn` and `opponentActor.combatTurn` for condition evaluations
  * Example usage: <https://github.com/thatlonelybugbear/automated-conditions-5e/wiki/Flags-examples-(automating-5e-items)#bugbears-surprise-attack>
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## 13.512.2.1
* Foundry v13.348 compatibility

## 13.512.2
* Reworked `autoArmor` and `autoEncumbrance`
  * Removed `autoArmor` settings, as the system supports Stealth Disadvantage and Disadvantage on rolls when not proficient in donned armor.
  * Attack rolls disadvantage still handled by AC5e as the system doesn't automate those yet.
* Added a workaround for `riderStatuses` not being properly populated when using a Destroy on empty item.
  * Some more work is needed for adjacent use cases.
* Compatibility with Combat Carousel when rolling for initiative (and generally for `dnd5e.preConfigureInitiative` hooks)

## 13.512.1.2
* Reinstate `ac5e` dialog class

## 13.512.1.1
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.512.1
* D&D5e v5.1.2 system compatibility bump
  * This release in **NOT** compatible with v5.0.4 or earlier (install 13.504.10.5: <https://github.com/thatlonelybugbear/automated-conditions-5e/releases/download/v13.504.10.5/module.json>)
* Adds the following as available data for conditions evaluation:
  * `movementLastSegment`: when in combat, returns the distance of the attacking token's last movement segment (distance between the two last waypoints)
  * `movementTurn`: when in combat returns the distance the attacking token has travelled during that turn

## 13.504.10.5
* Adds ammoProperties to itemProperties, so if an arrow for example is `magical` but the weapon shooting it is not, the attack will be treated as magical

## 13.504.10.4
* Quick fix for activities not functioning properly

## 13.504.10.3
* Reinstates using the actual token's name to Checks and Saves roll configuration dialogs.
* Adds the following as available data for conditions evaluation:
  * `options.targets`, Array of the activity's targets.
  * `opponentAC`, the opponent actor's AC value.
  * `singleTarget`, will be `true` is there is only one target selected.
  * `attackRollOverAC`, the attack roll total minus the opponent's AC or undefined.
* Fix for infinite loop possibility when MidiQOL is active.
* Fix for preActivityUse hook failing when looking for a message.
* Fix for some deprecations.
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## 13.504.10.2
* Fix for Modified AC and Modified DC translation strings missing

## 13.504.10.1
* Reinstate riderStatuses in the evaluation data
  * Example of usage: `flags.automated-conditions-5e.save.advantage | Override | riderStatuses.poisoned` to automate Dwarven Resilience against getting the poisoned condition.

## 13.504.10
* This is the ***last release before 5.1.0*** becomes the minimum required version of the module.
  * Bugfixes will continue, but no new features will be added for versions < 5.1.0.
* Added flags for modifying AC (you can use full evaluation conditions as normal).
  * Usage with `bonus='+2'` to add 2, `bonus='1d20'` to set it to the result. Negative values to reduce.
  * `flags.automated-conditions-5e.modifyAC`:  will modify the AC of the actor it is applied on.
  * `flags.automated-conditions-5e.grants.modifyAC`:  will modify the AC of the attack's target.
  * `flags.automated-conditions-5e.aura.modifyAC`: (use `bonus` and `radius` etc as usual) will modify the AC of the actors in the aura.
* Added flags for modifying DC, mainly to be used with `actionType` of `save`, `death`, `conc` (if `skill/tool/check` have a set DC then it will work there too)
  *  Usage with `bonus='+2'` to add 2, `bonus='1d20'` to set it to the result. Negative values to reduce.
  * `flags.automated-conditions-5e.<ACTIONTYPE>.modifyDC`: will modify the DC of the action the actor takes.
  * `flags.automated-conditions-5e.grants.<ACTIONTYPE>.modifyDC`: will modify the DC of the action another actor takes against the one with the effect.
  * `flags.automated-conditions-5e.aura.<ACTIONTYPE>.modifyDC`: (use `radius` as usual) will modify the DC of actions taken by actors in the aura.
* Some small fixes and code refactor.

## 13.504.9
* Fix for incorrect doubling up of criticals.
  * For v13 and MidiQOL users, you'd better update your Midi to v13.0.16

## 13.504.8.2
* Small fixes for distance calculations

## 13.504.8
* Compatibility bump Foundry v13.347
* Distance Calculation Rework for Hex, Gridless, and Square-gridded scenes:
  * Gridless distances greater than `canvas.grid.distance` but less than `canvas.grid.distance * 1.25` are considered equal to `canvas.grid.distance`.
    * Example: If grid distance is 5 ft, and a token is 5–6.25 ft away, it's treated as 5 ft — helpful for targeting when not enforcing strict distance.
  * Updated _getDistance method signature.
  * Reworked logic for `wallsBlocking` auras (new keyword)
* Keyword Matching is Now Case-Insensitive
  * Reworked `handleUses()` to support this change
  * You can now use `usesCount` or `usescount` or `UsEsCoUnT` etc
* Fixes for `includeSelf` and `allies`/`enemies` issues
* Added logic to consume uses from `Owned Items`. Use with:
 * `usesCount: origin, 2` consumes 2 uses from the origin item/activity.
 * `usesCount = itemOrActivityUUID, uses` consumes 1 or specified number of uses.
   * Comma-separated number = required number of available uses and how many to consume.
* Added `effectOriginActor` in available evaluation data as needed.
* Now supports dashes in keys (useful for scale value, eg `@scale.paladin['aura-range'].value`)
* Added global `ac5e._target` which returns `game.user.targets.first()`.
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗
* Updated Czech translation by [Lethrendis](https://github.com/Lethrendis/) 🤗

## 13.504.7
* Added setting: Automate D&D5e statuses. If disabled (default enabled), AC5e will allow the system or other modules to automate statuses like Blinded, Frightened etc
* Made sure `game.i18n.translations.DND5E` is available
* Reworked `getMessageData`
* Properly added `hasAdvantage`, `hasDisadvantage`, `hasAttack`, `hasDamage`, `isCritical`, `isFumble`, `attackRollTotal`, `attackRollD20` to evaluation conditions
* Fixed `spellcastingAbility` typo
* `scaling` will be either `0` or the system available flag
* Added `spellLevel` to match the system's variable, which is the same like `castingLevel` (`baseSpellLevel` is also available as the spell's base level)
  
## 13.504.6
* Added `isCantrip` boolean for condition evaluation.
* Reworked `castingLevel` to properly reflect the used spell slot/
* Improved `bonus` mode behavior:
  * If the evaluated bonus returns `0`, `false`, or `null`, the Active Effect will be ignored in tooltips (since it wouldn’t affect the roll).
    *  eg when `bonus = opponentActor.attributes.hp.pct > 50 ? 0 : '1d4[acid]'`
  * Acceptable forms:
    * Pure formula: `bonus=1d4[acid] + 5 - 1d2[fire]`. Use when only dice and numeric values are needed.
    * Conditional (evaluated): `bonus=opponentActor.attributes.hp.pct < 50 ? '1d4[acid]' : 22;`. Use string-wrapped dice formulas (`'1d4[acid]'`) or plain numbers when logic is required.
* Want to support this module? Check out the Automated Condition UI [ko-fi goal](<https://ko-fi.com/thatlonelybugbear/goal?g=39>)

## 13.504.5.2
* Fix for assignment to constant variable.
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.504.5.1
* Change to `user` settings instead of per `client` for non-world settings (available for Foundry v13 only)
  * This means that when a specific user is connected, their editable settings will be used, no matter the client they are connecting from.
* Updated Polish translation by [Lioheart](<https://github.com/Lioheart>) 🤗

## 13.504.5
* Added new flags for `max`, `min` modifiers on d20 rolls.
  * usage `flags.automated-conditions-5e.<ACTIONTYPE>.modifier | Override | modifier=rollingActor.attributes.hp.pct < 50 ? 'max12' : 'min8'` which will append to a relevant d20 roll, a `max12` if the rolling actor is below half health, or `min8` otherwise.
  * available also:
    * `flags.automated-conditions-5e.aura.<ACTIONTYPE>.modifier`
    * `flags.automated-conditions-5e.grants.<ACTIONTYPE>.modifier`
  * for <ACTIONTYPE> use one of `attack/check/concentration/death/initiative/save/skill/tool`
* Updated disposition checks. Now the following can be used:
  * `-2`, `-1`, `0`, `1` for exact match based on Foundry's dispositions for SECRET, HOSTILE, NEUTRAL, FRIEDNLY
  * `secret`, `hostile`, `neutral`, `friendly` for exact match of tokens' disposition
  * `ally or same` for relative disposition checks, when both of the tokens need to be of the same disposition
  * `enemy or opposite` for relative disposition checks, which will test between friendly and hostile dispositions only
  * `different` for relative disposition checks, returning all tokens with different dispositions
  * `all` just returns all tokens in range, no matter the disposition
* Fix for healing activities triggering an error when gathering damage types
* Properly evaluate critical threshold additions
* More colorpicker fixes
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗
* Updated Polish translation by [Lioheart](<https://github.com/Lioheart>) 🤗

## 13.504.4.1
* Fix for buttons color pickers misbehaving
* Changed default `white` to `#f8f8ff` to remove a warning for not conforming to the required format, until the user click outside of the string field
* added `default` as a keyword to return the default module colors, same like erasing any entry.
  * `default` or delete the entry to get the default module colors
  * `false`, `null`, `0`, `none` to disable the specific attributes color changes
  * `game.user.color` or `user` to match the user's Foundry color


## 13.504.4
* Fix for error when no damage entry exists on a damage roll...
* Updated Czech translation by [Lethrendis](https://github.com/Lethrendis/) 🤗

## 13.504.3
* Fix for `threshold` evaluations
* Fix type `options.damagetypes` => `options.damageTypes`
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.504.2.1
* Added the `...criticalThreshold` flags to be picked up by DAE autocompletion
* Fix for change in `DND5E.ITEM.Property.Heavy` instead of `...Item...`

## 13.504.2
* Added `criticalThreshold` mode for AC5e attack flags, triggered by using keyword `threshold=18` or `threshold=-2` in the effect value, setting to a new if lower static threshold or adding the provided bonus (negative to lower), respectively.
* Added `itemLimited` keyword for ac5e flags, limiting the conditional flag application when the rolling item is the same that applied the effect to the actor.
  * For example, a passive transfer effect from a weapon, adding a damage bonus when that weapon is being used only.
* Changes in Roll Configuration dialogs should trigger proper AC5e re-evaluation of flags
  * Reworked `doDialogSkillOrTollRender` (changes tracked: ability used)
  * Added `doDialogDamageRender` (changes tracked: selected damage type from multiple types)
  * Added `doDialogAttackRender` (changes tracked: Ammunition, Attack Mode, Mastery dropdowns)
* Cleanup of sandbox data to make those work better. Additions:
  * `activity.ability` in the available evaluation data.
  * `attackRollD20` and `attackRollTotal` for grabbing those in damage evaluations after having rolled a d20 to attack.
  * reworked damage types for evaluations based on selected damages from multiple available ones
    * use as `damageTypes.fire || damageTypes.cold` for mutliple ones being true, or `['cold', 'fire'].some(d=>damageTypes[d])`
    * the old way of damage types being readily available is still supported `fire; cold` but using `damageTypes` is recommended and can be more robust
  * `consumptionItemName` and `consumptionItemIdentifier` to be used when an activity consumes uses of another, eg
    * For Dragonhide Belt items consuming Focus uses, `consumptionItemName.Focus` will evaluate to true
* Limit Grappled attacks disadvantage to only modern rules
* Added interim support for min/max system flags for saves and checks until system updates.
* Added proper `Heavy` rules for modern and legacy rules:
  * To disable them use in console `game.settings.set('automated-conditions-5e', 'automateHeavy', false)`
  * For the legacy rules, the `token.document.width * token.document.height * token.document.scale` will need to be lower than `1` in order for the attacking Token to be considered small.
* Allow `bonus` and `radius` to be fully evaluated too, so you could use `radius=auraActor.details.level > 17 ? 30 : 10` for example.
* Verified for Foundry v13.346

## 13.504.1
* System compatibility bump for 5.0.4
* Fix for a forgotten Token instance deprecation
* Added for bonus ac5e flags, support for `effectStacks`, when using DAE or Status Icon Counters stacking of effects.
 * Example `bonus=(effectStacks + 2)d4`

## 13.503.13.3
* Fix for not properly pushing parts for bonuses

## 13.503.13.2
* Added in sandbox:
  * `item.isEnchantment`: Boolean, true if it is an enchantment, or enchanted item.
  * `item.transferredEffects`: Array of transferred effects

## 13.503.13.1
* Guard against actor being undefined at `getActorToolRollModes`

## 13.503.13
* Fix for double initiative bonus and not proper highlighting
* You can now use any of the following in addition to `tokenId` and `opponentId`:
  * `tokenUuid`, `actorId`, `actorUuid` for rolling actor/token identification
  * `opponentUuid`, `opponentActorId`, `opponentActorUuid`

## 13.503.12
* Adds `effectOriginActor` data for bonus flags
  * Usage example: `bonus=effectOriginActor.abilities.wis.mod;`

## 13.503.11.1
* Italian translation update by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## 13.503.11
* v13.345 compatibility

## 13.503.10.4
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗
* Updated Czech translation by [Lethrendis](https://github.com/Lethrendis/) 🤗

## 13.503.10.3
* Added 2014 Alert automation (checking for Alert - or its translated string for supported languages - item on the actor for Legacy Rules)
* Fix for Transform activities triggering an error

## 13.503.10.2
* Updated French translation by [CaosFR](<https://github.com/CaosFR>) 🤗

## 13.503.10.1
* Compatibility with GPS attacks of opportunity

## 13.503.10
* `paralyzed` and `unconscious` forces damage to be critical only when `activity.hasDamage` returns `true`

## 13.503.9.3
* Updated Czech translation by [Lethrendis](https://github.com/Lethrendis/) 🤗
* Updated Polish translation by [Lioheart](<https://github.com/Lioheart>) 🤗

## 13.503.9.2
* Added `flags.automated-conditions-5e.spellSniper` in the DAE autocomplete options
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## 13.503.9.1
* Added `Spell Sniper` feat (2014 vs 2024) rules
  * `2014`: Spells that have an attack roll, double their range
  * `2024`: Casting a ranged spells within 5 ft of an enemy doesn't impose disadvantage on any attack roll and if the spell has at least 10ft range, gets another 60ft
    * Either an item on the actor named `Spell Sniper` or a relevant flag for `flags.automated-conditions-5e.spellSniper | Override | 1` will cancel the disadvantage.
* Foundry v13.344 compatibility

## 13.503.8.3
* Guard against tokens without an actor

## 13.503.8.2
* Respect Targeting settings for attacks
* Fix for incorrent localization string when targeting is set to cancel and warn

## 13.503.8.1
* Limit uses of AC5e flags on owned actors by a specific Number
  * `once`: adding this keyword in the effect's value, will limit the use of the flag to the next relevant roll only
    * especially useful for any features that trigger a specific behaviour on the next roll by the actor with the effect
    * For example, the actor has advantage in the next Attack, Check, or Save roll (3 entries in one active effect):
      * `flags.automated-conditions-5e.attack.advantage | Override | once`,
      * `flags.automated-conditions-5e.check.advantage | Override | once`,
      * `flags.automated-conditions-5e.save.advantage | Override | once`
  * `usesCount=Number`: will limit the use of the flag to the next \<Number\> of times
  * **BEWARE**:
    * The count will be reduced if the rest of the conditions evaluate to true, no matter what the user selects in any relevant Roll dialog if not fast-forwarding.
    * If the effect is a `transfer: true` one, it will be disabled and if using `usesCount` they will be reset to the initial value
    * Otherwise the effect will be deleted from the Actor when the uses run out!
  * There are future plans for:
    * allowing any Item/Activity uses to be consumed, even from not owned actors.
    * User opt-in flags
* Reworked how the module gets the actors rollData when creating its sandbox for evaluations, so that all the relevant data are included while trying to limit the system's compatibility warnings for `spell.dc` and `spell.mod` is pre-v5.0.0 setups
* Removed some `dialog.configure` handling, until the system fully implements [#5454](<https://github.com/foundryvtt/dnd5e/pull/5454>)

## 13.503.7.1
* Italian translation update by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## 13.503.7
* Added global Boolean parameter for `ac5e.logEvaluationData` which if set to true on the client, the available evaluation data will be logged in console after creation. A quick way to familiarize yourselves with what is available to use!
* Tweaked some hooks
* Reworked evaluation data, like `castingLevel`, `baseSpellLevel`, `scaling` and now they are avalable
* Refactor: Limit code duplication by using unified regex-based replacement function.
* Added Czech translation by [Lethrendis](https://github.com/Lethrendis/) 🤗
* Updated Polish translation by [Lioheart](<https://github.com/Lioheart>) 🤗

## 13.503.6
* Properly offer backwards compatibility for `targetActor`
  * Fix for a `currentCombatant` undefined relevant error
* Fix for autoRanged checks always returning ranged attacks in short range
* Small tweaks for `canSee()` which probably now is at a good state 🤞
* Fix for missing `notifyPreUse` function

## 13.503.4.2
* More `canSee()` fixes
* Fix for missing `targetActor` from evaluations
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗
  
## 13.503.4
* Exposes a checkNearby function to help with Pack Tactics:
  * `flags.automated-conditions-5e.attack.advantage | Override | checkNearby(opponentId, 'different', 5, {count: 2})`
    * `oppenentId` is the targeted token's id
    * `'different'` designates different disposition compared to the target's; can also use `'same'`, `'opposite'` or `'all'`
    * the 3rd passed parameter is the distance to check, `5 units` in this case
    * the 4th parameter is an Object which can include:
       * `count` for the number of tokens to check against
       * `includeToken` (false by default), which adds the target token if needed by passing `includeToken: true`
       * `includeIncapacitated` (false by default), which adds any incapacitated tokens if true
* More visibility testing fixes

## 13.503.3
* Compatibility with combat carousel which calls `actor.rollinitiative()`
* Fix attacks failing due to _canSee() 

## v13.503.2
* Some settings hints clarifications
* Proper 5e versioning bump
* Italian translation update by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## v13.502.2.1
* Fix for using `initiative`, `concentration`, `death` as flag \<ACTIONTYPES\>
* `rollingActor.canMove` (same as `canMove`), `opponentActor.canMove` will be true if the actor has at least one non zero movement type
* Updates in Brazilian Portugese, Italian and Polish translation files
* D&D 5.0.3 compatibility bump

## v13.502.2
* Clarification on Actor References in Evaluations
  * Use `opponentActor` to access the opponent’s rollData during evaluations, instead of `targetActor`.
    * `targetActor` remains available for backwards compatibility, but its usage is now discouraged.
  * This change hopefully improves clarity, especially in cases like saving throws, where the actor rolling the save *can* also be the target of an item roll. For example:
    * during an attack, you have a clear distinction between the attacking actor and the targeted actor.
    * But during saves, the actor rolling the save can also be an actual target, and the other party (e.g., the spellcaster or trap) is better referred to as the opponent.
* Fix for wrong localization string in some settings
* Refactor setpieces code
* Rework `_canSee()` 
* Raging/silenced/incapacitated etc checks fixes
  * `raging`, `silenced`, `no armor proficiency` checks for spell items use
  * `incapacitated` will be checked for activities that have any relevant action as activation cost
* Fix for `subjectTokenId` undefined when no message is created (like initiative rolls)
* Update pt-BR.json by @Kharmans
* Pre use activity issues cleanup
  * the targeting options for attack changes slightly. Now the module will:
    * Use source actor data only if zero or multiple targets are selected when attacking
    * Cancel roll silently
    * Cancel roll with a warning notification shown to the user's client
      * In all cases a console warning will be shown in the user's client
* Adds more data in the sandbox for easier evaluations, like `isSpell` etc to be added in the [WIKI](<https://github.com/thatlonelybugbear/automated-conditions-5e/wiki>) soon!


## v13.502.1
* Compatibility bump for v5.0.2
* Small fix for not posting more than one warnings, for incapacitated/raging/silenced checks
* Make sure that group or vehicle actors do not break processing
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗
  
## v13.501.1.1
* Updated Polish translation by [Lioheart](<https://github.com/Lioheart>) 🤗
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗
  
## v13.501.1
* Deal with Foundry v13 and dnd5e v5.0.0 deprecations
* Update compatibility and verify module for Foundry v13.342 and 5e v5.0.1
* Exhaustion automation setting will be only available for 5e legacy rules
* New GM setting for visibility of the tooltips in chat messages
  * `All`: players will see tooltips in all chat messages, no matter the actor rolling
  * `None`: players won't see any tooltips in chat messages
  * `Owned`: a player will be able to see tooltips in chat messages for rolls from owned actors
  * `Players`: players will be able to see tooltips in chat messages for rolls from all player owned actors
* Settings tweaks, so Show tooltip module name and Show chat messages tooltips options are available, only when relevant.

## v13.500.4.1
* Hotfix for `ui` in `equippedItems` triggering an error collection...
* Hotfix for the changelog showing an incorrect example of `equippedItems` usage
  * corrected example: `rollingActor.equippedItems.filter(i => i.includes('Platinum')).length > 2` will be true when the rolling actor has more than 2 equipped items with their names including `Platinum`

## v13.500.4
* Guards against `aura` or `grants` flags being evaluated against non relevant actors
* Guards against numerous deprecation warnings being generated for `attributes.spelldc` and `attributes.spellmod` which AC5e doesn't use, but inadvertently triggers when cloning actor.getRollData() objects
* Guards against cases of `undefined: true` being present in the sandbox data
* Adds for flag evaluations:
  * `equippedItems` which is an Array of item names, currently equipped on the actor
    * ie `rollingActor.equippedItems.filter(i => i.includes('Platinum')).length > 2` which will be true when the rolling actor has more than 2 equipped items with their names including `Platinum`
  * `distance` for distance evaluations
    * `distance > 15 && distance <= 20` would be true if the distance between the rolling token and opponent token is between 15 (excluded) and 20 (included), but only when distance is available 
  * `allies`/`enemies` as evaluation conditions for non auras too
     * `allies` will be true for rolls that the rolling token has the **same** disposition compared to its opponent (if an opponent is available for that roll)
     * `enemies` will be true for rolls that the rolling token has a **different** disposition compared to its opponent (if an opponent is available for that roll)
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗
* Updated Polish translation by [Lioheart](<https://github.com/Lioheart>) 🤗

## v13.500.3.3
* Damage hook hotfix

## v13.500.3.2
* Some more bugfixes for attack hooks
* Fix for `effectOriginTokenId` evaluations
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## v13.500.3.1
* Normalize roll data evaluations for ac5e flags
 * In bonus mode flags, use:
  * `@` or `rollingActor` to access roll data from the actor rolling, ie `@abilities.dex.mod` or `rollingActor.dex.mod`
  * `##` or `targetActor` to access roll data from a targeted actor (single targeted actor), ie `##attributes.ac.bonus` or `targetActor.attributes.ac.bonus`
  * for auras only, `auraActor` to access roll data from the aura's source actor, ie `auraActor.abilities.cha.mod`
   * `flags.automated-conditions-5e.aura.save.bonus | Override | radius=10;bonus=auraActor.abilities.cha.mod;includeSelf;singleAura;allies` is essentially the level 6 Paladin's Aura of Protection.
* Cleanup parameters pass to private functions
* Concentration flag fixes
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## v13.500.2
* Updated Polish translation by [Lioheart](<https://github.com/Lioheart>) 🤗
* Cleanup in available sandbox data for AC5e flags conditional evaluations
  * `canSee`: evaluates to true if the rolling actor can see the targeted actor
  * `isSeen`: evaluates to true if the targeted actor can see the rolling actor
  * `rollingActor` holds merged data from the `rollingActor.getRollData()` plus the rolling token
  * `targetActor` holds merged data from the `targetActor.getRollData()` plus the targeted token
* The evaluation data is a work in progress and to help users become acquainted, AC5e will be creating a log with its sandbox data everytime a condition evaluation is happening.
  * It will be disabled in the future when the WIKI is ready and the basic available data are set to stone! 

## v13.500.1
* Make sure that when removing blacklisted keywords, an empty string left for evaluation, always evaluates to `true`
  * as a side effect, leaving the effect value of any AC5e flags empty, it will also evaluate to `true`
* Only try to register DAE fields when DAE is actually active
* Foundry v13 and dnd5e 5.0.0 compatibility update
* Updated Italian translation by [GregoryWarn](<https://github.com/GregoryWarn>) 🤗

## v13.439.2
* Proper descriptions fix in DAE fields for auras `radius=`
* Fix for checks being based some times on targeted token's data
* AEs can be named the same and should all be counted
* Updated pt_BR translation by [Kharmans](<https://github.com/Kharmans>) 🤗

## v13.439.1.1
* Slightly more up to date DAE field descriptions for AC5e flags
* Properly evaluate `allies` and `enemies` keywords in flags. Omit for affecting all actors.

## v13.439.1
* That is a huge update, so there might be issues, so please let me know by creating issues in the github repository: [issues](<https://github.com/thatlonelybugbear/automated-conditions-5e/issues>)
* 🐾 If you like what I do, consider supporting this lonely bugbear! Every shiny gold coin helps keep the ideas flowing and the goblins at bay.
  * 👉 [Support bugbear on Ko-Fi](<https://ko-fi.com/thatlonelybugbear>)
* 🏰 You can also join the Bugbear’s Den to hang out, get help, or check what I might be working on!
  * 👉 [Discord Invite Link](<https://discord.gg/KYb74fcsBt>)

* Initial implementation for the system's actor abilities/checks roll modes for dis/advantage (not fully supported yet by the system).
  * AC5e will use notice and use any of these flags when present on the rolling actor. 
* AC5E flags:
  * Added flags with descriptions in DAE for autocompletion.
  * `flags.automated-conditions-5e.ACTIONTYPE.MODE`
    * ACTIONTYPE: can be one of `all/attack/check/concentration/damage/death/initiative/save/skill/tool`
    * MODE: can be one of `advantage/disadvantage/bonus/critical/fumble/success/fail`
    * These will be evaluated when the actor that has that active effect on, rolls any of the relevant ACTIONTYPE.
  * `flags.automated-conditions-5e.grants.ACTIONTYPE.MODE`
    * Same ACTIONTYPEs and MODEs as above
    * These will be evaluated when you target the actor that has that active effect on, _granting_ any rolls of the relevant ACTIONTYPE the corresponding MODE.
  * `flags.automated-conditions-5e.aura.ACTIONTYPE.MODE`
    * Same ACTIONTYPEs and MODEs as above
    * These will be evaluated when you are rolling one of the relevant ACTIONTYPEs and the token of an actor that has that active effect on, is in range!
    * The auras need in the change value of the active effect an entry of `radius=15;` for example, to designate the aura's range.
    * You can also include:
      * `singleAura` (mainly for bonus MODE): add that in to make sure that only 1 auras of the same name (the Active Effect's name) can affect the actor rolling, based on higher bonus or closer to the rolling token if of the same bonus.
      * `includeSelf`: add that in if the aura should affect also the actor that has that active effect on.
  * When using `bonus` mode, you should include a bonus entry in the change value, like `bonus=1d4 + abilities.dex.mod` or `bonus=-5[fire]` for typed damage MODE.
  * All the flags can should allow for sync conditional evaluations, based on data from:
    * `rollingActor.getRollData()`
      * If the rolling actor has for example 50 hp, `attributes.hp.value > 40` would evaluate to true
    * `opponentActor.getRollData()` when relevant and under `target`
      * If the target actor has for example 50 hp, `target.attributes.hp.value > 40` would evaluate to true
    * `activity.getRollData()` when relevant
    * `item.getRollData()` when relevant
    * `tokenSize` as the rolling `token.document.width * token.document.height`
    * `tokenElevation`
    * `race`: an Array of the rolling actor's `[value, subtype, swarm, custom, race]` data
    * `targetTokenSize` as the rolling `targetToken.document.width * targetToken.document.height`
    * `targetTokenElevation`
    * `targetRace` an Array of the target's actor's `[value, subtype, swarm, custom, race]` data
    * `activityDamageTypes` which should be returning all the damage types of the relevant activity
    * `activityAttackMode`
    * `activityEffectsStatusRiders` which is a Set of all the statuses that the activity might apply on the target if any
      * So if an attack would apply `poisoned` on a hit, an entry of `activityEffectsStatusRiders.poisoned` would evaluate to true
    * If a combat is active:
      * `isCombatTurn` is true when it's the rolling actor's turn
      * `target.isCombatTurn` same for the target
      * `combat.round/combat.turn/combat.current/combat.turns` will evaluate against the relevant paths in `game.combat`
    * `worldTime` the game.time.worldTime
    * `ability` the ability used on the roll
    * `skill` the skill used on the roll if relevant
    * `tool` the tool used on the roll if relevant
    * `spellLevel` the spell level of casting a spell or the base level of innate ones
  * You can use `ac5e.conditionData({subject: rollingActor, subjectToken: rollingToken, opponent: targetActpr, opponentToken: targetToken, item: rolledItem, activity: rolledActivity, options = {ability, skill, tool,})` to create an image of what data the sandbox for the conditional evaluations would hold.
* Added a generic enable checkbox in the setting for the colorful AC5e buttons
* Numerous smaller fixes.
* Addition of Polish translation and updates in Italian.
      
## v13.436.1.3
* Localization issues fix by [thatlonelybugbear](<https://github.com/thatlonelybugbear>) in [237](<https://github.com/thatlonelybugbear/automated-conditions-5e/pull/237>)
* Adding attackMode if available in ac5eConfig by [thatlonelybugbear](<https://github.com/thatlonelybugbear>) in [238](<https://github.com/thatlonelybugbear/automated-conditions-5e/pull/238>)
* Fix for rolling from damage enrichers; config.subject is undefined by [thatlonelybugbear](<https://github.com/thatlonelybugbear>) in [240](<https://github.com/thatlonelybugbear/automated-conditions-5e/pull/240>)

## v13.436.1.2
- Quick compatibility update for MidiQOL, making sure the `config.midiOptions` are taken into account!

## v13.436.1.1
- Update it.json by [GregoryWarn](<https://github.com/GregoryWarn>) in [233](<https://github.com/thatlonelybugbear/automated-conditions-5e/pull/233>)
- Compatibility update for [Carolingian UI](<https://github.com/crlngn/crlngn-ui>) in [234](<https://github.com/thatlonelybugbear/automated-conditions-5e/pull/234>)

## v13.436.1
- Foundry v13 compatibility bump (should be working).

## v12.436.5
- Another fix for MidiQOL compatibility, when both modules check nearby foes and range. If MidiQOL checks for those, AC5e will defer to it.
- Fix for critical rolls always being highlighted.
- Better indication of keypresses and module flags being present during a roll.
- First pass for evaluation of statuses/riders on activities active effects.
  - For example, adding in a feature for Dwarven Resilience a `flags.automated-conditions-5e.save.target.advantage | Add | poisoned`, means that the actor will be rolling with advantage on any saves against an activity that would apply the Poisoned status.
- Update pt-BR.json by @Kharmans

## v12.436.4
- Defer to MidiQOL.computeDistance() when the module is active.

## v12.436.3
- Fix for armor stealth disadvantage.
  
## v12.436.2
- Expect ac5eConfig being an empty object.

## v12.436.1
- Compatibility bump for dnd5e 4.3.6
- Added AC5E button colorpicker
- Added initial pass for automating Enviromental Hazards from the 2024 dnd5e ruleset (setting added, default false)
  - Burning
  - Suffocating

## v12.422.11
- Closes #194 
- Adds parameters in some helpers:
  - `_getActionType(activity, returnClassification = false)`
  - `_getDistance(tokenA, tokenB, includeUnits = false)`
- For saves/checks show chat tooltip if targets.size <= 1 with [commit 16622b9](https://github.com/thatlonelybugbear/automated-conditions-5e/commit/16622b9c26c85917523b20fd2a33ad2bad7ac5b0)
- Removes one type of expression evaluation as incomplete [commit 5cec32a](https://github.com/thatlonelybugbear/automated-conditions-5e/commit/5cec32a1088f2f8dbba80f06f9448965e97368f7)

## v12.422.10
- Much more usable conditions for flag evaluations
- Fix for some expanded conditions.
- Exposed some helpful functions, under `globalThis.ac5e`
- Reinstate from source only advMode calculations.

## v12.422.9
- Fix for skill flags not working

## v12.422.8
- Better support for MidiQOL
- Some small fixes

## v12.422.7
- Added token name on save and check configure dialogs
- Expanded raceOrType functionality to get the correct returns
- Fixed _canSee() functionality
- Expanded ac5eFlags functionality and logic to gather flags from source and target.

## v12.422.6
- Fix for auto range checks
- Fix for flags checks
- `pt-BR` translation update by @Kharmans !
- Change of how fail flags are affecting rolls by passing a target value of 1000

## v12.422.5
- Fix for criticals not being properly highlighted
- Fix for initiative rolls
  
## v12.422.4
- Fix for Frightened when no effect origin is present
- Fix for Grappled when no effect origin is present
- Added target: 'disadvantage' for attacks when Hiding

## v12.422.3
- Fix for rolling always critical when MidiQOL is active!

## v12.422.2
- First public 4.2.2 release
- Added modern rules for conditions with any slight changes gated behind the dnd5e system's rules choice.
- Should be compatible with Vanilla 5e, MidiQOL, Ready Set Roll.

## v12.422.1
- Compatibility update to support 5e 4.2.2 and higher.
- First pass into module flags which will alter advantage mode of relevant rolls (documentation to follow).
- Next version will implement modern/legacy rules as needed
  
## v12.331.3.2
- `pt-BR` translation update by @Kharmans !

## v12.331.3
- Added incapacitated status check for spells use.
- Incapacitated shouldn't be considered when testing for nearby foes. Closes [#166](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/166)
- `it.json` by @GregoryWarn in [#163](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/163)

## v12.331.2
- Fix for raging and silenced checks not working properly.
- The proper flag for Subtle Spell is `flags.automated-conditions-5e.subtleSpell | Override | 1`

## v12.331.1
- Foundry v12 only compatibility
- Changes to getDistance calculations based on the work of [Illandril](https://github.com/illandril) in [Illandril's Token Tooltips](https://github.com/illandril/FoundryVTT-token-tooltips?tab=readme-ov-file#illandrils-token-tooltips) (big thanks!)
    - Should be calculating distances in 3D and hardcodes as Token's "height" the minimum of `token.document.width` or `token.document.height` (in a future update, a proper z-axis height could be implemented).
- Added casting spells checks automation (with options to do nothing/enforce/warn) for:
    - Rage/Raging,
    - Silenced and not having a Subtle Spell (localized string) named Active Effect, or a `flags.automated-conditions-5e.subtleSpell | Override | 1`

## v11.315331.3.1
- Small fix for fr.json in [#158](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/158), thanks @CaosFR

## v11.315331.3
- Handle items without short and long range set more gracefully. Closes [#156](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/156)

## v11.315331.2
- Added French translation, with [#154](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/154) thanks to @CaosFR

## v11.315331.1
- System compatibility bump for 5e v3.3.1, closing [#142](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/142)
- Added Russian translation, closing [#144](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/144) thanks to @VirusNik21
  
## v11.315321.3
- Merged [#139](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/139) - Italian translation. Thanks to @GregoryWarn. 

## v11.315321.2
- Closes [#137](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/137) - Exhaustion for Death Saves is always Enabled.

## v11.315321.1
- Just a compatibility bump for 5e 3.2.1 and Foundry v12
- `pt_BR` translation updates by @Kharmans (thanks as always)

## v11.315312.7
- Closes [#125](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/125) - implement checks for non-proficient equipped shields, allowing for these to alter relevant rolls (like Armor already does).

## v11.315312.6
* Closes [#122](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/122) - reinstates compatibility with MidiQOL flags altering rolls (and shows a generic MidiQOL (flags)) in the tooltip.

## v11.315312.5
* Update pt-BR.json by @Kharmans in [#111](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/111) and [#116](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/116)
* Closes [#110](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/110) - nearbyFoe calcs no matter options for target enforcement by @thatlonelybugbear in [#113](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/113)
* Closes [#112](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/112) - Added some more targetElements querySelectors for RSR by @thatlonelybugbear in [#114](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/114)
* Closes [#108](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/108) - Lack of armor proficiency restricts spell casting by @thatlonelybugbear in [#115](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/115)
* Closes [#109](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/109) - Respect preexisting objects by @thatlonelybugbear in [#117](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/117)
* Closes [#118](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/118) - Add correct targetElements for Core rolling chat messages tooltips by @thatlonelybugbear in [#119](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/119)

## v11.315312.4
* Closes [#94](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/94), adding Dodging and Hiding automation.
* Closes [#104](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/104), adding a setting for switching off Nearby Foe automation (also adjusted disposition requirements to be of the opposite type, friendly vs hostile).
* Closes [#106](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/106), removing some `eval()` calls.

## v11.315312.3
* Update pt-BR.json by @Kharmans in https://github.com/thatlonelybugbear/automated-conditions-5e/pull/101
* Closes once more #77, fixing the armor issues, once and for all  🤞

### v11.315312.2.1
- Hotfix for `hasArmor` not being defined.

## v11.315312.2
- Closes [#97](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/97), allowing all equipment type Items to impose Stealth disadvantage.

## v11.315312.1
- Closes [#98](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/98), adding dnd5e v3.1.2 compatibility.
  
## v11.315311.6
- Closes [#89](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/89), reinstating MidiQOL compatibility.

## v11.315311.5
- Closes [#87](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/87), [#88](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/88), [#92](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/92)
- Still investigating [#89](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/89), will rewrite the MidiQOL integration code.

## v11.315311.4
- Closes [#85](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/85). Fixes the fix of the wrong tooltip format...

## v11.315311.3
- Closes [#82](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/82). Fixes wrong tooltip format.

## v11.315311.2
- Added a setting to not show module name in tooltips. Closes [#80](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/80).

## v11.315311.1
- Initial work for compatibility with all main rollers, like MidiQOL [#49](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/49), Ready Set Roll [#50](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/50) and Group Rolls.
- Closing [#72](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/72) bug regarding AC calculations error when not set to equipped armor.
- Closing [#75](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/75) with settings for AC5e tooltips on Dialogs and generated Chat Messages when available (needs some more tweaks for RSR Item roll chat messages).
- Bumping dnd5e max version to 3.1.1 as tested.

## v11.315.310.2
- `pt-BR` translation added by @Kharmans [71](https://github.com/thatlonelybugbear/automated-conditions-5e/pull/71)
- small `en` translation edits.

## v11.315.310.1
D&D5e 3.1 compatibility update.
- Added `dnd5e.preRollConcentration` Hook to deal with conditions affecting concentration saving throws.
  - Exhaustion 3-5 applies disadvantage.
  - Heavy Encumbrance applies disadvantage.
  - War Caster named Item applies advantage.

## v11.315.304.7
Closes [63](https://github.com/thatlonelybugbear/automated-conditions-5e/issues/63) with a new setting for `AC5e targeting options`. <br><br>
When 0 or more than 1 targets are selected, AC5e will not be able by default to calculate correctly advantageMode/damageMode as this is done based on the first of the `game.user.targets` only. There is now a setting for the GM to decide how AC5e will deal with targeting and rolling an Attack or Damage, or try to Use an Item that has an attack and Target any of the Individual target options in its details tab. The options are as follows:
   * `From Source Only`: The advantageMode/damageMode will be calculated based on effects/conditions etc on the Source actor only (___default option___),
   * `Do nothing`: No calculations whatsoever will take place,
   * `Enforce targeting`: Will cancel the incoming Roll or Item use, and display a warning for the user to target `1 Target` (___Use with caution___).


## v11.315.304.6.8
* Fix bug when rolling an attack and automated encumbrance is true.

## v11.315.304.6.7
* Default settings fix.
  * Tooltips on
  * Armor automation off
  * Range automation off
  * Exhaustion automation on
  * Encumbrance automation off (will need also dnd5e system setting to be set to Variant option too).

## v11.315.304.6.6
* Fixes typos
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
