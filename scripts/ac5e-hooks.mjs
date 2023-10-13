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
  if (sourceActorEffects.length === 0) return true;
//Exhaustion 1-5
  const exhaustion = [CONFIG.DND5E.conditionTypes.exhaustion+" 1", CONFIG.DND5E.conditionTypes.exhaustion+" 2", CONFIG.DND5E.conditionTypes.exhaustion+" 3", CONFIG.DND5E.conditionTypes.exhaustion+" 4", CONFIG.DND5E.conditionTypes.exhaustion+" 5"]
  if (getEffects(exhaustion,sourceActorEffects)) dis = true;
//Frightened condition
  if (getEffects(CONFIG.DND5E.conditionTypes.frightened, sourceActorEffects)) dis = true;
//Poisoned condition
  if (getEffects(CONFIG.DND5E.conditionTypes.poisoned, sourceActorEffects)) dis = true;
//totals calc
  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

export function _preRollAbilityTest(actor,config,abilityId) {
  let adv = false;
  let dis = false;
  const sourceActorEffects = actor.effects.filter(eff=>!eff.disabled);
  if (sourceActorEffects.length === 0) return true;
//Exhaustion 1-5
  const exhaustion = [CONFIG.DND5E.conditionTypes.exhaustion+" 1", CONFIG.DND5E.conditionTypes.exhaustion+" 2", CONFIG.DND5E.conditionTypes.exhaustion+" 3", CONFIG.DND5E.conditionTypes.exhaustion+" 4", CONFIG.DND5E.conditionTypes.exhaustion+" 5"]
  if (getEffects(exhaustion,sourceActorEffects)) dis = true;
//Frightened condition
  if (getEffects(CONFIG.DND5E.conditionTypes.frightened, sourceActorEffects)) dis = true;
//Poisoned condition
  if (getEffects(CONFIG.DND5E.conditionTypes.poisoned, sourceActorEffects)) dis = true;
//totals calc
  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

export function _preRollAttack(item, config) {
  let adv = false;
  let dis = false;
  const sourceActorEffects = item.actor.effects.filter(eff=>!eff.disabled);
  const sourceActorToken = item.actor.token?.object ?? item.actor.getActiveTokens()[0]; //canvas.tokens.placeables.find(t => t.actor?.id === item.actor.id);
  let singleTargetEffects;
  const singleTargetActor = game.user.targets?.first()?.actor;
  const singleTargetToken = game.user.targets?.first();
  if (singleTargetActor) singleTargetEffects = singleTargetActor.effects.filter(eff=>!eff.disabled);
  if (sourceActorEffects.length === 0 && singleTargetEffects?.length === 0) return true;
  //to-do: Warning if more than one target selected.
//Blinded condition
  if (!!sourceActorEffects && getEffects(CONFIG.DND5E.conditionTypes.blinded, sourceActorEffects)) dis = true;
  if (!!singleTargetEffects && getEffects(CONFIG.DND5E.conditionTypes.blinded, singleTargetEffects)) adv = true;
//Exhaustion 3-5
const exhaustion = [CONFIG.DND5E.conditionTypes.exhaustion+" 3", CONFIG.DND5E.conditionTypes.exhaustion+" 4", CONFIG.DND5E.conditionTypes.exhaustion+" 5"];
  if (!!sourceActorEffects && getEffects(exhaustion, sourceActorEffects)) dis = true;
//Frightened condition
  if (!!sourceActorEffects && getEffects(CONFIG.DND5E.conditionTypes.frightened, sourceActorEffects)) dis = true;
//Invisible condition
  if (!!sourceActorEffects && getEffects(CONFIG.DND5E.conditionTypes.invisible, sourceActorEffects)) adv = true;
  if (!!singleTargetEffects && getEffects(CONFIG.DND5E.conditionTypes.invisible, singleTargetEffects)) dis = true;
//Paralyzed condition
  if (!!singleTargetEffects && getEffects(["Paralysed",CONFIG.DND5E.conditionTypes.paralyzed], singleTargetEffects)) adv = true;
//Petrified condition
  if (!!singleTargetEffects && getEffects(CONFIG.DND5E.conditionTypes.petrified, singleTargetEffects)) adv = true;
//Poisoned condition
  if (!!sourceActorEffects && getEffects(CONFIG.DND5E.conditionTypes.poisoned, sourceActorEffects)) dis = true;
//Prone condition
  if (!!singleTargetEffects && getEffects(CONFIG.DND5E.conditionTypes.prone, singleTargetEffects) && ["mwak","msak"].includes(item.system.actionType)) {
    if (_getMinimumDistanceBetweenTokens(sourceActorToken,singleTargetToken)<=5) adv = true;     //mock test for thrown weapons - might revisit this later.
    else dis = true;
  };
  if (!!singleTargetEffects && getEffects(CONFIG.DND5E.conditionTypes.prone, singleTargetEffects) && ["rwak","rsak"].includes(item.system.actionType)) dis = true;
  if (!!sourceActorEffects && getEffects(CONFIG.DND5E.conditionTypes.prone, sourceActorEffects)) dis = true;
//Restrained condition
  if (!!sourceActorEffects && getEffects(CONFIG.DND5E.conditionTypes.restrained, sourceActorEffects)) dis = true;
  if (!!singleTargetEffects && getEffects(CONFIG.DND5E.conditionTypes.restrained, singleTargetEffects)) adv = true;
//Stunned condition
  if (!!singleTargetEffects && getEffects(CONFIG.DND5E.conditionTypes.stunned, singleTargetEffects)) adv = true;
//Unconscious condition
  if (!!singleTargetEffects && getEffects(CONFIG.DND5E.conditionTypes.unconscious, singleTargetEffects)) adv = true;
//totals calc
  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

export function _preRollDamage(item, config) {
  let crit = false;
  const sourceActorEffects = item.actor.effects.filter(eff=>!eff.disabled);
  const sourceActorToken = item.actor.token?.object ?? item.actor.getActiveTokens()[0]; //
  let singleTargetEffects;
  const singleTargetActor = game.user.targets?.first()?.actor;
  const singleTargetToken = game.user.targets?.first();
  if (singleTargetActor) singleTargetEffects = singleTargetActor.effects.filter(eff=>!eff.disabled);
  if (sourceActorEffects.length === 0 && singleTargetEffects?.length === 0) return true;
  //to-do: Warning if more than one target selected.
//Paralysed condition.
  if (!!singleTargetEffects && getEffects(["Paralysed",CONFIG.DND5E.conditionTypes.paralyzed], singleTargetEffects) && _getMinimumDistanceBetweenTokens(sourceActorToken,singleTargetToken)<=5) crit = true;
//Unconscious condition
  if (!!singleTargetEffects && getEffects(CONFIG.DND5E.conditionTypes.unconscious, singleTargetEffects) && _getMinimumDistanceBetweenTokens(sourceActorToken,singleTargetToken)<=5) crit = true;
//totals calc
  if (crit) foundry.utils.setProperty(config, "critical", true);
  else return true;
}

export function _preRollDeathSave(actor, config) {
  let adv = false;
  let dis = false;
  const sourceActorEffects = actor.effects.filter(eff=>!eff.disabled);
  if (sourceActorEffects.length === 0) return true;
//Exhaustion 3-5
  const exhaustion = [CONFIG.DND5E.conditionTypes.exhaustion+" 3", CONFIG.DND5E.conditionTypes.exhaustion+" 4", CONFIG.DND5E.conditionTypes.exhaustion+" 5"];
  if (!!sourceActorEffects && getEffects(exhaustion, sourceActorEffects)) dis = true;
//totals calc
  if (adv === true && dis === false) foundry.utils.setProperty(config, "advantage", true);
  else if (adv === false && dis === true) foundry.utils.setProperty(config, "disadvantage", true);
  else return true;
}

function getEffects(effectName, effects) {
  if (typeof(effectName) === "string") effectName = [effectName];
  return effectName.some(name => effects.some(eff=>eff.label === name));
}
