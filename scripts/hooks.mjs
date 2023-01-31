import { 
  _getMinimumDistanceBetweenTokens
} from "./helpers.mjs";

export function _preRollAbilitySave(actor,config,abilityId) {
  let adv = false;
  let dis = false;
  const sourceActorEffects = actor.effects.filter(eff=>!eff.disabled);

  //Exhaustion 3-5
  if (["Exhaustion 3", "Exhaustion 4", "Exhaustion 5"].some(i=>sourceActorEffects?.find(eff=>eff.label.includes(i)))) dis = true;

  //Paralysed condition to-do make it fail by default! + Petrified condition + Stunned condition
  if (sourceActorEffects?.some(eff=>["Paralysed", "Paralyzed", "Petrified", "Stunned", "Unconscious"].includes(eff.label)) && (abilityId === "dex" || abilityId === "str")) {
      let newParts = duplicate(config.parts);
      newParts = newParts.concat("-99");
      foundry.utils.setProperty(config, "parts", newParts);
  }
  //Restrained condition
  if (sourceActorEffects?.find(eff=>eff.label === "Restrained") && abilityId === "dex") dis = true;

  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

export function _preRollSkill(actor,config,abilityId) {
  let adv = false;
  let dis = false;
  const sourceActorEffects = actor.effects.filter(eff=>!eff.disabled);

  //Exhaustion 1-5
  if (["Exhaustion 1", "Exhaustion 2", "Exhaustion 3", "Exhaustion 4", "Exhaustion 5"].some(i=>sourceActorEffects?.find(eff=>eff.label.includes(i)))) dis = true;

  //Frightened condition
  if (sourceActorEffects?.find(eff=>eff.label === "Frightened")) dis = true;

  //Poisoned condition
  if (sourceActorEffects?.find(eff=>eff.label === "Poisoned")) dis = true;

  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

export function _preRollAbilityTest(actor,config,abilityId) {
  let adv = false;
  let dis = false;
  const sourceActorEffects = actor.effects.filter(eff=>!eff.disabled);

  //Exhaustion 1-5
  if (["Exhaustion 1", "Exhaustion 2", "Exhaustion 3", "Exhaustion 4", "Exhaustion 5"].some(i=>sourceActorEffects?.find(eff=>eff.label.includes(i)))) dis = true;

  //Frightened condition
  if (sourceActorEffects?.find(eff=>eff.label === "Frightened")) dis = true;

  //Poisoned condition
  if (sourceActorEffects?.find(eff=>eff.label === "Poisoned")) dis = true;

  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

export function _preRollAttack(item, config) {
  let adv = false;
  let dis = false;
  const sourceActorEffects = item.actor.effects.filter(eff=>!eff.disabled);
  const sourceActorToken = item.actor.token ?? canvas.tokens.placeables.find(t => t.actor?.id === item.actor.id);
  let singleTargetEffects;
  let singleTargetActor = game.user.targets?.first()?.actor;
  let singleTargetToken = game.user.targets?.first();
  if (singleTargetActor?.size === 1) singleTargetEffects = singleTargetActor.effects.filter(eff=>!eff.disabled);

  //Blinded condition
  if (sourceActorEffects?.find(eff=>eff.label === "Blinded")) dis = true;
  if (singleTargetEffects?.find(eff=>eff.label === "Blinded")) adv = true;
  
  //Deafened condition - todo vocal spells fail or Arcana Check to cast; DC 10 + spell level
  
  //Exhaustion 3-5
  if (["Exhaustion 3", "Exhaustion 4", "Exhaustion 5"].some(i=>sourceActorEffects?.find(eff=>eff.label.includes(i)))) dis = true;

  //Frightened condition
  if (sourceActorEffects?.find(eff=>eff.label === "Frightened")) dis = true;

  //Invisible condition
  if (sourceActorEffects?.find(eff=>eff.label === "Invisible")) adv = true;
  if (singleTargetEffects?.find(eff=>eff.label === "Invisible")) dis = true;

  //Paralysed condition.
  if (singleTargetEffects?.find(eff=>eff.label === "Paralysed" || eff.label === "Paralyzed")) adv = true;
  
  //Petrified condition.
  if (singleTargetEffects?.find(eff=>eff.label === "Petrified")) adv = true;

  //Poisoned condition
  if (sourceActorEffects?.find(eff=>eff.label === "Poisoned")) dis = true;

  //Prone condition
  if (singleTargetEffects?.find(eff=>eff.label === "Prone") && (item.system.actionType === "mwak" || item.system.actionType === "msak")) adv = true;
  if (singleTargetEffects?.find(eff=>eff.label === "Prone") && (item.system.actionType === "rwak" || item.system.actionType === "rsak")) dis = true;
  if (sourceActorEffects?.find(eff=>eff.label === "Prone")) dis = true;

  //Restrained condition
  if (sourceActorEffects?.find(eff=>eff.label === "Restrained")) dis = true;
  if (singleTargetEffects?.find(eff=>eff.label === "Restrained")) adv = true;

  //Stunned condition
  if (singleTargetEffects?.find(eff=>eff.label === "Stunned")) adv = true;

  //Unconscious condition
  if (singleTargetEffects?.find(eff=>eff.label === "Unconscious")) adv = true;

  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

export function _preRollDamage(item, config) {
  let crit = false;
  const sourceActorEffects = item.actor.effects.filter(eff=>!eff.disabled);
  const sourceActorToken = item.actor.token ?? item.actor.getActiveTokens()[0];
  let singleTargetEffects;
  let singleTargetActor = game.user.targets?.first()?.actor;
  let singleTargetToken = game.user.targets?.first();
  if (singleTargetActor?.size === 1) singleTargetEffects = singleTargetActor.effects.filter(eff=>!eff.disabled);

  //Paralysed condition.
  if (singleTargetEffects?.find(eff=>eff.label === "Paralysed" || eff.label === "Paralyzed") && _getMinimumDistanceBetweenTokens(sourceActorToken,singleTargetToken)<=5) crit = true; 

  //Unconscious condition
  if (singleTargetEffects?.find(eff=>eff.label === "Paralysed" || eff.label === "Paralyzed") && _getMinimumDistanceBetweenTokens(sourceActorToken,singleTargetToken)<=5) crit = true; 

  if (crit) foundry.utils.setProperty(config, "critical", true);
  else return true;
}
