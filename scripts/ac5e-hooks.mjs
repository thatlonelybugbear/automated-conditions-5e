import {
	_calcAdvantageMode,
	_getDistance,
	_hasAppliedEffects,
	_hasItem,
	_hasStatuses,
	_localize,
	_i18nConditions,
	_autoArmor,
	_autoEncumbrance,
	_autoRanged,
	_getTooltip,
	_getConfig,
	_setAC5eProperties,
} from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
import { ac5eStatusChecks, ac5eSettingsChecks } from './ac5e-setPieces.mjs';

const settings = new Settings();

function getMessageData(config) {
	//console.error(config)
	const messageId = config.event?.target?.closest?.('[data-message-id]')?.dataset?.messageId;
	const message = messageId ? game.messages.get(messageId) : false;
	const useFlags = message ? message.flags?.dnd5e?.use : {};
	const item = useFlags ? fromUuidSync(useFlags.itemUuid) : undefined;
	const { scene: sceneId, actor: actorId, token: tokenId, alias: tokenName } = message.speaker || {};
	const attackingActor = item?.parent ?? game.actors.get(actorId);
	console.warn('AC5E getMessageData', messageId, useFlags, item, attackingActor, tokenId)
	return {
		messageId, useFlags, item, attackingActor, attackingToken: canvas.tokens.get(tokenId)
	}
}

