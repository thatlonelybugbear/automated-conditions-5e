# Automated Conditions 5e
![](https://img.shields.io/badge/Foundry-v10.291-informational) ![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/thatlonelybugbear/automated-conditions-5e) ![GitHub Releases](https://img.shields.io/github/downloads/thatlonelybugbear/automated-conditions-5e/latest/total) ![GitHub Releases](https://img.shields.io/github/downloads/thatlonelybugbear/automated-conditions-5e/total) ![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fautomated-conditions-5e&colorB=4aa94a) 

A small module for Foundry and Dnd5e which uses dnd5e system Hooks to add the correct config options for Rolls, trying to automate the most common Dnd5e Conditions.

Rolling with Core, will indicate the correct button to press, on Attack Rolls, Damage Rolls, Saving Throws, Ability Checks and Skill Checks, according to the 5e ruleset.
Fast Forwarding the rolls (holding SHIFT) will roll with advantage/disadvantage or when needed critical damage correctly.

# Dnd5e Conditions supported
- Blinded: < Disadvantage on attacks and grants Advantage to attacks from others >
- Exhaustion 1: <Disadvantage on ability checks (and skill checks as a result)>
- Exhaustion 2: <==> 
- Exhaustion 3: <++ Disadvantage on attacks and saving throws>
- Exhaustion 4: <==>
- Exhaustion 5: <==>
- Frightened: <Disadvantage on ability checks and attack rolls; v10.0.3 will be testing for Visibility of origin if available to add this or not>
- Invisible: < Advantage on attacks and grants Disadvantage to attacks by others >
- Paralyzed (or Paralysed): <Auto fail (-99) strength/dexterity saves and attacker within 5ft of the creature deals critical damage>
- Petrified: <Grants Advantage on attacks by others, auto fail strength/dexterity saves>
- Poisoned: < Disadvantage on attacks and ability checks >
- Prone: <Disadvantage on attacks, grants advantage on attacks by others if within 5ft, otherwise grants disdvantage>
- Restrained: <Disadvantage on attacks and dexterity saves, grants advantage on attacks by others>
- Stunned: <Auto fail strength/dexterity saves, grants advantage on attacks by others>
- Unconscious: <Auto fails strength/dexterity saves, grants advantage on attacks by others, crit if hit within 5ft ++ Prone>

** Early stage of development so reach out either here by creating an Issue or in Foundry's discord (thatlonelybugbear#4393).

# Compatibility
Works 100% with Core, highlightning the correct buttons to press depending on the conditions on attacker and target, and Fast Forwards correctly.

No other Rolling modules work adequately for now.

I will need to think on how to better integrate (if possible) with Monks Little Details, DFreds CE and maybe CUB, which could change default DND5e conditions.

# Credits
- Special thanks to [Zhell](https://github.com/krbz999) for using some of his code from [Babonus](https://github.com/krbz999/babonus).
