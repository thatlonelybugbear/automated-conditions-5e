import { 
  _getMinimumDistanceBetweenTokens
} from "./helpers.mjs";

export function _preRollAbilitySave(actor,config,abilityId) {
  let adv = false;
  let dis = false;
  const sourceActorEffects = actor.effects.filter(eff=>!eff.disabled);
//Exhaustion 3-5
  if ([CONFIG.DND5E.conditionTypes.exhaustion+" 3", CONFIG.DND5E.conditionTypes.exhaustion+" 4", CONFIG.DND5E.conditionTypes.exhaustion+" 5"].some(i=>sourceActorEffects?.find(eff=>eff.label.includes(i)))) dis = true;
//Paralysed, Petrified, Stunned, Unconscious conditions
  if (sourceActorEffects?.some(eff=>[CONFIG.DND5E.conditionTypes.paralyzed, "Paralysed", CONFIG.DND5E.conditionTypes.petrified, CONFIG.DND5E.conditionTypes.stunned, CONFIG.DND5E.conditionTypes.unconscious].includes(eff.label)) && (abilityId === "dex" || abilityId === "str")) {
      let newParts = duplicate(config.parts);
      newParts = newParts.concat("-99");
      foundry.utils.setProperty(config, "parts", newParts);
  }
//Restrained condition
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.restrained) && abilityId === "dex") dis = true;
//totals calc
  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

export function _preRollSkill(actor,config,abilityId) {
  let adv = false;
  let dis = false;
  const sourceActorEffects = actor.effects.filter(eff=>!eff.disabled);
//Exhaustion 1-5
  if ([CONFIG.DND5E.conditionTypes.exhaustion+" 1", CONFIG.DND5E.conditionTypes.exhaustion+" 2", CONFIG.DND5E.conditionTypes.exhaustion+" 3", CONFIG.DND5E.conditionTypes.exhaustion+" 4", CONFIG.DND5E.conditionTypes.exhaustion+" 5"].some(i=>sourceActorEffects?.find(eff=>eff.label.includes(i)))) dis = true;
//Frightened condition
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.frightened)) dis = true;
//Poisoned condition
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.poisoned)) dis = true;
//totals calc
  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

export function _preRollAbilityTest(actor,config,abilityId) {
  let adv = false;
  let dis = false;
  const sourceActorEffects = actor.effects.filter(eff=>!eff.disabled);
//Exhaustion 1-5
  if ([CONFIG.DND5E.conditionTypes.exhaustion+" 1", CONFIG.DND5E.conditionTypes.exhaustion+" 2", CONFIG.DND5E.conditionTypes.exhaustion+" 3", CONFIG.DND5E.conditionTypes.exhaustion+" 4", CONFIG.DND5E.conditionTypes.exhaustion+" 5"].some(i=>sourceActorEffects?.find(eff=>eff.label.includes(i)))) dis = true;
//Frightened condition
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.frightened)) dis = true;
//Poisoned condition
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.poisoned)) dis = true;
//totals calc
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
  const singleTargetActor = game.user.targets?.first()?.actor;
  const singleTargetToken = game.user.targets?.first();
  if (game.user.targets?.size === 1) singleTargetEffects = singleTargetActor.effects.filter(eff=>!eff.disabled);
//Blinded condition
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.blinded)) dis = true;
  if (singleTargetEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.blinded)) adv = true;
//Exhaustion 3-5
  if ([CONFIG.DND5E.conditionTypes.exhaustion+" 3", CONFIG.DND5E.conditionTypes.exhaustion+" 4", CONFIG.DND5E.conditionTypes.exhaustion+" 5"].some(i=>sourceActorEffects?.find(eff=>eff.label.includes(i)))) dis = true;
//Frightened condition
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.frightened)) dis = true;
//Invisible condition
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.invisible)) adv = true;
  if (singleTargetEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.invisible)) dis = true;
//Paralysed condition.
  if (singleTargetEffects?.find(eff=>eff.label === "Paralysed" || eff.label === CONFIG.DND5E.conditionTypes.paralyzed)) adv = true;
//Petrified condition.
  if (singleTargetEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.petrified)) adv = true;
//Poisoned condition
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.poisoned)) dis = true;
//Prone condition
  if (singleTargetEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.prone) && (item.system.actionType === "mwak" || item.system.actionType === "msak")) adv = true;
  if (singleTargetEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.prone) && (item.system.actionType === "rwak" || item.system.actionType === "rsak")) dis = true;
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.prone)) dis = true;
//Restrained condition
  if (sourceActorEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.restrained)) dis = true;
  if (singleTargetEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.restrained)) adv = true;
//Stunned condition
  if (singleTargetEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.stunned)) adv = true;
//Unconscious condition
  if (singleTargetEffects?.find(eff=>eff.label === CONFIG.DND5E.conditionTypes.unconscious)) adv = true;
//totals calc
  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

export function _preRollDamage(item, config) {
  let crit = false;
  const sourceActorEffects = item.actor.effects.filter(eff=>!eff.disabled);
  const sourceActorToken = item.actor.token ?? item.actor.getActiveTokens()[0];
  let singleTargetEffects;
  const singleTargetActor = game.user.targets?.first()?.actor;
  const singleTargetToken = game.user.targets?.first();
  if (game.user.targets?.size === 1) singleTargetEffects = singleTargetActor.effects.filter(eff=>!eff.disabled);
//Paralysed condition.
  if (singleTargetEffects?.find(eff=>eff.label === "Paralysed" || eff.label === CONFIG.DND5E.conditionTypes.paralyzed) && _getMinimumDistanceBetweenTokens(sourceActorToken,singleTargetToken)<=5) crit = true; 
//Unconscious condition
  if (singleTargetEffects?.find(eff=>eff.label === "Paralysed" || eff.label === CONFIG.DND5E.conditionTypes.paralyzed) && _getMinimumDistanceBetweenTokens(sourceActorToken,singleTargetToken)<=5) crit = true; 
//totals calc
  if (crit) foundry.utils.setProperty(config, "critical", true);
  else return true;
}
