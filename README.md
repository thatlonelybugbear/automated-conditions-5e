# Automated-Conditions-5e
A small module for Foundry and Dnd5e which uses dnd5e Hooks to add the correct config options for Rolls, depending on the most common 5e conditions.


# Usage
Create an effect on a token with one of the following labels:
- Blinded
- Deafened
- Exhaustion 1
- Exhaustion 2
- Exhaustion 3
- Exhaustion 4
- Exhaustion 5
- Frightened
- Invisible
- Paralyzed (or Paralysed)
- Petrified
- Poisoned
- Prone
- Restrained
- Stunned
- Unconscious

Rolling with Core, will (hopefully) indicate the correct button to press, on Attack Rolls, Saving Throws, Ability Checks, Skill Checks and Damage Rolls, according to the 5e ruleset.

Using a module altering Core's Roll functions and maybe fastForwarding should roll with the correct advantage/disadvantage/critical options selected.

Early stage of developemt so reach out either here by creating an Issue or in Foundry's discord (thatlonelybugbear#4393).

# Compatibility
Tested for core dnd5e and seems to be working fine.

MidiQOL also seems to work OK.

I haven't tested with other rolling modules yet.

DFreds CE and CUB might have duplicated functionality. More tests needed.

# Credits
Special thanks to Zhell <https://github.com/krbz999> for using some of his code from <https://github.com/krbz999/babonus>
