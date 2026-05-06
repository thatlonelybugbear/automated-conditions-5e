## Table of Contents

Applies to version: `13.5250.18`

- [Assassinate](#assassinate)
- [Aura of Protection](#aura-of-protection)
- [Blood Frenzy](#blood-frenzy)
- [Bloodied Frenzy](#bloodied-frenzy)
- [Bugbear's Surprise Attack](#bugbears-surprise-attack)
- [Charger (incomplete)](#charger-incomplete)
- [Cloak of Flies](#cloak-of-flies)
- [Danger Sense](#danger-sense)
- [Disciple of Life](#disciple-of-life)
- [Dwarven Resilience](#dwarven-resilience)
- [Great Weapon Fighting](#great-weapon-fighting)
- [Healer feat](#healer-feat)
- [Hexblade's Curse](#hexblades-curse)
- [Hunter's Mark](#hunters-mark)
- [Magic Resistance](#magic-resistance)
- [Pack Tactics](#pack-tactics)
- [Potent Spellcasting](#potent-spellcasting)
- [Protection from Evil and Good](#protection-from-evil-and-good)
- [Sure Footed](#sure-footed)
- [Thrown Weapon Fighting Style](#thrown-weapon-fighting-style)
- [Random Examples of Functionality](#random-examples-of-functionality)
  - [Aura of Save Disadvantage](#aura-of-save-disadvantage)
- [New Syntax Examples](#new-syntax-examples)
- [Enforced Roll Mode](#enforced-roll-mode)
- [Modified Save DC](#modified-save-dc)
<hr>

> 💡 The active effect's change mode doesn't matter currently. Recommendation, use Custom or Override.

## Assassinate
```
key: flags.automated-conditions-5e.attack.advantage

value: combat.round === 1 && rollingActor.combatTurn < opponentActor.combatTurn
```
## Aura of Protection
```
key: flags.automated-conditions-5e.aura.save.bonus

value: bonus=auraActor.abilities.cha.mod; radius=(auraActor.details.level < 18 ? 10 : 30); allies; singleAura; includeSelf
```
## Blood Frenzy
```
key: flags.automated-conditions-5e.attack.advantage

value: opponentActor.attributes.hp.pct < 100
```
## Bloodied Frenzy
```
//entry one
key: flags.automated-conditions-5e.attack.advantage

value: opponentActor.statuses.bloodied || opponentActor.attributes.hp.pct < 50

//entry two
key: flags.automated-conditions-5e.save.advantage

value: opponentActor.statuses.bloodied || opponentActor.attributes.hp.pct < 50
```
## Bugbear's Surprise Attack
```
key: flags.automated-conditions-5e.damage.bonus

value: bonus=2d6; hasAttack && combat.round === 1 && rollingActor.combatTurn < opponentActor.combatTurn
```
## Charger (incomplete)
```
key: flags.automated-conditions-5e.damage.bonus

value: bonus=1d8; actionType.mwak && movementLastSegment >= 10
```
## Cloak of Flies
Needs two active effects
```
=== Effect 1 ===
key: flags.automated-conditions-5e.check.disadvantage

value: ability.cha && !skill.itm

=== Effect 2 ===
key: flags.automated-conditions-5e.check.advantage

value: ability.cha && skill.itm
```
## Danger Sense
```
key: flags.automated-conditions-5e.save.advantage

value: ability.dex && !rollingActor.statuses.incapacitated
```
## Disciple of Life
```
key: flags.automated-conditions-5e.damage.bonus

value: bonus=2 + castingLevel; isSpell && defaultDamageType.healing
```
## Dwarven Resilience
```
key: flags.automated-conditions-5e.save.advantage

value: riderStatuses.poisoned
```
## Great Weapon Fighting
```
key: flags.automated-conditions-5e.damage.modifier

value: modifier=min3;twoHanded && mwak
```
## Healer feat
```
key: flags.automated-conditions-5e.damage.modifier

value: modifier=r1;healing && isSpell
```
## Hexblade's Curse
```
key: flags.automated-conditions-5e.grants.attack.criticalThreshold
value: set=19; effectOriginTokenId === tokenId

key: flags.automated-conditions-5e.grants.damage.bonus
value: bonus=rollingActor.attributes.prof; effectOriginTokenId === tokenId;
```
## Hunter's Mark
```
key: flags.automated-conditions-5e.grants.damage.bonus

value: bonus=1d6[force]; effectOriginTokenId === tokenId && hasAttack;

setup: Activity applies an Active Effect on a target, then the source actor can get a bonus to damage rolls against their mark!
```
## Magic Resistance
```
key: flags.automated-conditions-5e.save.advantage

value: mgc
```
## Pack Tactics
```
key: flags.automated-conditions-5e.attack.advantage

value: checkNearby(opponentId, 'different', 5, {count:(distance <= 5 ? 2 : 1)}) 
```
## Potent Spellcasting
```
key: flags.automated-conditions-5e.damage.bonus

value: bonus=rollingActor.abilities.wis.mod; item.sourceClass === 'cleric' && isCantrip;
```
## Protection from Evil and Good
```
key: flags.automated-conditions-5e.grants.attack.disadvantage

value: ['aberration', 'celestial', 'elemental', 'fey', 'fiend', 'undead'].some(type => rollingActor.creatureType.includes(type));
```
## Sure Footed
```
key: flags.automated-conditions-5e.save.advantage

Either - value: riderStatuses.prone && ['dex', 'str'].some(a=>ability[a]);
Or - value: riderStatuses.prone && ['dex', 'str'].includes(options.ability);
```
## Thrown Weapon Fighting Style by @Michael 
```
key: flags.automated-conditions-5e.damage.bonus

value: bonus=2; activity.attackMode.includes('thrown');
```
## Random Examples of Functionality
### Aura of save disadvantage
If an enemy creature within 60 units of distance rolls a save associated with an activity doing Fire or Radiant damage, they get disadvantage;
```
key: flags.automated-conditions-5e.aura.save.disadvantage

value: radius=60; enemies; ['fire', 'radiant'].some(d=>damageTypes[d])
//or
value: radius=60; enemies; fire; radiant;
```

## New Syntax Examples (v13.5250.5)
### Range override using the shared `range` flag
```
key: flags.automated-conditions-5e.range

value: short=120; noLongDisadvantage
```

### Optional attack bonus with cadence and custom text
```
key: flags.automated-conditions-5e.attack.bonus

value: bonus=2; optin; oncePerTurn; name=Precise Strike; description=Add +2 to the attack roll.
```

### Damage bonus targeted by damage type
```
key: flags.automated-conditions-5e.damage.bonus

value: bonus=2d6[acid]; addTo=fire;
```

### Bonus damage with multiple offered types
```
key: flags.automated-conditions-5e.damage.bonus

value: bonus=1d4[fire, lightning, thunder];
```

### Override a base damage part to a single type
```
key: flags.automated-conditions-5e.damage.typeOverride

value: override=fire;
```

### Override a base damage part to a selected type from multiple options
```
key: flags.automated-conditions-5e.damage.typeOverride

value: override=fire, lightning, thunder; addTo=fire;
```

Notes:

- `damage.typeOverride` currently applies to base/native damage rolls only.
- Synthetic appended bonus damage rolls created by AC5E are not currently targeted by `damage.typeOverride`.
- `set=...` is still supported for backwards compatibility, but `override=...` is the preferred syntax.

### Extra dice multiplier on matching damage types
```
key: flags.automated-conditions-5e.damage.extraDice

value: bonus=^2; addTo=fire;
```

### Crit-only extra dice multiplier that scales with the base dice term
```
key: flags.automated-conditions-5e.damage.extraDice

value: criticalStatic; bonus=x2;
```

### Localized critical on damage
```
key: flags.automated-conditions-5e.damage.critical

value: optin; addTo=fire; name=Critical Fire;
```

### Finishing blow death-fail pressure with partial capped consume
```
key: flags.automated-conditions-5e.damage.bonus

value: bonus=info; usesCount=death.fail,(isCritical ? 2 : 1); partialConsume; name=Finishing Blow; opponentActor.attributes.hp.value === 0 && opponentActor.statuses.unconscious;
```

### Chance-gated use fail
```
key: flags.automated-conditions-5e.use.fail

value: chance=25; rollingActor.effects.some(e => e.name === "Dazed"); description=Reaction disrupted.
```

### Actor update instruction
This example will not respect damage types currently, but showcases the idea of an informational entry that applies an actor update instruction on use, which could be used for things like a monster's reactive damage trait that reduces the attacker's HP when triggered.
```
key: flags.automated-conditions-5e.grants.damage.info

value: update=rollingActor.hp,-3d6; name=Heated Body; description=A creature that hits it with a melee attack while within 5 feet of it takes 10 (3d6) fire damage;
```

## Enforced Roll Mode
### Force advantage from an informational entry
```
key: flags.automated-conditions-5e.attack.info

value: enforceMode=advantage; name=Steady Aim;
```

### Force normal mode after other d20-state calculations
```
key: flags.automated-conditions-5e.save.info

value: enforceMode=normal; name=Unshakable Focus;
```

Notes:

- `enforceMode` belongs in the Active Effect value field.
- Accepted values are `advantage`, `disadvantage`, `normal`, plus short aliases `adv`, `dis`, `norm`.
- When `enforceMode` wins, overridden pure d20-state entries do not consume `once`, cadence, or `usesCount`.

## Modified Save DC
### Increase save DC by 2
```
key: flags.automated-conditions-5e.save.modifyDC

value: bonus=2;
```

Behavior:

- For save/check activities, AC5E applies the DC change during activity use so the created chat message already shows the resolved DC.
- This does not create duplicate DC buttons on the chat card. AC5E rewrites the normal save/check button to the final resolved DC.

### Set save DC to a fixed value when a condition matches
```
key: flags.automated-conditions-5e.save.modifyDC

value: set=17; rollingActor.attributes.hp.pct < 50;
```

### Optional save DC increase chosen in the usage dialog
```
key: flags.automated-conditions-5e.save.modifyDC

value: bonus=15; optin; isSpell; name=New Effect;
```

Notes:

- For save/check activities, `optin` `modifyDC` entries are selected in D&D 5e's normal usage dialog.
- They are not shown again in the later save/check roll configuration dialog.
- The usage dialog `Cast Spell` button and the final activity-card DC button both show AC5E tooltip attribution for the resolved DC change.

MidiQOL note:

- AC5E updates the visible MidiQOL save/check item-card DC label after final `modifyDC` resolution.
- If one shared card represents mixed per-target modified DCs, the visible label is marked as `DC X (*)` and the per-target attribution tooltip shows the detailed source.
