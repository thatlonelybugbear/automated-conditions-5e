import {
	_getMinimumDistanceBetweenTokens,
	_getEffects,
	_getConditionName,
} from './ac5e-helpers.mjs';

export function _preRollAbilitySave(actor, config, abilityId) {
	let adv = false;
	let dis = false;
	const sourceActorEffects = actor.effects.filter((eff) => !eff.disabled);
	//Exhaustion 3-5
	if (
		[
			_getConditionName('Exhaustion') + ' 3',
			_getConditionName('Exhaustion') + ' 4',
			_getConditionName('Exhaustion') + ' 5',
		].some((i) => sourceActorEffects?.find((eff) => eff.name.includes(i)))
	)
		dis = true;
	//Paralysed, Petrified, Stunned, Unconscious conditions
	if (
		sourceActorEffects?.some((eff) =>
			[
				_getConditionName('Paralyzed'),
				'Paralysed',
				_getConditionName('Petrified'),
				_getConditionName('Stunned'),
				_getConditionName('Unconscious'),
			].includes(eff.name)
		) &&
		(abilityId === 'dex' || abilityId === 'str')
	) {
		config.parts = config.parts.concat('-99');
	}
	//Restrained condition
	if (
		sourceActorEffects?.find(
			(eff) => eff.name === _getConditionName('Restrained')
		) &&
		abilityId === 'dex'
	)
		dis = true;
	//totals calc
	if (adv === true && dis === false) config.advantage = true;
	else if (adv === false && dis === true) config.disadvantage = true;
	else return true;
}

export function _preRollSkill(actor, config, abilityId) {
	let adv = false;
	let dis = false;
	const sourceActorEffects = actor.effects.filter((eff) => !eff.disabled);
	if (!sourceActorEffects.length) return true;
	//Exhaustion 1-5
	const exhaustion = [
		_getConditionName('Exhaustion') + ' 1',
		_getConditionName('Exhaustion') + ' 2',
		_getConditionName('Exhaustion') + ' 3',
		_getConditionName('Exhaustion') + ' 4',
		_getConditionName('Exhaustion') + ' 5',
	];
	if (_getEffects(_getConditionName('Exhaustion'), sourceActorEffects)) dis = true;
	//Frightened condition
	if (_getEffects(_getConditionName('Frightened'), sourceActorEffects))
		dis = true;
	//Poisoned condition
	if (_getEffects(_getConditionName('Poisoned'), sourceActorEffects))
		dis = true;
	//totals calc
	if (adv === true && dis === false) config.advantage = true;
	else if (adv === false && dis === true) config.disadvantage = true;
	else return true;
}

export function _preRollAbilityTest(actor, config, abilityId) {
	let adv = false;
	let dis = false;
	const sourceActorEffects = actor.effects.filter((eff) => !eff.disabled);
	if (!sourceActorEffects.length) return true;
	//Exhaustion 1-5
	const exhaustion = [
		_getConditionName('Exhaustion') + ' 1',
		_getConditionName('Exhaustion') + ' 2',
		_getConditionName('Exhaustion') + ' 3',
		_getConditionName('Exhaustion') + ' 4',
		_getConditionName('Exhaustion') + ' 5',
	];
	if (_getEffects(_getConditionName('Exhaustion'), sourceActorEffects)) dis = true;
	//Frightened condition
	if (_getEffects(_getConditionName('Frightened'), sourceActorEffects))
		dis = true;
	//Poisoned condition
	if (_getEffects(_getConditionName('Poisoned'), sourceActorEffects))
		dis = true;
	//totals calc
	if (adv === true && dis === false) config.advantage = true;
	else if (adv === false && dis === true) config.disadvantage = true;
	else return true;
}

