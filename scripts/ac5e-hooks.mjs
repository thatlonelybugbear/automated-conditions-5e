import { 
	_calcAdvantageMode,
	_getMinimumDistanceBetweenTokens,
	_hasAppliedEffects,
	_hasStatuses,
	_i18n5e,
	_findNearby,
	_dispositionCheck
} from './ac5e-helpers.mjs';

const getConfig = (config) => {
	return {
		advantage: config.advantage ? ['default'] : false,
		disadvantage: config.disadvantage ? ['default'] : false,
		fail: false,
		critical: config.critical ? (typeof config.critical === 'number' ? [] : [config.critical]) : [], //to-do: check for lower crit ranges and check dnd5e.rollAttack hook for whether its a crit or not.
		/*type: undefined*/ //to-do: might be a need for that
	};
}

export function _preRollAbilitySave(actor, config, abilityId) {
	if (config.event?.altKey || config.event?.ctrlKey) return true;  //bail out if someone presses keys for adv/dis ff roll. Need to get the keys from MidiQOL for integration
	//to-do: getSetting for event overriding any calcs or continue
	
	let change = false;
	const ac5eConfig = getConfig(config);
	if (!_hasAppliedEffects(actor) && !actor.statuses.has('exhaustion'))
		return true; //to-do: return any dis/advantage already present on the roll till that point for attribution.
	//Exhaustion 3-5, Restrained for dex
	let statuses = ['exhaustion3'];
	if (abilityId === 'dex') statuses.push('restrained');
	if (!!_hasStatuses(actor, statuses)) {
		ac5eConfig.disadvantage = ac5eConfig.disadvantage?.length ? ac5eConfig.disadvantage.concat(_hasStatuses(actor, statuses)) : _hasStatuses(actor, statuses);
		change = true;
	}
    //Paralysed, Petrified, Stunned, Unconscious conditions, fail the save
	statuses = ['paralyzed', 'petrified', 'stunned', 'unconscious'];
	if (['dex', 'str'].includes(abilityId) && _hasStatuses(actor, statuses).length) {
		ac5eConfig.fail = `<span style="display: block; text-align: left;">Fail (${abilityId}): ${(_hasStatuses(actor, statuses))}</span>`; //to-do: clean that
		config.parts = config.parts.concat('-99');
		config.critical = 21; //make it not crit
		change = true;
	}
	if (change)
		foundry.utils.setProperty(config, `dialogOptions.automated-conditions-5e`, ac5eConfig);

	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollSkill(actor, config, abilityId) {
	if (config.event?.altKey || config.event?.ctrlKey) return true;
	let change = false;
	const ac5eConfig = getConfig(config);
	if (!_hasAppliedEffects(actor) && !actor.statuses.has('exhaustion')) return true;
    //Exhaustion 1-5, Frightened, Poisoned conditions
	let statuses = ['exhaustion', 'frightened', 'poisoned'];
	if (_hasStatuses(actor, statuses).length) {
		ac5eConfig.disadvantage = ac5eConfig.disadvantage?.length ? ac5eConfig.disadvantage.concat(_hasStatuses(actor, statuses)) : _hasStatuses(actor, statuses);
		change = true;
	}
	if (change)
		foundry.utils.setProperty(config, `dialogOptions.automated-conditions-5e`, ac5eConfig);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollAbilityTest(actor, config, abilityId) {
	if(config.event?.altKey || config.event?.ctrlKey) return true;
	let change = false;
	const ac5eConfig = getConfig(config);
	if (!_hasAppliedEffects(actor) && !actor.statuses.has('exhaustion')) return true;
    //Exhaustion 1-5, Frightened, Poisoned conditions
	let statuses = ['exhaustion', 'frightened', 'poisoned'];
	if (_hasStatuses(actor, statuses).length) {
		ac5eConfig.disadvantage = ac5eConfig.disadvantage?.length ? ac5eConfig.disadvantage.concat(_hasStatuses(actor, statuses)) : _hasStatuses(actor, statuses);
		change = true;
	}
	if (change)
		foundry.utils.setProperty(config, `dialogOptions.automated-conditions-5e`, ac5eConfig);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollAttack(item, config) {
	const { actor: sourceActor, fastForward, messageData: {speaker: {token: sourceTokenID}} } = config;
	if (config.event?.altKey || config.event?.ctrlKey) return true;
	let change = false;
	const ac5eConfig = getConfig(config);
	ac5eConfig.advantage = ac5eConfig.advantage ? {source: ['default']} : {source: []};
	ac5eConfig.disadvantage = ac5eConfig.disadvantage ? {source: ['default']} : {source: []};
	ac5eConfig.advantage.target = [];
	ac5eConfig.disadvantage.target = [];
	const sourceToken = canvas.tokens.get(sourceTokenID); //Token5e
	const singleTargetActor = game.user.targets?.first()?.actor; //to-do: refactor for dnd5e 3.x target in messageData; flags.dnd5e.targets[0].uuid Actor5e#uuid not entirely useful.
	const singleTargetToken = game.user.targets?.first();
	if (!_hasAppliedEffects(sourceActor) && !sourceActor.statuses.has('exhaustion') && !_hasAppliedEffects(singleTargetActor)) return true;
	//to-do: Warning if more than one target selected. Think about more than one targets
	if (game.user.targets.size > 1) {
		ui.notifications.warn(
			'Automated Conditions 5e: You are attacking multiple targets and that is not supported. The Roll results can be skewed.'
		);
		console.warn('Automated Conditions 5e: You are attacking multiple targets and that is not supported. The Roll results can be skewed.');
	}
		

	//on Source disadvantage - Blinded, Exhaustion 3-5, Frightened, Poisoned, Prone, Restrained
	let statuses = ['blinded', 'exhaustion3', 'poisoned', 'prone', 'restrained'];
	if (_hasStatuses(sourceActor, statuses).length) {
		ac5eConfig.disadvantage.source = ac5eConfig.disadvantage.source.concat(_hasStatuses(sourceActor, statuses));
		change = true;
	}
	//on Source advantage - Invisible,
	//to-do: Test for target under the see invisibility spell.
	statuses = ['invisible'];
	if (_hasStatuses(sourceActor, statuses).length) {
		ac5eConfig.advantage.source = ac5eConfig.advantage.source.concat(_hasStatuses(sourceActor, statuses));
		change = true;
	}
	//on Target disadvantage - Invisible
	//to-do: Test for Source under the see invisibility spell.
	if (_hasStatuses(singleTargetActor, statuses).length) {
		ac5eConfig.disadvantage.target = ac5eConfig.disadvantage.target.concat(_hasStatuses(singleTargetActor, statuses));
		change = true;
	}
	//on Target advantage - Blinded, Paralysed, Paralyzed, Petrified, Restrained, Stunned, Unconscious
	statuses = ['blinded', 'paralyzed', 'petrified', 'restrained', 'stunned', 'unconscious'];
	if (_hasStatuses(singleTargetActor, statuses).length) {
		ac5eConfig.advantage.target = ac5eConfig.advantage.target.concat(_hasStatuses(singleTargetActor, statuses));
		change = true;
	}
	//on Target - Prone special case
	statuses = ['prone'];
	if (_hasStatuses(singleTargetActor, statuses).length) {
		if (['rwak', 'rsak'].includes(item.system.actionType)) {
			ac5eConfig.disadvantage.target = ac5eConfig.disadvantage.target.concat(_hasStatuses(singleTargetActor, statuses).concat('(ranged)').join(' '));
			change = true;
		}
		if (_getMinimumDistanceBetweenTokens(sourceToken, singleTargetToken) <= 5) {
			ac5eConfig.advantage.target = ac5eConfig.advantage.target.concat(_hasStatuses(singleTargetActor, statuses).concat('(<=5ft)').join(' '));
			change = true;
		} else if (_getMinimumDistanceBetweenTokens(sourceToken, singleTargetToken) >= 5 && ['mwak', 'msak'].includes(item.system.actionType)) {
			ac5eConfig.disadvantage.target = ac5eConfig.disadvantage.target.concat(_hasStatuses(singleTargetActor, statuses).concat('(>5ft)').join(' '));
			change = true;
		}
	}
	/*ac5eConfig.type = 'isAttack';*/
	if (change || ac5eConfig.critical.length)
		foundry.utils.setProperty(config, `dialogOptions.automated-conditions-5e`, ac5eConfig);
	return _calcAdvantageMode(ac5eConfig, config);
}

/*to-do: Implement a way for an attack which crits to affect the next damage roll to be crit.
export function _rollAttack(item, roll) {
	const getConfigAC5E = foundry.utils.getProperty(roll.options, 'automated-conditions-5e');
	if (!getConfigAC5E) return true;
	if (roll.isCritical) getConfigAC5E.critical = 'isCritical';
	else getConfigAC5E.critical = 'notCritical';
	return true;
}
*/

export function _preRollDamage(item, config) {
	const { actor: sourceActor, critical, messageData: { speaker: { token: sourceTokenID } } } = config;
	if (config.event?.altKey || critical) return true;
	let change = false;
	const ac5eConfig = getConfig(config);
	const sourceToken = canvas.tokens.get(sourceTokenID);
	const singleTargetActor = game.user.targets?.first()?.actor; //to-do: refactor for dnd5e 3.x grabbing the messageData, although not particularly helpful.
	const singleTargetToken = game.user.targets?.first();
	if (!_hasAppliedEffects(sourceActor) && !_hasAppliedEffects(singleTargetActor)) return true;
	if (game.user.targets.size > 1)
		ui.notifications.warn('Automated Conditions 5e: You are attacking multiple targets and that is not supported. The Roll results can be skewed.');
	
	//on Target advantage - Paralysed, Unconscious conditions.
	let statuses = ['paralyzed', 'unconscious'];
	if (_hasStatuses(singleTargetActor, statuses).length && _getMinimumDistanceBetweenTokens(sourceToken, singleTargetToken) <= 5) {
        ac5eConfig.critical = ac5eConfig.critical ? ac5eConfig.critical.concat(_hasStatuses(singleTargetActor, statuses)) : _hasStatuses(singleTargetActor, statuses);
		change = true;
	}
	if (change) {
		foundry.utils.setProperty(config, `dialogOptions.automated-conditions-5e`, ac5eConfig);
		config.critical = true;
	}
	else return true;
}

export function _preRollDeathSave(actor, config) {
	if (config.event?.altKey || config.event?.ctrlKey) return true;
	let change = false;
	const ac5eConfig = getConfig(config);
	if (!_hasAppliedEffects(actor) && !actor.statuses.has('exhaustion')) return true;
	//Exhaustion 3-5
	let statuses = ['exhaustion3'];
	if (_hasStatuses(actor, statuses).length) {
		ac5eConfig.disadvantage = ac5eConfig.disadvantage?.length ? ac5eConfig.disadvantage.concat(_hasStatuses(actor, statuses)) : _hasStatuses(actor, statuses);
		change = true;
	}
	if (change)
		foundry.utils.setProperty(config, `dialogOptions.automated-conditions-5e`, ac5eConfig);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _renderDialog(dialog, elem) {
	const getConfigAC5E = foundry.utils.getProperty(dialog?.options, 'automated-conditions-5e');
	/*
	//to-do: might be needed for adding proper handling of attack rolls based critical damage addition
	const closeButton = elem[0].querySelector(`.header-button.control.close`);
	closeButton.addEventListener('click', ()=>console.log('Closed'));
	 */
	
	if (!getConfigAC5E) return true;
	const getHighlightedButton = elem[0].querySelector(`.dialog-button.${dialog.data.default}`);
	//to-do: clean this mess up
	let tooltip = '<center><strong>Automated Conditions 5e</strong></center>';
	if (getConfigAC5E.critical.length) tooltip = tooltip.concat(`<br><span style="display: block; text-align: left;">${_i18n5e('Critical')}: ${getConfigAC5E.critical.join(', ')}</span>`);
	if (getConfigAC5E.advantage?.length) tooltip = tooltip.concat(`<br><span style="display: block; text-align: left;">${_i18n5e('Advantage')}: ${getConfigAC5E.advantage.join(', ')}</span>`);
	if (getConfigAC5E.disadvantage?.length) tooltip = tooltip.concat(`<br><span style="display: block; text-align: left;">${_i18n5e('Disadvantage')}: ${getConfigAC5E.disadvantage.join(', ')}</span>`);
	if (getConfigAC5E.fail) tooltip = tooltip.concat(`<br>${getConfigAC5E.fail}`);
	if (getConfigAC5E.advantage?.source?.length) tooltip = tooltip.concat(`<br><span style="display: block; text-align: left;">Attacker ${_i18n5e('Advantage').substring(0,3).toLocaleLowerCase()}: ${getConfigAC5E.advantage.source.join(', ')}</span>`);
	if (getConfigAC5E.advantage?.target?.length) tooltip = tooltip.concat(`<br><span style="display: block; text-align: left;">${_i18n5e('Target')} grants ${_i18n5e('Advantage').substring(0,3).toLocaleLowerCase()}: ${getConfigAC5E.advantage.target.join(', ')}</span>`);
	if (getConfigAC5E.disadvantage?.source?.length) tooltip = tooltip.concat(`<br><span style="display: block; text-align: left;">Attacker ${_i18n5e('Disadvantage').substring(0,3).toLocaleLowerCase()}: ${getConfigAC5E.disadvantage.source.join(', ')}</span>`);
	if (getConfigAC5E.disadvantage?.target?.length) tooltip = tooltip.concat(`<br><span style="display: block; text-align: left;">${_i18n5e('Target')} grants ${_i18n5e('Disadvantage').substring(0,3).toLocaleLowerCase()}: ${getConfigAC5E.disadvantage.target.join(', ')}</span>`);
	if (tooltip === '<center><strong>Automated Conditions 5e</strong></center>') return true;
	getHighlightedButton.setAttribute('data-tooltip', tooltip);
}

/*
Blinded: < Disadvantage on attacks and grants Advantage to attacks from others >
Exhaustion 1: <Disadvantage on ability checks (and skill checks as a result)>
Exhaustion 2: <==>
Exhaustion 3: <++ Disadvantage on attacks and saving throws>
Exhaustion 4: <==>
Exhaustion 5: <==>
Frightened: <Disadvantage on ability checks and attack rolls; v10.0.3 will be testing for Visibility of origin if available to add this or not>
Invisible: < Advantage on attacks and grants Disadvantage to attacks by others >
Paralyzed (or Paralysed): <Auto fail (-99) strength/dexterity saves and attacker within 5ft of the creature deals critical damage>
Petrified: <Grants Advantage on attacks by others, auto fail strength/dexterity saves>
Poisoned: < Disadvantage on attacks and ability checks >
Prone: <Disadvantage on attacks, grants advantage on attacks by others if within 5ft, otherwise grants disdvantage>
Restrained: <Disadvantage on attacks and dexterity saves, grants advantage on attacks by others>
Stunned: <Auto fail strength/dexterity saves, grants advantage on attacks by others>
Unconscious: <Auto fails strength/dexterity saves, grants advantage on attacks by others, crit if hit within 5ft ++ Prone>
*/
