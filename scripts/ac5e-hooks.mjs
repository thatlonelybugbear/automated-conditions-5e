import {
	_calcAdvantageMode,
	_getDistance,
	_hasAppliedEffects,
	_hasStatuses,
	_localize,
	_i18nConditions,
	_autoArmor,
	_autoEncumbrance,
	_autoRanged,
} from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

const getConfig = (config) => {
	return {
		advantage: config.advantage ? ['default'] : [],
		disadvantage: config.disadvantage ? ['default'] : [],
		fail: false,
		critical: config.critical
			? typeof config.critical === 'number'
				? []
				: [config.critical]
			: [], //to-do: check for lower crit ranges and check dnd5e.rollAttack hook for whether its a crit or not.
		/*type: undefined*/ //to-do: might be a need for that
	};
};

const targets = game.user.targets;
const targetsSize = targets?.size;
const singleTargetToken = targets?.first(); //to-do: refactor for dnd5e 3.x target in messageData; flags.dnd5e.targets[0].uuid Actor5e#uuid not entirely useful.
const singleTargetActor = singleTargetToken?.actor;

export function _preRollAbilitySave(actor, config, abilityId) {
	if (config.event?.altKey || config.event?.ctrlKey) return true; //bail out if someone presses keys for adv/dis ff roll. Need to get the keys from MidiQOL for integration
	//to-do: getSetting for event overriding any calcs or continue

	let change = false;
	const ac5eConfig = getConfig(config);
	if (!_hasAppliedEffects(actor) && !actor.statuses.has('exhaustion'))
		return true; //to-do: return any dis/advantage already present on the roll till that point for attribution.
	//Exhaustion 3-5, Restrained for dex
	let statuses = settings.autoExhaustion ? ['exhaustion3'] : [];
	if (abilityId === 'dex') statuses.push('restrained');
	if (!!_hasStatuses(actor, statuses)) {
		ac5eConfig.disadvantage = [
			...ac5eConfig.disadvantage,
			..._hasStatuses(actor, statuses),
		];
		change = true;
	}
	//Paralysed, Petrified, Stunned, Unconscious conditions, fail the save
	statuses = ['paralyzed', 'petrified', 'stunned', 'unconscious'];
	if (
		['dex', 'str'].includes(abilityId) &&
		_hasStatuses(actor, statuses).length
	) {
		ac5eConfig.fail = `<span style="display: block; text-align: left;">Fail (${abilityId}): ${_hasStatuses(
			actor,
			statuses
		)}</span>`; //to-do: clean that
		config.parts = config.parts.concat('-99');
		config.critical = 21; //make it not crit
		change = true;
	}
	//check Auto Armor
	if (
		settings.autoArmor &&
		['dex', 'str'].includes(abilityId) &&
		!_autoArmor(actor, 'prof')
	) {
		ac5eConfig.disadvantage = [
			...ac5eConfig.disadvantage,
			`${_localize('Armor')} (${_localize('NotProficient')})`,
		];
		change = true;
	}
	if (_autoEncumbrance(actor, abilityId)) {
		ac5eConfig.disadvantage = [
			...ac5eConfig.disadvantage,
			`${_i18nConditions('HeavilyEncumbered')}`,
		];
		change = true;
	}
	if (change)
		foundry.utils.setProperty(
			config,
			`dialogOptions.${Constants.MODULE_ID}`,
			ac5eConfig
		);

	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollSkill(actor, config, skillId) {
	if (config.event?.altKey || config.event?.ctrlKey) return true;
	let change = false;
	const ac5eConfig = getConfig(config);
	const { defaultAbility } = config.data;
	if (!_hasAppliedEffects(actor) && !actor.statuses.has('exhaustion'))
		return true;
	//Exhaustion 1-5, Frightened, Poisoned conditions
	let statuses = settings.autoExhaustion
		? ['exhaustion', 'frightened', 'poisoned']
		: ['frightened', 'poisoned'];
	if (_hasStatuses(actor, statuses).length) {
		ac5eConfig.disadvantage = [
			...ac5eConfig.disadvantage,
			..._hasStatuses(actor, statuses),
		];
		change = true;
	}
	//check Auto Armor
	if (settings.autoArmor) {
		if (['dex', 'str'].includes(defaultAbility) && !_autoArmor(actor, 'prof')) {
			ac5eConfig.disadvantage = [
				...ac5eConfig.disadvantage,
				`${_localize('Armor')} (${_localize('NotProficient')})`,
			];
			change = true;
		}
		if (skillId === 'ste' && _autoArmor(actor, 'stealth')) {
			ac5eConfig.disadvantage = [
				...ac5eConfig.disadvantage,
				`${_localize('Armor')} (${_localize('ItemEquipmentStealthDisav')})`,
			];
			change = true;
		}
	}
	if (_autoEncumbrance(actor, defaultAbility)) {
		ac5eConfig.disadvantage = [
			...ac5eConfig.disadvantage,
			`${_i18nConditions('HeavilyEncumbered')}`,
		];
		change = true;
	}
	if (change)
		foundry.utils.setProperty(
			config,
			`dialogOptions.${Constants.MODULE_ID}`,
			ac5eConfig
		);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollAbilityTest(actor, config, abilityId) {
	if (config.event?.altKey || config.event?.ctrlKey) return true;
	let change = false;
	const ac5eConfig = getConfig(config);
	if (!_hasAppliedEffects(actor) && !actor.statuses.has('exhaustion'))
		return true;
	//Exhaustion 1-5, Frightened, Poisoned conditions
	let statuses = settings.autoExhaustion
		? ['exhaustion', 'frightened', 'poisoned']
		: ['frightened', 'poisoned'];
	if (_hasStatuses(actor, statuses).length) {
		ac5eConfig.disadvantage = [
			...ac5eConfig.disadvantage,
			..._hasStatuses(actor, statuses),
		];
		change = true;
	}
	//check Auto Armor
	if (
		settings.autoArmor &&
		['dex', 'str'].includes(abilityId) &&
		!_autoArmor(actor, 'prof')
	) {
		ac5eConfig.disadvantage = [
			...ac5eConfig.disadvantage,
			`${_localize('Armor')} (${_localize('NotProficient')})`,
		];
		change = true;
	}
	if (_autoEncumbrance(actor, abilityId)) {
		ac5eConfig.disadvantage = [
			...ac5eConfig.disadvantage,
			`${_i18nConditions('HeavilyEncumbered')}`,
		];
		change = true;
	}
	if (change)
		foundry.utils.setProperty(
			config,
			`dialogOptions.${Constants.MODULE_ID}`,
			ac5eConfig
		);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollAttack(item, config) {
	const {
		actor: sourceActor,
		fastForward,
		messageData: {
			speaker: { token: sourceTokenID },
		},
	} = config;
	if (config.event?.altKey || config.event?.ctrlKey) return true;
	let change = false;
	const ac5eConfig = getConfig(config);
	ac5eConfig.advantage = { source: ac5eConfig.advantage };
	ac5eConfig.disadvantage = { source: ac5eConfig.disadvantage };
	ac5eConfig.advantage.target = [];
	ac5eConfig.disadvantage.target = [];
	const sourceToken = canvas.tokens.get(sourceTokenID); //Token5e
	if (targetsSize != 1) {
		//to-do: Think about more than one targets
		if (
			settings.needsTarget == 'force' &&
			!hasValidTargets(item, targetsSize, 'enforce')
		)
			return false;
		if (
			settings.needsTarget == 'none' &&
			!hasValidTargets(item, targetsSize, 'console')
		)
			return true;
	}

	if (
		!_hasAppliedEffects(sourceActor) &&
		!sourceActor.statuses.has('exhaustion') &&
		!_hasAppliedEffects(singleTargetActor)
	)
		return true;

	//on Source disadvantage - Blinded, Exhaustion 3-5, Frightened, Poisoned, Prone, Restrained
	let statuses = ['blinded', 'frightened', 'poisoned', 'prone', 'restrained'];
	if (settings.autoExhaustion) statuses = statuses.concat('exhaustion3');
	if (_hasStatuses(sourceActor, statuses).length) {
		ac5eConfig.disadvantage.source = ac5eConfig.disadvantage.source.concat(
			_hasStatuses(sourceActor, statuses)
		);
		change = true;
	}
	//on Source advantage - Invisible,
	//to-do: Test for target under the see invisibility spell.
	statuses = ['invisible'];
	if (_hasStatuses(sourceActor, statuses).length) {
		ac5eConfig.advantage.source = ac5eConfig.advantage.source.concat(
			_hasStatuses(sourceActor, statuses)
		);
		change = true;
	}
	if (targetsSize == 1) {
		//on Target disadvantage - Invisible
		//to-do: Test for Source under the see invisibility spell.
		if (_hasStatuses(singleTargetActor, statuses).length) {
			ac5eConfig.disadvantage.target = ac5eConfig.disadvantage.target.concat(
				_hasStatuses(singleTargetActor, statuses)
			);
			change = true;
		}
		//on Target advantage - Blinded, Paralyzed, Petrified, Restrained, Stunned, Unconscious
		statuses = [
			'blinded',
			'paralyzed',
			'petrified',
			'restrained',
			'stunned',
			'unconscious',
		];
		if (_hasStatuses(singleTargetActor, statuses).length) {
			ac5eConfig.advantage.target = ac5eConfig.advantage.target.concat(
				_hasStatuses(singleTargetActor, statuses)
			);
			change = true;
		}
		//on Target - Prone special case
		statuses = ['prone'];
		if (_hasStatuses(singleTargetActor, statuses).length) {
			const distance = _getDistance(sourceToken, singleTargetToken);
			if (distance <= 5) {
				//Attacking a prone character from up to 5ft away has advantage.
				ac5eConfig.advantage.target = ac5eConfig.advantage.target.concat(
					_hasStatuses(singleTargetActor, statuses)
						.concat(`(${distance}ft)`)
						.join(' ')
				);
				change = true;
			} else {
				//Attacking a prone character from more than 5ft away has disadvantage.
				ac5eConfig.disadvantage.target = ac5eConfig.disadvantage.target.concat(
					_hasStatuses(singleTargetActor, statuses)
						.concat(`(${distance}ft)`)
						.join(' ')
				);
				change = true;
			}
		}
		//check Auto Range
		if (settings.autoRanged && item.system.actionType?.includes('r')) {
			const { inRange, range, nearbyFoe } = _autoRanged(
				item,
				sourceToken,
				singleTargetToken
			);
			if (!inRange) {
				ac5eConfig.fail = `<span style="display: block; text-align: left;">Fail: Out of Range</span>`; //to-do: clean that
				config.parts = config.parts.concat('-99');
				config.critical = 21; //make it not crit
				change = true;
			}
			if (range === 'long') {
				ac5eConfig.disadvantage.source = ac5eConfig.disadvantage.source.concat(
					_localize('RangeLong')
				);
				change = true;
			}
			if (nearbyFoe) {
				ac5eConfig.disadvantage.source =
					ac5eConfig.disadvantage.source.concat('Nearby Foe');
				change = true;
			}
		}
	}

	//check Auto Armor
	if (
		settings.autoArmor &&
		['dex', 'str'].includes(item.abilityMod) &&
		!_autoArmor(sourceActor, 'prof')
	) {
		ac5eConfig.disadvantage.source = ac5eConfig.disadvantage.source.concat(
			`${_localize('Armor')} (${_localize('NotProficient')})`
		);
		change = true;
	}
	if (_autoEncumbrance(sourceActor, item.abilityMod)) {
		ac5eConfig.disadvantage.source = ac5eConfig.disadvantage.source.concat(
			`${_i18nConditions('HeavilyEncumbered')}`
		);
		change = true;
	}
	if (change || ac5eConfig.critical.length)
		foundry.utils.setProperty(
			config,
			`dialogOptions.${Constants.MODULE_ID}`,
			ac5eConfig
		);
	return _calcAdvantageMode(ac5eConfig, config);
}

/*to-do: Implement a way for an attack which crits to affect the next damage roll to be crit.
export function _rollAttack(item, roll) {
	const getConfigAC5E = foundry.utils.getProperty(roll.options, '${Constants.MODULE_ID}');
	if (!getConfigAC5E) return true;
	if (roll.isCritical) getConfigAC5E.critical = 'isCritical';
	else getConfigAC5E.critical = 'notCritical';
	return true;
}
*/

export function _preRollDamage(item, config) {
	const {
		actor: sourceActor,
		critical,
		messageData: {
			speaker: { token: sourceTokenID },
		},
	} = config;
	if (config.event?.altKey || critical) return true;
	let change = false;
	const ac5eConfig = getConfig(config);
	const sourceToken = canvas.tokens.get(sourceTokenID);
	if (targetsSize != 1) {
		//to-do: Think about more than one targets
		if (
			settings.needsTarget == 'force' &&
			!hasValidTargets(item, targetsSize, 'enforce')
		)
			return false;
		if (
			settings.needsTarget == 'none' &&
			!hasValidTargets(item, targetsSize, 'console')
		)
			return true;
	}
	if (
		!_hasAppliedEffects(sourceActor) &&
		!_hasAppliedEffects(singleTargetActor)
	)
		return true;

	//on Target advantage - Paralysed, Unconscious conditions.
	let statuses = ['paralyzed', 'unconscious'];
	if (
		_hasStatuses(singleTargetActor, statuses).length &&
		_getDistance(sourceToken, singleTargetToken) <= 5
	) {
		ac5eConfig.critical = ac5eConfig.critical
			? ac5eConfig.critical.concat(_hasStatuses(singleTargetActor, statuses))
			: _hasStatuses(singleTargetActor, statuses);
		change = true;
	}
	if (change) {
		foundry.utils.setProperty(
			config,
			`dialogOptions.${Constants.MODULE_ID}`,
			ac5eConfig
		);
		config.critical = true;
	} else return true;
}

export function _preRollDeathSave(actor, config) {
	if (config.event?.altKey || config.event?.ctrlKey) return true;
	let change = false;
	const ac5eConfig = getConfig(config);
	if (
		!_hasAppliedEffects(actor) &&
		!actor.statuses.has('exhaustion') &&
		!settings.autoExhaustion
	)
		return true;
	//Exhaustion 3-5
	let statuses = ['exhaustion3'];
	if (_hasStatuses(actor, statuses).length) {
		ac5eConfig.disadvantage = ac5eConfig.disadvantage?.length
			? ac5eConfig.disadvantage.concat(_hasStatuses(actor, statuses))
			: _hasStatuses(actor, statuses);
		change = true;
	}
	if (change)
		foundry.utils.setProperty(
			config,
			`dialogOptions.${Constants.MODULE_ID}`,
			ac5eConfig
		);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _renderDialog(dialog, elem) {
	if (!settings.dialogTooltips) return true;
	const getConfigAC5E = foundry.utils.getProperty(
		dialog?.options,
		Constants.MODULE_ID
	);
	/*
	//to-do: might be needed for adding proper handling of attack rolls based critical damage addition
	const closeButton = elem[0].querySelector(`.header-button.control.close`);
	closeButton.addEventListener('click', ()=>console.log('Closed'));
	 */

	if (!getConfigAC5E) return true;
	const getHighlightedButton = elem[0].querySelector(
		`.dialog-button.${dialog.data.default}`
	);
	//to-do: clean this mess up
	let tooltip = '<center><strong>Automated Conditions 5e</strong></center>';
	if (getConfigAC5E.critical.length)
		tooltip = tooltip.concat(
			`<br><span style="display: block; text-align: left;">${_localize(
				'Critical'
			)}: ${getConfigAC5E.critical.join(', ')}</span>`
		);
	if (getConfigAC5E.advantage?.length)
		tooltip = tooltip.concat(
			`<br><span style="display: block; text-align: left;">${_localize(
				'Advantage'
			)}: ${getConfigAC5E.advantage.join(', ')}</span>`
		);
	if (getConfigAC5E.disadvantage?.length)
		tooltip = tooltip.concat(
			`<br><span style="display: block; text-align: left;">${_localize(
				'Disadvantage'
			)}: ${getConfigAC5E.disadvantage.join(', ')}</span>`
		);
	if (getConfigAC5E.fail) tooltip = tooltip.concat(`<br>${getConfigAC5E.fail}`);
	if (getConfigAC5E.advantage?.source?.length)
		tooltip = tooltip.concat(
			`<br><span style="display: block; text-align: left;">Attacker ${_localize(
				'Advantage'
			)
				.substring(0, 3)
				.toLocaleLowerCase()}: ${getConfigAC5E.advantage.source.join(
				', '
			)}</span>`
		);
	if (getConfigAC5E.advantage?.target?.length)
		tooltip = tooltip.concat(
			`<br><span style="display: block; text-align: left;">${_localize(
				'Target'
			)} grants ${_localize('Advantage')
				.substring(0, 3)
				.toLocaleLowerCase()}: ${getConfigAC5E.advantage.target.join(
				', '
			)}</span>`
		);
	if (getConfigAC5E.disadvantage?.source?.length)
		tooltip = tooltip.concat(
			`<br><span style="display: block; text-align: left;">Attacker ${_localize(
				'Disadvantage'
			)
				.substring(0, 3)
				.toLocaleLowerCase()}: ${getConfigAC5E.disadvantage.source.join(
				', '
			)}</span>`
		);
	if (getConfigAC5E.disadvantage?.target?.length)
		tooltip = tooltip.concat(
			`<br><span style="display: block; text-align: left;">${_localize(
				'Target'
			)} grants ${_localize('Disadvantage')
				.substring(0, 3)
				.toLocaleLowerCase()}: ${getConfigAC5E.disadvantage.target.join(
				', '
			)}</span>`
		);
	if (tooltip === '<center><strong>Automated Conditions 5e</strong></center>')
		return true;
	getHighlightedButton.setAttribute('data-tooltip', tooltip);
}

export function _preUseItem(item) /*, config, options)*/ {
	//will cancel the Item use if the Item needs 1 target to function properly and none or more than 1 are selected.
	if (settings.needsTarget == 'force')
		return hasValidTargets(item, targetsSize, 'enforce');
}

function hasValidTargets(item, size, warn = false) {
	//will return true if the Item has an attack roll and targets are correctly set and selected, or false otherwise.
	//for when settings.needsTarget == 'force'
	if (
		item.hasAttack &&
		(item.hasIndividualTarget ||
			(!item.hasIndividualTarget && !item.hasTarget)) &&
		size != 1
	) {
		sizeWarnings(size, warn);
		return false;
	} else return true;
}

function sizeWarnings(size, warn = false) {
	const stringToDisplay = size
		? _localize('AC5E.MultipleTargetsAttackWarn')
		: _localize('AC5E.NoTargetsAttackWarn');
	if (['console', 'enforce'].includes(warn)) console.warn(stringToDisplay);
	if (warn == 'enforce') ui.notifications.warn(stringToDisplay);
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
