import {
  _preRollAbilitySave,
  _preRollSkill,
  _preRollAbilityTest,
  _preRollAttack,
  _preRollDamage,
  _preRollDeathSave
} from "./scripts/hooks.mjs";

Hooks.once("init", () => {
  console.log("Bugbear's Automated Conditions for 5e spinning up!");
});

Hooks.on("dnd5e.preRollAbilitySave", _preRollAbilitySave);
Hooks.on("dnd5e.preRollSkill", _preRollSkill);
Hooks.on("dnd5e.preRollAbilityTest", _preRollAbilityTest);
Hooks.on("dnd5e.preRollAttack", _preRollAttack);
Hooks.on("dnd5e.preRollDamage", _preRollDamage);
Hooks.on("dnd5e.preRollDeathSave", _preRollDeathSave);