export function _preRollAttack(item, config) {
	let adv = false;
	let dis = false;
	const sourceActorEffects = item.actor.effects.filter((eff) => !eff.disabled);
	const sourceActorToken =
		item.actor.token?.object ?? item.actor.getActiveTokens()[0]; //canvas.tokens.placeables.find(t => t.actor?.id === item.actor.id);
	let singleTargetEffects;
	const singleTargetActor = game.user.targets?.first()?.actor;
	const singleTargetToken = game.user.targets?.first();
	if (singleTargetActor)
		singleTargetEffects = singleTargetActor.effects.filter(
			(eff) => !eff.disabled
		);
	if (!sourceActorEffects.length && !singleTargetEffects?.length)
		return true;
	//to-do: Warning if more than one target selected.
	//Blinded condition
	if (
		!!sourceActorEffects &&
		_getEffects(_getConditionName('Blinded'), sourceActorEffects)
	)
		dis = true;
	if (
		!!singleTargetEffects &&
		_getEffects(_getConditionName('Blinded'), singleTargetEffects)
	)
		adv = true;
	//Exhaustion 3-5
	const exhaustion = [
		_getConditionName('Exhaustion') + ' 3',
		_getConditionName('Exhaustion') + ' 4',
		_getConditionName('Exhaustion') + ' 5',
	];
	if (!!sourceActorEffects && _getEffects(_getConditionName('Exhaustion'), sourceActorEffects))
		dis = true;
	//Frightened condition
	if (
		!!sourceActorEffects &&
		_getEffects(_getConditionName('Frightened'), sourceActorEffects)
	)
		dis = true;
	//Invisible condition
	if (
		!!sourceActorEffects &&
		_getEffects(_getConditionName('Invisible'), sourceActorEffects)
	)
		adv = true;
	if (
		!!singleTargetEffects &&
		_getEffects(_getConditionName('Invisible'), singleTargetEffects)
	)
		dis = true;
	//Paralyzed condition
	if (
		!!singleTargetEffects &&
		_getEffects(
			['Paralysed', _getConditionName('Paralyzed')],
			singleTargetEffects
		)
	)
		adv = true;
	//Petrified condition
	if (
		!!singleTargetEffects &&
		_getEffects(_getConditionName('Petrified'), singleTargetEffects)
	)
		adv = true;
	//Poisoned condition
	if (
		!!sourceActorEffects &&
		_getEffects(_getConditionName('Poisoned'), sourceActorEffects)
	)
		dis = true;
	//Prone condition
	if (
		!!singleTargetEffects &&
		_getEffects(_getConditionName('Prone'), singleTargetEffects) &&
		['mwak', 'msak'].includes(item.system.actionType)
	) {
		if (
			_getMinimumDistanceBetweenTokens(sourceActorToken, singleTargetToken) <= 5
		)
			adv = true; //mock test for thrown weapons - might revisit this later.
		else dis = true;
	}
	if (
		!!singleTargetEffects &&
		_getEffects(_getConditionName('Prone'), singleTargetEffects) &&
		['rwak', 'rsak'].includes(item.system.actionType)
	)
		dis = true;
	if (
		!!sourceActorEffects &&
		_getEffects(_getConditionName('Prone'), sourceActorEffects)
	)
		dis = true;
	//Restrained condition
	if (
		!!sourceActorEffects &&
		_getEffects(_getConditionName('Restrained'), sourceActorEffects)
	)
		dis = true;
	if (
		!!singleTargetEffects &&
		_getEffects(_getConditionName('Restrained'), singleTargetEffects)
	)
		adv = true;
	//Stunned condition
	if (
		!!singleTargetEffects &&
		_getEffects(_getConditionName('Stunned'), singleTargetEffects)
	)
		adv = true;
	//Unconscious condition
	if (
		!!singleTargetEffects &&
		_getEffects(_getConditionName('Unconscious'), singleTargetEffects)
	)
		adv = true;
	//totals calc
	if (adv === true && dis === false) config.advantage = true;
	else if (adv === false && dis === true) config.disadvantage = true;
	else return true;
}

export function _preRollDamage(item, config) {
	let crit = false;
	const sourceActorEffects = item.actor.effects.filter((eff) => !eff.disabled);
	const sourceActorToken =
		item.actor.token?.object ?? item.actor.getActiveTokens()[0]; //
	let singleTargetEffects;
	const singleTargetActor = game.user.targets?.first()?.actor;
	const singleTargetToken = game.user.targets?.first();
	if (singleTargetActor)
		singleTargetEffects = singleTargetActor.effects.filter(
			(eff) => !eff.disabled
		);
	if (!sourceActorEffects.length && !singleTargetEffects?.length)
		return true;
	//to-do: Warning if more than one target selected.
	//Paralysed condition.
	if (
		!!singleTargetEffects &&
		_getEffects(
			['Paralysed', _getConditionName('Paralyzed')],
			singleTargetEffects
		) &&
		_getMinimumDistanceBetweenTokens(sourceActorToken, singleTargetToken) <= 5
	)
		crit = true;
	//Unconscious condition
	if (
		!!singleTargetEffects &&
		_getEffects(_getConditionName('Unconscious'), singleTargetEffects) &&
		_getMinimumDistanceBetweenTokens(sourceActorToken, singleTargetToken) <= 5
	)
		crit = true;
	//totals calc
	if (crit) config.critical = true;
	else return true;
}

export function _preRollDeathSave(actor, config) {
	let adv = false;
	let dis = false;
	const sourceActorEffects = actor.effects.filter((eff) => !eff.disabled);
	if (!sourceActorEffects.length) return true;
	//Exhaustion 3-5
	const exhaustion = [
		_getConditionName('Exhaustion') + ' 3',
		_getConditionName('Exhaustion') + ' 4',
		_getConditionName('Exhaustion') + ' 5',
	];
	if (!!sourceActorEffects && _getEffects(_getConditionName('Exhaustion'), sourceActorEffects))
		dis = true;
	//totals calc
	if (adv === true && dis === false) config.advantage = true;
	else if (adv === false && dis === true) config.disadvantage = true;
	else return true;
}