export function _preRollAbilitySave(actor, config, abilityId) {
	const { messageId, useFlags, item, attackingActor } = getMessageData(config);
	console.error(item, attackingActor, useFlags);
	if (settings.debug) console.warn('ac5e preRollAbilitySave:', config, abilityId);
	const sourceTokenID = config.messageData?.speaker?.token;
	if (config.isConcentration) return true; //concentration handling in the _preRollConcentration.
	let change = false;
	const ac5eConfig = _getConfig(config, 'ability', sourceTokenID, useFlags);
	if (ac5eConfig.preAC5eConfig && (ac5eConfig.preAC5eConfig.advKey || ac5eConfig.preAC5eConfig.disKey)) {
		_setAC5eProperties(ac5eConfig, config);
		return _calcAdvantageMode(ac5eConfig, config);
	}
	const hook = /*config.isConcentration ? 'conc' : */'save';
	change = ac5eStatusChecks({ actor, token: canvas.tokens.get(sourceTokenID), hook, actorType: 'source', abilityId, statuses: [...actor.statuses], ac5eConfig });
	change = ac5eSettingsChecks({actor, token: canvas.tokens.get(sourceTokenID), hook, actorType: 'source', ac5eConfig }) ?? change;
	if (change) _setAC5eProperties(ac5eConfig, config);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollSkill(actor, config, skillId) {
	const hook = 'skill';
	let change = false;
	const sourceTokenID = config.messageData?.speaker?.token;
	const ac5eConfig = _getConfig(config, hook, sourceTokenID);
	if (
		ac5eConfig.preAC5eConfig &&
		(ac5eConfig.preAC5eConfig.advKey || ac5eConfig.preAC5eConfig.disKey)
	) {
		_setAC5eProperties(ac5eConfig, config);
		return _calcAdvantageMode(ac5eConfig, config);
	}
	const { defaultAbility } = config.data;
	change = ac5eStatusChecks({ actor, token: canvas.tokens.get(sourceTokenID), hook, actorType: 'source', statuses: [...actor.statuses], ac5eConfig, abilityId: defaultAbility });
	change = ac5eSettingsChecks({actor, token: canvas.tokens.get(sourceTokenID), hook, actorType: 'source', ac5eConfig }) ?? change;
	if (change) _setAC5eProperties(ac5eConfig, config);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollAbilityTest(actor, config, abilityId) {
	const hook = 'test';
	let change = false;
	const sourceTokenID = config.messageData?.speaker?.token;
	const ac5eConfig = _getConfig(config, hook, sourceTokenID);
	if (
		ac5eConfig.preAC5eConfig &&
		(ac5eConfig.preAC5eConfig.advKey || ac5eConfig.preAC5eConfig.disKey)
	) {
		_setAC5eProperties(ac5eConfig, config);
		return _calcAdvantageMode(ac5eConfig, config);
	}
	change = ac5eStatusChecks({ actor, token: canvas.tokens.get(sourceTokenID), hook, actorType: 'source', abilityId, statuses: [...actor.statuses], ac5eConfig });
	change = ac5eSettingsChecks({actor, token: canvas.tokens.get(sourceTokenID), hook, actorType: 'source', ac5eConfig }) ?? change;
	if (change) _setAC5eProperties(ac5eConfig, config);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollDeathSave(actor, config) {
	const hook = 'death';
	let change = false;
	const sourceTokenID = config.messageData?.speaker?.token;
	const ac5eConfig = _getConfig(config, hook, sourceTokenID);
	if (
		ac5eConfig.preAC5eConfig &&
		(ac5eConfig.preAC5eConfig.advKey || ac5eConfig.preAC5eConfig.disKey)
	) {
		_setAC5eProperties(ac5eConfig, config);
		return _calcAdvantageMode(ac5eConfig, config);
	}
	change = ac5eStatusChecks({ actor, token: canvas.tokens.get(sourceTokenID), hook, actorType: 'source', abilityId, statuses: [...actor.statuses], ac5eConfig });
	if (change) _setAC5eProperties(ac5eConfig, config);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollConcentration(actor, config) {
	const hook = 'conc';
	let change = false;
	const sourceTokenID = config.messageData?.speaker?.token;
	const ac5eConfig = _getConfig(config, hook, sourceTokenID);
	console.log(ac5eConfig.preAC5eConfig)
	if (
		ac5eConfig.preAC5eConfig &&
		(ac5eConfig.preAC5eConfig.advKey || ac5eConfig.preAC5eConfig.disKey)
	) {
		_setAC5eProperties(ac5eConfig, config);
		return _calcAdvantageMode(ac5eConfig, config);
	}
	console.log('here')
	//Exhaustion 3-5
	
	change = ac5eStatusChecks({ actor, token: canvas.tokens.get(sourceTokenID), hook, actorType: 'source', abilityId: 'con', statuses: [...actor.statuses], ac5eConfig });
	change = change && ac5eSettingsChecks({actor, token: canvas.tokens.get(sourceTokenID), hook, actorType: 'source', ac5eConfig });				   
	let itemName = 'AC5E.WarCaster';
	if (_hasItem(actor, itemName)) {
		ac5eConfig.source.advantage.push(_localize(itemName));
		change = true;
	}
	if (change) _setAC5eProperties(ac5eConfig, config);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preUseItem(item, config, options) {
	const { messageId, useFlags, item: itemD, attackingActor, attackingToken } = getMessageData(config);
	console.warn({'AC5E messageData': getMessageData(config), config, sourceActor: item.actor})
	const sourceActor = item.actor;
	if (!sourceActor) return;
	if (
		item.type == 'spell' &&
		settings.autoArmorSpellUse != 'off' &&
		_autoArmor(sourceActor).notProficient
	) {
		if (settings.autoArmorSpellUse == 'warn')
			ui.notifications.warn(
				`${sourceActor.name} ${_localize(
					'AC5E.AutoArmorSpellUseChoicesWarnToast'
				)}`
			);
		else if (settings.autoArmorSpellUse == 'enforce') {
			ui.notifications.warn(
				`${sourceActor.name} ${_localize(
					'AC5E.AutoArmorSpellUseChoicesEnforceToast'
				)}`
			);
			return false;
		}
	}
	if (!item.hasAttack && !item.hasDamage) return true;
	//will cancel the Item use if the Item needs 1 target to function properly and none or more than 1 are selected.
	const targets = game.user?.targets;
	const targetsSize = targets?.size;
	//to-do: add an override for 'force' and a keypress, so that one could "target" unseen tokens. Default to source then probably?
	if (
		settings.needsTarget == 'force' &&
		!hasValidTargets(item, targetsSize, 'pre', 'enforce')
	)
		return false;
	const sourceToken =
		item.actor.token?.object ?? item.actor.getActiveTokens()[0];
	const singleTargetToken = targets?.first(); //to-do: refactor for dnd5e 3.x target in messageData; flags.dnd5e.targets[0].uuid Actor5e#uuid not entirely useful.
	const singleTargetActor = singleTargetToken?.actor;
	if (settings.needsTarget == 'none') return true;
	let change = false;
	const ac5eConfig = _getConfig(
		options,
		'item',
		sourceToken.id,
		singleTargetToken?.id
	);
	if (
		ac5eConfig.preAC5eConfig &&
		(ac5eConfig.preAC5eConfig.advKey || ac5eConfig.preAC5eConfig.disKey)
	) {
		foundry.utils.setProperty(
			options,
			`flags.${Constants.MODULE_ID}`,
			ac5eConfig
		);
		return true;
	}
/*	ac5eConfig.souadvantage = { source: ac5eConfig.advantage };
	ac5eConfig.disadvantage = { source: ac5eConfig.disadvantage };
	ac5eConfig.advantage.target = [];
	ac5eConfig.disadvantage.target = [];
*/
	//on Source disadvantage - Blinded, Exhaustion 3-5, Frightened, Poisoned, Prone, Restrained
	let statuses = ['blinded', 'frightened', 'poisoned', 'prone', 'restrained'];
	if (settings.autoExhaustion) statuses = statuses.concat('exhaustion3');
	if (_hasStatuses(sourceActor, statuses).length) {
		ac5eConfig.source.disadvantage = ac5eConfig.source.disadvantage.concat(
			_hasStatuses(sourceActor, statuses)
		);
		change = true;
	}
	//on Source advantage - Invisible or Hiding (hidden needs expanded conditions setting on),
	//to-do: Test for target under the see invisibility spell.
	statuses = ['invisible'];
	if (settings.expandedConditions) statuses.push('hiding');
	if (_hasStatuses(sourceActor, statuses).length) {
		ac5eConfig.source.advantage = ac5eConfig.source.advantage.concat(
			_hasStatuses(sourceActor, statuses)
		);
		change = true;
	}
	//Nearby Foe
	if (
		settings.autoRanged &&
		['rwak', 'rsak'].includes(item.system.actionType)
	) {
		const { nearbyFoe } = _autoRanged(item, sourceToken);
		if (nearbyFoe) {
			ac5eConfig.source.disadvantage =
				ac5eConfig.source.disadvantage.concat('Nearby Foe');
			change = true;
		}
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
		//on Target disadvantage - Dodging when target is not Incapacitated or restrained and source is not Hidden
		statuses = ['dodging'];
		if (
			settings.expandedConditions &&
			!_hasStatuses(sourceActor, ['hiding']).length &&
			!_hasStatuses(singleTargetActor, ['incapacitated', 'restrained'])
				.length &&
			_hasStatuses(singleTargetActor, statuses).length
		) {
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
		if (
			settings.autoRanged &&
			['rwak', 'rsak'].includes(item.system.actionType)
		) {
			const { inRange, range } = _autoRanged(
				item,
				sourceToken,
				singleTargetToken
			);
			if (!inRange) {
				ac5eConfig.source.fail.push(_localize('AC5E.OutOfRange')); //to-do: clean that
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
		}
	}
	//check Auto Armor
	if (
		settings.autoArmor &&
		['dex', 'str'].includes(item.abilityMod) &&
		_autoArmor(sourceActor).notProficient
	) {
		ac5eConfig.disadvantage.source = ac5eConfig.disadvantage.source.concat(
			`${_localize(_autoArmor(sourceActor).notProficient)} (${_localize('NotProficient')})`
		);
		change = true;
	}
	if (_autoEncumbrance(sourceActor, item.abilityMod)) {
		ac5eConfig.disadvantage.source = ac5eConfig.disadvantage.source.concat(
			_i18nConditions('HeavilyEncumbered')
		);
		change = true;
	}

	//on Target advantage - Paralysed, Unconscious conditions.
	statuses = ['paralyzed', 'unconscious'];
	if (
		!item.isHealing &&
		_hasStatuses(singleTargetActor, statuses).length &&
		_getDistance(sourceToken, singleTargetToken) <= 5
	) {
		ac5eConfig.critical = ac5eConfig.critical
			? ac5eConfig.critical.concat(_hasStatuses(singleTargetActor, statuses))
			: _hasStatuses(singleTargetActor, statuses);
		change = true;
	}
	if (change || ac5eConfig.critical.length)
		_setAC5eProperties(ac5eConfig, options);
	if (change || ac5eConfig.critical.length)
		foundry.utils.mergeObject(options, {
			flags: { 'automated-conditions-5e': ac5eConfig },
		});
	return true;
}

export function _preRollAttack(item, config) {
	const hook = 'attack';
	const { messageId, useFlags, item: itemD, attackingActor, attackingToken } = getMessageData(config);
	console.warn({'AC5E messageData': getMessageData(config), config, sourceActor: item.actor})
	const {
		actor: sourceActor,
		fastForward,
		messageData: {
			speaker: { token: sourceTokenID },
		},
	} = config;
	let change = false;
	const sourceToken = canvas.tokens.get(sourceTokenID); //Token5e
	const targets = game.user?.targets;
	const targetsSize = targets?.size;
	const singleTargetToken = targets?.first(); //to-do: refactor for dnd5e 3.x target in messageData; flags.dnd5e.targets[0].uuid Actor5e#uuid not entirely useful.
	const singleTargetActor = singleTargetToken?.actor;
	const ac5eConfig = _getConfig(
		config,
		hook,
		sourceTokenID,
		singleTargetToken?.id
	);
	if (
		ac5eConfig.preAC5eConfig &&
		(ac5eConfig.preAC5eConfig.advKey || ac5eConfig.preAC5eConfig.disKey)
	) {
		_setAC5eProperties(ac5eConfig, config);
		return _calcAdvantageMode(ac5eConfig, config);
	}
	if (targetsSize != 1) {
		//to-do: Think about more than one targets
		//to-do: Add keybind to target unseen tokens when 'force' is selected.
		if (
			settings.needsTarget == 'force' &&
			!hasValidTargets(item, targetsSize, 'attack', 'enforce')
		)
			return false;
		if (
			settings.needsTarget == 'none' &&
			!hasValidTargets(item, targetsSize, 'attack', 'console')
		)
			return true;
	}
	change = ac5eStatusChecks({ actor: sourceActor, token: canvas.tokens.get(sourceTokenID), targetToken: singleTargetToken, targetActor: singleTargetActor, item, hook, actorType: 'source', statuses: [...sourceActor.statuses], ac5eConfig });
	change = change && ac5eSettingsChecks({actor, token: canvas.tokens.get(sourceTokenID), hook, actorType: 'source', ac5eConfig, targetsSize });
	if (targetsSize == 1) {
		change = ac5eStatusChecks({ actor: sourceActor, token: canvas.tokens.get(sourceTokenID), targetToken: singleTargetToken, targetActor: singleTargetActor, item, hook, actorType: 'target', statuses: [...targetActor.statuses], ac5eConfig });
	}
	
	
	if (change || ac5eConfig.source.critical.length)
		_setAC5eProperties(ac5eConfig, config);
	return _calcAdvantageMode(ac5eConfig, config);
}

export function _preRollDamage(item, config) {
	const hook = 'damage';
	const { messageId, useFlags, item: itemD, attackingActor, attackingToken } = getMessageData(config);
	console.warn({'AC5E messageData': getMessageData(config), config, sourceActor: item.actor})
	const {
		actor: sourceActor,
		critical,
		messageData: {
			speaker: { token: sourceTokenID },
		},
	} = config;
	let change = false;
	const ac5eConfig = _getConfig(config, 'damage');
	if (ac5eConfig.preAC5eConfig && ac5eConfig.preAC5eConfig.critKey) {
		_setAC5eProperties(ac5eConfig, config);
		return _calcAdvantageMode(ac5eConfig, config);
	}
	const sourceToken = canvas.tokens.get(sourceTokenID);
	const targets = game.user?.targets;
	const targetsSize = targets?.size;
	const singleTargetToken = targets?.first(); //to-do: refactor for dnd5e 3.x target in messageData; flags.dnd5e.targets[0].uuid Actor5e#uuid not entirely useful.
	const singleTargetActor = singleTargetToken?.actor;
	if (targetsSize != 1) {
		//to-do: Think about more than one targets
		//to-do: Add keybind to target unseen tokens when 'force' is selected.
		if (
			settings.needsTarget == 'force' &&
			!hasValidTargets(item, targetsSize, 'damage', 'enforce')
		)
			return false;
		if (
			settings.needsTarget == 'none' &&
			!hasValidTargets(item, targetsSize, 'damage', 'console')
		)
			return true;
	}
	change = ac5eStatusChecks({ actor: sourceActor, token: canvas.tokens.get(sourceTokenID), hook, targetActor: singleTargetActor, targetToken: singleTargetToken, actorType: 'target', statuses: [...sourceActor.statuses], ac5eConfig });

	if (settings.debug) console.warn('preDamage ac5eConfig', ac5eConfig);
	if (change || !!ac5eConfig.source.critical.length) {
		_setAC5eProperties(ac5eConfig, config);
		config.critical = true;
	} else return true;
}

export function _renderHijack(renderedType, elem) {
	const getConfigAC5E =
		renderedType.collectionName === 'messages'
			? foundry.utils.getProperty(renderedType?.flags, Constants.MODULE_ID)
			: foundry.utils.getProperty(renderedType?.options, Constants.MODULE_ID);
	if (settings.debug) {
		console.warn('hijack getConfigAC5e', getConfigAC5E ?? undefined);
		console.warn('ac5e hijack renderedType:', renderedType);
		console.warn('ac5e hijcak elem/elem[0]:', elem, elem[0]);
	}
	if (!getConfigAC5E) return true;
	if (
		settings.showTooltips == 'none' ||
		(settings.showTooltips == 'chat' &&
			renderedType.collectionName !== 'messages') ||
		(settings.showTooltips == 'dialog' &&
			!renderedType.options?.classes?.includes('ac5e dialog'))
	)
		return true;
	/*
	if (
		(!elem[0] || !Object.values(elem[0].classList)?.includes('ac5e')) &&
		!renderedType.flags?.[Constants.MODULE_ID]
	)
		return true;
	*/
	let targetElement;
	const { hookType, roller } = getConfigAC5E;
	const tooltip = _getTooltip(getConfigAC5E);
	if (renderedType.collectionName === 'messages') {
		//['ability', 'skill', 'conc', 'death', 'attack', 'damage', 'item'].includes(hookType.toLocaleLowerCase()))
		if (roller == 'Core') {
			//should also work for Roll Groups not specifically called.
			if (['ability', 'death', 'skill', 'conc'].includes(hookType)) {
				targetElement = elem.querySelector('.chat-message header .flavor-text');
			} else if (['attack', 'damage'].includes(hookType)) {
				targetElement = elem.querySelector('.dice-formula');
			}
		} else if (roller == 'RSR') {
			if (['ability', 'death', 'skill', 'conc'].includes(hookType))
				targetElement = elem.querySelector(`.flavor-text`);
			else if (['attack', 'itemAttack', 'item'].includes(hookType)) {
				targetElement =
					elem.querySelector(
						'.rsr-section-attack > .rsr-header > .rsr-title'
					) ?? elem.querySelector('.rsr-title');
			} else if (['damage', 'itemDamage'].includes(hookType)) {
				targetElement =
					elem.querySelector(
						'.rsr-section-damage > .rsr-header > .rsr-title'
					) ?? elem.querySelector('.rsr-title');
			}
		} else if (roller == 'MidiQOL') {
			if (['ability', 'death', 'skill', 'conc', 'death'].includes(hookType))
				targetElement =
					elem.querySelector(`.flavor-text`) ??
					elem.querySelector('.midi-qol-saves-display');
			if (
				['itemAttack', 'attack', 'item'].includes(hookType.toLocaleLowerCase())
			)
				targetElement = elem.querySelector('.midi-qol-attack-roll');
			//to-do: add AC5E pill on Item card. Next release
			if (['itemDamage', 'damage'].includes(hookType.toLocaleLowerCase()))
				targetElement = elem.querySelector('.midi-qol-damage-roll');
		}
	} else {
		targetElement = elem[0].querySelector(
			`.dialog-button.${renderedType.data.default}`
		);
	}
	if (settings.debug) {
		console.warn('ac5e hijack getTooltip', tooltip);
		console.warn('ac5e hijack targetElement:', targetElement);
	}
	if (!tooltip) return true;
	if (targetElement) targetElement.setAttribute('data-tooltip', tooltip);
}

function hasValidTargets(item, size, type = 'attack', warn = false) {
	//will return true if the Item has an attack roll and targets are correctly set and selected, or false otherwise.
	//type of hook, 'attack', 'roll'  ; seems that there is no need for a 'pre'
	if (
		item.hasAttack &&
		(item.hasIndividualTarget ||
			(!item.hasIndividualTarget && !item.hasTarget)) &&
		size != 1 /*&&
		!keyboard.downKeys.has('KeyU')*/
	) {
		sizeWarnings(size, type, warn);
		return false;
	} else return true;
}

function sizeWarnings(size, type, warn = false) {
	//size, by this point, can be either false or >1 so no need for other checks
	//type for now can be 'damage' or 'attack'/'pre'
	const translationString =
		type == 'damage'
			? size
				? _localize('AC5E.MultipleTargetsDamageWarn')
				: _localize('AC5E.NoTargetsDamageWarn')
			: size
			? _localize('AC5E.MultipleTargetsAttackWarn')
			: _localize('AC5E.NoTargetsAttackWarn');
	if (['console', 'enforce'].includes(warn)) console.warn(translationString);
	if (warn == 'enforce') ui.notifications.warn(translationString);
}
