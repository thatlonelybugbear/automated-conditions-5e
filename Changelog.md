## 13.503.4
* Expose a checkNearby function to help with Pack Tactics:
  * `flags.automated-conditions-5e.attack.advantage | Override | checkNearby(opponentId, 'different', 5, {count: 2})`
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
