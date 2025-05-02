import { _activeModule, _calcAdvantageMode, _getActionType, _getDistance, _getValidColor, _hasAppliedEffects, _hasItem, _hasStatuses, _localize, _i18nConditions, _autoArmor, _autoEncumbrance, _autoRanged, _getTooltip, _getConfig, _setAC5eProperties, _systemCheck, _hasValidTargets } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
import { _ac5eChecks } from './ac5e-setpieces.mjs';

const settings = new Settings();

export function _rollFunctions(hook, ...args) {
	if (hook === 'use') {
		const [activity, config, dialog, message] = args;
		return _preUseActivity(activity, config, dialog, message, hook);
	} else if ([/*'conc', 'death', */ 'save'].includes(hook)) {
		const [config, dialog, message] = args;
		return _preRollSavingThrowV2(config, dialog, message, hook);
	} else if (hook === 'attack') {
		const [config, dialog, message] = args;
		return _preRollAttackV2(config, dialog, message, hook);
	} else if (hook === 'damage') {
		const [config, dialog, message] = args;
		return _preRollDamageV2(config, dialog, message, hook);
	} else if (['check' /*, 'init', 'tool', 'skill'*/].includes(hook)) {
		const [config, dialog, message] = args;
		return _preRollAbilityTest(config, dialog, message, hook);
	} else if (hook === 'consumptionHook') {
		const [activity, config, dialog, message] = args;
		return _postConsumptionHook(activity, config, dialog, message);
	}
}
function getMessageData(config) {
	const messageId = config.event?.currentTarget?.dataset?.messageId; //config?.event?.target?.closest?.('[data-message-id]')?.dataset?.messageId;
	const messageUuid = config?.midiOptions?.itemCardUuid;
	const message = messageId ? game.messages.get(messageId) : messageUuid ? fromUuidSync(messageUuid) : false;

	const { activity: activityObj, item: itemObj, targets, messageType, use } = message?.flags?.dnd5e || {};
	const item = fromUuidSync(itemObj?.uuid);
	const activity = fromUuidSync(activityObj?.uuid);
	const options = {};
	options.messageId = messageId;
	options.spellLevel = activity?.isSpell ? use?.spellLevel || item?.system.level : undefined;
	const { scene: sceneId, actor: actorId, token: tokenId, alias: tokenName } = message.speaker || {};
	const attackingToken = canvas.tokens.get(tokenId);
	const attackingActor = attackingToken?.actor ?? item?.actor;
	if (settings.debug) console.warn('AC5E.getMessageData', { messageId: message?.id, activity, item, attackingActor, attackingToken, targets, config, messageConfig: message?.config, use, options });
	return { messageId: message?.id, activity, item, attackingActor, attackingToken, targets, config, messageConfig: message?.config, use, options };
}

export function _preUseActivity(activity, usageConfig, dialogConfig, messageConfig, hook) {
	if (activity.type === 'check') return true; //maybe check for
	const { item, range: itemRange, attack, damage, type, target, ability, skill, tool } = activity || {};
	const sourceActor = item.actor;
	if (settings.debug) console.error('AC5e preUseActivity:', { item, sourceActor, activity, usageConfig, dialogConfig, messageConfig });
	if (!sourceActor) return;
	const chatButtonTriggered = getMessageData(usageConfig);
	const options = { ability, skill, tool, hook, activity };
	if (item.type === 'spell' && settings.autoArmorSpellUse !== 'off') {
		if (_autoArmor(sourceActor).notProficient) {
			if (settings.autoArmorSpellUse === 'warn') ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoArmorSpellUseChoicesWarnToast')}`);
			else if (settings.autoArmorSpellUse === 'enforce') {
				ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoArmorSpellUseChoicesEnforceToast')}`);
				return false;
			}
		}
	}
	const incapacitatedCheck = sourceActor.statuses.has('incapacitated');
	const ragingCheck = sourceActor.appliedEffects.some((effect) => [_localize('AC5E.Raging'), _localize('AC5E.Rage')].includes(effect.name));
	const silencedCheck = item.system.properties.has('vocal') && sourceActor.statuses.has('silenced') && !sourceActor.appliedEffects.some((effect) => effect.name === _localize('AC5E.SubtleSpell')) && !sourceActor.flags?.[Constants.MODULE_ID]?.subtleSpell;
	// const silencedCheck = item.system.properties.has('vocal') && sourceActor.statuses.has('silenced') && !sourceActor.appliedEffects.some((effect) => effect.name === _localize('AC5E.SubtleSpell.Vocal')) && !sourceActor.flags?.[Constants.MODULE_ID]?.subtleSpellVocal;
	// const somaticCheck = item.system.properties.has('somatic') && sourceActor.items.filter((i)=>i.system?.equipped && i.system.type === 'weapon' && !i.system.properties.has('foc'))?.length > 1 && !sourceActor.appliedEffects.some((effect) => effect.name === _localize('AC5E.SubtleSpell.Somatic')) && !sourceActor.flags?.[Constants.MODULE_ID]?.subtleSpellSomatic;
	if (incapacitatedCheck || ragingCheck || silencedCheck /*|| somaticCheck*/) {
		if (settings.autoArmorSpellUse === 'warn') {
			if (incapacitatedCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoIncapacitatedSpellUseChoicesWarnToast')}`);
			if (ragingCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoRagingSpellUseChoicesWarnToast')}`);
			if (silencedCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoSilencedSpellUseChoicesWarnToast')}`);
			// if (somaticCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoSomaticSpellUseChoicesWarnToast')}`);
		} else if (settings.autoArmorSpellUse === 'enforce') {
			if (incapacitatedCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoIncapacitatedSpellUseChoicesEnforceToast')}`);
			if (ragingCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoRagingSpellUseChoicesEnforceToast')}`);
			if (silencedCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoSilencedSpellUseChoicesEnforceToast')}`);
			// if (somaticCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoSomaticSpellUseChoicesWarnToast')}`);
			return false;
		}
	}
	// to-do: check how can we add logic for testing all these based on selected types of activities and settings.needsTarget, to allow for evaluation of conditions and flags from
	const sourceToken = sourceActor.token?.object ?? sourceActor.getActiveTokens()[0];
	let targets = game.user?.targets;
	if (targets.size) {
		for (const target of targets) {
			const distance = _getDistance(sourceToken, target);
			const perTargetOptions = foundry.utils.deepClone(options);
			perTargetOptions.distance = distance;
			let ac5eConfig = _getConfig(usageConfig, dialogConfig, hook, sourceToken?.id, target.id, perTargetOptions);
			//ac5eConfig should include the options object
			ac5eConfig = _ac5eChecks({ subjectToken: sourceToken, opponentToken: target, ac5eConfig });
			if (ac5eConfig.subject.fail.length || ac5eConfig.opponent.fail.length) {
				const failString = `${item.name} cannot target ${target.name}, due to the following effects`;
				const sourceString = ac5eConfig.subject.fail.length ? `, on the sourceActor: ${ac5eConfig.subject.fail.join(',')}` : '';
				const targetString = ac5eConfig.opponent.fail.length ? `, on the targetActor: ${ac5eConfig.opponent.fail.join(',')}!` : '!';
				ui.notifications.warn(failString + sourceString + targetString);
				game.user.updateTokenTargets(
					Array.from(game.user.targets)
						.filter((t) => t !== target)
						.map((t) => t.id)
				);
				if (_activeModule('midi-qol')) usageConfig.workflow.targets = new Set(game.user.targets);
			}
		}
	}
	//to-do: should we do something for !targets.size and midi?
	targets = game.user.targets;
	const singleTargetToken = targets?.first();
	let ac5eConfig = _getConfig(usageConfig, dialogConfig, hook, sourceToken?.id, singleTargetToken?.id, options);
	const singleTargetActor = singleTargetToken?.actor;
	const distance = _getDistance(sourceToken, singleTargetToken);
	options.distance = distance;
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: singleTargetToken });
	// _calcAdvantageMode(ac5eConfig, usageConfig, dialogConfig, messageConfig);
	_setAC5eProperties(ac5eConfig, usageConfig, dialogConfig, messageConfig);
	if (!activity.parent.hasAttack && !activity.hasDamage) return true;
	const targetsSize = targets?.size;
	//to-do: add an override for 'force' and a keypress, so that one could "target" unseen tokens. Default to source then probably?
	if (settings.needsTarget === 'force' && !_hasValidTargets(activity, targetsSize, 'pre', 'enforce')) return false;
	if (settings.needsTarget === 'none') return true;
	return true;
}

export function _postConsumptionHook(activity, config, dialog, message) {
	const ac5eConfig = config[Constants.MODULE_ID] || {};
	if (settings.debug) console.warn('AC5E._postConsumptionHook', { activity, config, dialog, message, ac5eConfig });
	if (activity.isSpell) foundry.utils.mergeObject(ac5eConfig, { options: { spellLevel: dialog?.data?.flags?.use?.spellLevel || activity.item.system.level } });
	_setAC5eProperties(ac5eConfig, config, dialog, message);
}

export function _preRollSavingThrowV2(config, dialog, message, hook) {
	const chatButtonTriggered = getMessageData(config);
	const { messageId, item, activity, attackingActor, attackingToken, targets, options = {}, use } = chatButtonTriggered || {};
	options.isDeathSave = config.hookNames.includes('deathSave');
	options.isConcentration = config.isConcentration;
	options.hook = hook;
	options.activity = activity;
	if (settings.debug) console.error('ac5e _preRollSavingThrowV2:', hook, options, { config, dialog, message });
	const { subject, ability, rolls } = config || {};
	options.ability = ability;
	const { options: dialogOptions, configure /*applicationClass: {name: className}*/ } = dialog || {};
	const speaker = message?.data?.speaker;
	const rollTypeObj = message?.flags?.dnd5e?.roll;

	const messageType = message?.flags?.dnd5e?.messageType;
	const chatMessage = message?.document;

	const subjectTokenId = speaker?.token;
	const subjectToken = canvas.tokens.get(subjectTokenId);
	if (attackingToken) options.distance = _getDistance(attackingToken, subjectToken);
	let ac5eConfig = _getConfig(config, dialog, hook, subjectTokenId, attackingToken?.id, options);
	if (ac5eConfig.returnEarly) {
		return _setAC5eProperties(ac5eConfig, config, dialog, message);
	}
	if (options.isDeathSave) {
		const hasAdvantage = subject.system.attributes.death?.roll?.mode === 1;
		const hasDisadvantage = subject.system.attributes.death?.roll?.mode === -1;
		if (hasAdvantage) ac5eConfig.subject.advantage.push(_localize('AC5E.SystemMode'));
		if (hasDisadvantage) ac5eConfig.subject.disadvantage.push(_localize('AC5E.SystemMode'));
	}

	if (options.isConcentration) {
		if (_hasItem(subject, _localize('AC5E.WarCaster'))) ac5eConfig.subject.advantage.push(_localize('AC5E.WarCaster'));
		const hasAdvantage = subject.system.attributes.concentration?.roll?.mode === 1;
		const hasDisadvantage = subject.system.attributes.concentration?.roll?.mode === -1;
		if (hasAdvantage) ac5eConfig.subject.advantage.push(_localize('AC5E.SystemMode'));
		if (hasDisadvantage) ac5eConfig.subject.disadvantage.push(_localize('AC5E.SystemMode'));
	}

	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken, opponentToken: attackingToken });
	dialog.configure = !ac5eConfig.fastForward;
	// _setAC5eProperties(ac5eConfig, config, dialog, message);
	return _calcAdvantageMode(ac5eConfig, config, dialog, message);
}

export function _preRollAbilityTest(config, dialog, message, hook) {
	if (settings.debug) console.warn('AC5E._preRollAbilityTest:', { config, dialog, message });
	const chatButtonTriggered = getMessageData(config);
	const { messageId, item, activity, attackingActor, attackingToken, targets, options = {}, use } = chatButtonTriggered || {};
	options.isInitiative = config.hookNames.includes('initiativeDialog');
	const { subject, ability, rolls, advantage: initialAdv, disadvantage: initialDis, tool, skill } = config || {};
	const speaker = message?.data?.speaker;
	options.skill = skill;
	options.tool = tool;
	options.ability = ability;
	options.hook = hook;
	options.activity = activity;

	const subjectTokenId = speaker?.token;
	const subjectToken = canvas.tokens.get(subjectTokenId);
	let opponentToken;
	//to-do: not ready for this yet. The following like would make it so checks would be perfomred based on target's data/effects
	// if (game.user.targets.size === 1) opponentToken = game.user.targets.first() !== subjectToken ? game.user.targets.first() : undefined;
	let ac5eConfig = _getConfig(config, dialog, hook, subjectTokenId, opponentToken?.id, options);

	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message, options);

	if (options.isInitiative && (subject?.flags?.dnd5e?.initiativeAdv || subject.system.attributes.init.roll.mode > 0)) ac5eConfig.subject.advantage.push(_localize('DND5E.FlagsInitiativeAdv')); //to-do: move to setPieces
	if (options.isInitiative && (subject?.flags?.dnd5e?.initiativeDisadv || subject.system.attributes.init.roll.mode < 0)) ac5eConfig.subject.disadvantage.push(_localize('AC5E.FlagsInitiativeDisadv')); //to-do: move to setPieces
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken, opponentToken });
	//check Auto Armor
	//to-do: move to setPieces
	if (settings.autoArmor) {
		if (['dex', 'str'].includes(ability) && _autoArmor(subject).notProficient) ac5eConfig.subject.disadvantage.push(`${_localize(_autoArmor(subject).notProficient)} (${_localize('NotProficient')})`);
		if (skill === 'ste' && _autoArmor(subject).hasStealthDisadvantage) ac5eConfig.subject.disadvantage.push(`${_localize(_autoArmor(subject).hasStealthDisadvantage)} (${_localize('ItemEquipmentStealthDisav')})`);
	}
	//to-do: move to setPieces
	if (_autoEncumbrance(subject, ability)) {
		ac5eConfig.subject.disadvantage.push(_i18nConditions('HeavilyEncumbered'));
	}
	if (dialog?.configure) dialog.configure = !ac5eConfig.fastForward;
	// _setAC5eProperties(ac5eConfig, config, dialog, message, options);
	_calcAdvantageMode(ac5eConfig, config, dialog, message);
	if (settings.debug) console.warn('AC5E._preRollAbilityTest', { ac5eConfig });
	return ac5eConfig;
}

export function _preRollAttackV2(config, dialog, message, hook) {
	if (settings.debug) console.error('AC5e _preRollAttackV2', hook, { config, dialog, message });
	const { subject: { actor: sourceActor, /*type: actionType,*/ range: itemRange, ability } = {}, subject: activity, rolls } = config || {};
	const {
		data: { speaker: { token: sourceTokenID } = {} },
	} = message || {};
	const chatButtonTriggered = getMessageData(config);
	const { messageId, item, activity: messageActivity, attackingActor, attackingToken, /* targets, config: message?.config,*/ use, options = {} } = chatButtonTriggered || {};
	options.ability = ability;
	options.activity = activity;
	options.hook = hook;

	//these targets get the uuid of either the linked Actor or the TokenDocument if unlinked. Better use user targets
	//const targets = [...game.user.targets];
	const targets = game.user.targets;
	const sourceToken = canvas.tokens.get(sourceTokenID); //Token5e
	const targetsSize = targets?.size; //targets?.length;
	const singleTargetToken = targets?.first(); //targets?.[0];
	const singleTargetActor = singleTargetToken?.actor;
	let targetActor = singleTargetActor;
	let targetToken = singleTargetToken;
	let distance = _getDistance(sourceToken, singleTargetToken);
	options.distance = distance;
	if (targetsSize != 1) {
		//to-do: Think about more than one targets
		//to-do: Add keybind to target unseen tokens when 'force' is selected.
		if (settings.needsTarget == 'force' && !_hasValidTargets(activity, targetsSize, 'attack', 'enforce')) return false;
		else if (settings.needsTarget == 'none' && !_hasValidTargets(item, targetsSize, 'attack', 'console')) return true;
		else {
			//source only
			targetToken = undefined;
			targetToken = undefined;
			distance = undefined;
		}
	}
	let ac5eConfig = _getConfig(config, dialog, hook, sourceTokenID, targetToken?.id, options);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message);
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: targetToken });

	let nearbyFoe, inRange, range;
	if (settings.autoRangedCombined !== 'off' && targetToken) {
		({ nearbyFoe, inRange, range } = _autoRanged(activity, sourceToken, singleTargetToken));
		//Nearby Foe
		if (nearbyFoe) {
			ac5eConfig.subject.disadvantage.push(_localize('AC5E.NearbyFoe'));
		}
		if (!inRange) {
			ac5eConfig.subject.fail.push(_localize('AC5E.OutOfRange'));
		}
		if (range === 'long') {
			ac5eConfig.subject.disadvantage.push(_localize('RangeLong'));
		}
	}

	//check Auto Armor
	if (settings.autoArmor && ['dex', 'str'].includes(ability) && _autoArmor(sourceActor).notProficient) {
		ac5eConfig.subject.disadvantage = ac5eConfig.subject.disadvantage.concat(`${_localize(_autoArmor(sourceActor).notProficient)} (${_localize('NotProficient')})`);
	}
	if (_autoEncumbrance(sourceActor, ability)) {
		ac5eConfig.subject.disadvantage = ac5eConfig.subject.disadvantage.concat(_i18nConditions('HeavilyEncumbered'));
	}
	if (settings.debug) console.warn('AC5E._preRollAttackV2:', { ac5eConfig });
	// _setAC5eProperties(ac5eConfig, config, dialog, message);
	return _calcAdvantageMode(ac5eConfig, config, dialog, message);
}

export function _preRollDamageV2(config, dialog, message, hook) {
	if (settings.debug) console.warn('AC5E._preRollDamageV2', hook, { config, dialog, message });
	const { subject: activity, subject: { actor: sourceActor, ability } = {}, rolls, attackMode, ammunition } = config || {};
	const {
		//these targets get the uuid of either the linked Actor or the TokenDocument if unlinked. Better use user targets for now, unless we don't care for multiple tokens of a linked actor.
		data: { /*flags: {dnd5e: {targets} } ,*/ speaker } = {},
	} = message || {};

	const chatButtonTriggered = getMessageData(config);
	const { messageId, item, /*activity,*/ attackingActor, attackingToken, /*targets, config: message?.config,*/ use, options = {} } = chatButtonTriggered || {};
	options.ability = ability;
	options.attackMode = attackMode;
	options.ammo = ammunition;
	options.activity = activity;
	options.hook = hook;
	// options.spellLevel = use?.spellLevel;
	const sourceTokenID = speaker.token;
	const sourceToken = canvas.tokens.get(sourceTokenID);
	const targets = game.user?.targets;
	const targetsSize = targets?.size;
	const singleTargetToken = targets?.first(); //to-do: refactor for dnd5e 3.x target in messageData; flags.dnd5e.targets[0].uuid Actor5e#uuid not entirely useful.
	const singleTargetActor = singleTargetToken?.actor;
	let targetActor = singleTargetActor;
	let targetToken = singleTargetToken;
	let distance = _getDistance(sourceToken, singleTargetToken);
	options.distance = distance;
	if (targetsSize != 1) {
		//to-do: Think about more than one targets
		//to-do: Add keybind to target unseen tokens when 'force' is selected.
		if (settings.needsTarget == 'force' && !_hasValidTargets(activity, targetsSize, 'attack', 'enforce')) return false;
		else if (settings.needsTarget == 'none' && !_hasValidTargets(item, targetsSize, 'attack', 'console')) return true;
		else {
			//source only
			targetToken = undefined;
			targetToken = undefined;
			distance = undefined;
		}
	}
	let ac5eConfig = _getConfig(config, dialog, hook, sourceTokenID, targetToken?.id, options);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message);
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: targetToken });
	_calcAdvantageMode(ac5eConfig, config, dialog, message);
	if (settings.debug) console.warn('AC5E._preRollDamageV2:', { ac5eConfig });
	return true;
}

export function _renderHijack(hook, render, elem) {
	let getConfigAC5E, targetElement, hookType, roller, tooltip, message;
	if (settings.debug) console.warn('AC5E._renderHijack:', { hook, render, elem });
	if (hook === 'd20Dialog' || hook === 'damageDialog') {
		getConfigAC5E = render.config?.[Constants.MODULE_ID] ?? render.config?.rolls?.[0]?.options?.[Constants.MODULE_ID];
		// need to check if the dialog title changed which means that we need to reavaluate everything with the new Ability probably
		if (getConfigAC5E.options.skill || getConfigAC5E.options.tool) {
			const selectedAbility = render.form.querySelector('select[name="ability"]').value;
			if (selectedAbility !== getConfigAC5E.options.ability) {
				const newConfig = render.config;
				newConfig.ability = selectedAbility;
				newConfig.advantage = undefined;
				newConfig.disadvantage = undefined;
				newConfig.rolls[0].options.advantageMode = 0;
				const oldDefaultButton = getConfigAC5E.defaultButton;
				const getEvaluatedAC5eButton = elem.querySelector(`button[data-action="${oldDefaultButton}"]`);
				getEvaluatedAC5eButton.classList.remove('ac5e-button');
				getEvaluatedAC5eButton.removeAttribute('data-tooltip');
				const newDialog = { options: { window: { title: render.message.data.flavor }, advantageMode: 0, defaultButton: 'normal' } };
				const newMessage = render.message;
				getConfigAC5E = _preRollAbilityTest(newConfig, newDialog, newMessage, 'check');
				const newDefaultButton = getConfigAC5E.defaultButton;
				if (settings.buttonColorEnabled && oldDefaultButton !== newDefaultButton) {
					const testButtons = ['advantage', 'disadvantage', 'normal'].find((a) => oldDefaultButton !== a && newDefaultButton !== a);
					const getOtherButtonDefaults = elem.querySelector(`button[data-action="${testButtons}"]`);
					if (settings.buttonColorBackground) getEvaluatedAC5eButton.style.backgroundColor = getOtherButtonDefaults.style.backgroundColor;
					if (settings.buttonColorBorder) getEvaluatedAC5eButton.style.border = getOtherButtonDefaults.style.border;
					if (settings.buttonColorText) getEvaluatedAC5eButton.style.color = getOtherButtonDefaults.style.color;
				}
			}
		}
		const { hookType, options } = getConfigAC5E || {};
		if (!hookType) return true;
		let tokenName;
		const title = elem.querySelector('header.window-header h1.window-title') ?? elem.querySelector('dialog.application.dnd5e2.roll-configuration .window-header .window-title');
		let newTitle;
		if (render.config?.isConcentration) {
			newTitle = `${game.i18n.translations.DND5E.AbbreviationDC} ${render.config.target} ${game.i18n.translations.DND5E.Concentration}`;
			if (render.config.ability !== 'con') newTitle += ` (${render.config.ability.toLocaleUpperCase()})`;
		}
		if (options?.isInitiative) {
			newTitle = game.i18n.translations.DND5E.InitiativeRoll;
			const actorUuid = render.rolls?.[0]?.data?.actorUuid ?? render.config?.subject?.uuid;
			const actor = fromUuidSync(actorUuid);
			const tokenName = actor?.token?.name ?? actor?.getActiveTokens()?.[0]?.name;
			const subtitleElement = elem.querySelector('.window-subtitle');
			subtitleElement.textContent = `${tokenName}`;
			subtitleElement.style.display = 'block'; // Force a new line
		}
		// else if (getConfigAC5E?.tokenId && (hookType === 'attack' || hookType === 'damage')) {
		// 	const subtitleElement = elem.querySelector('.window-subtitle');
		// 	tokenName = canvas.tokens.get(getConfigAC5E.tokenId)?.name;
		// 	subtitleElement.textContent = `${tokenName}`;
		// 	subtitleElement.style.display = 'block'; // Force a new line
		// }
		if (newTitle) title.textContent = newTitle; //: render.title;
		if (!['both', 'dialog'].includes(settings.showTooltips)) return true;
		tooltip = _getTooltip(getConfigAC5E);
		if (tooltip === '') return true;
		const defaultButton = getConfigAC5E.defaultButton;
		targetElement = elem.querySelector(`button[data-action="${defaultButton}"]`);
		if (!targetElement) return true;
		if (defaultButton === 'critical') targetElement.focus();
		if (settings.buttonColorEnabled) {
			if (settings.buttonColorBackground) targetElement.style.backgroundColor = settings.buttonColorBackground;
			if (settings.buttonColorBorder) targetElement.style.border = `1px solid ${settings.buttonColorBorder}`;
			if (settings.buttonColorText) targetElement.style.color = settings.buttonColorText;
			// if (game.settings.get('core', 'colorScheme') === 'light') targetElement.style.boxShadow = '1px 1px 3px rgba(0, 0, 0, 0.6), 2px 2px 6px rgba(0, 0, 0, 0.3)';
		}
		targetElement.classList.add('ac5e-button');
		targetElement.setAttribute('data-tooltip', tooltip);
		if (settings.debug) {
			console.warn('ac5e hijack getTooltip', tooltip);
			console.warn('ac5e hijack targetElement:', targetElement);
		}
		return true;
	} else if (hook === 'chat') {
		if (!['both', 'chat'].includes(settings.showTooltips)) return true;
		if (_activeModule('midi-qol')) {
			if (render?.rolls?.length > 1) {
				getConfigAC5E = [render?.rolls?.[0]?.options?.[Constants.MODULE_ID], render?.rolls?.[1]?.options?.[Constants.MODULE_ID], render?.rolls?.[2]?.options?.[Constants.MODULE_ID]];
				if (!getConfigAC5E[0]?.hookType) return true;
			} else {
				getConfigAC5E = render.rolls?.[0]?.options?.[Constants.MODULE_ID];
				if (!getConfigAC5E) return true;
			}
			if (!getConfigAC5E.length) getConfigAC5E = [getConfigAC5E];
			for (const ac5eElement of getConfigAC5E) {
				tooltip = _getTooltip(ac5eElement);
				if (tooltip === '') continue;
				let thisTargetElement;
				const hT = ac5eElement?.hookType;
				if (!hT) continue;
				if (game.user.targets.size <= 1 && ['check', 'save'].includes(hT)) thisTargetElement = elem.querySelector(`.flavor-text`) ?? elem.querySelector('.midi-qol-saves-display');
				else if (['attack'].includes(hT)) thisTargetElement = elem.querySelector('.midi-qol-attack-roll');
				else if (['damage'].includes(hT)) thisTargetElement = elem.querySelector('.midi-qol-damage-roll');
				//to-do: add AC5E pill on Item card. Next release
				if (thisTargetElement) thisTargetElement.setAttribute('data-tooltip', tooltip);
			}
			if (settings.debug) {
				console.warn('ac5e hijack getTooltip', tooltip);
				console.warn('ac5e hijack targetElement:', targetElement);
			}
			return true;
		} else {
			getConfigAC5E = render.rolls?.[0]?.options?.[Constants.MODULE_ID];
			if (!getConfigAC5E) return true;
			({ hookType, roller } = getConfigAC5E);
			tooltip = _getTooltip(getConfigAC5E);
			if (roller === 'Core') {
				if (tooltip === '') return true;
				if (['attack', 'damage'].includes(hookType)) {
					targetElement = elem.querySelector('.dice-formula');
				} else {
					targetElement = elem.querySelector('.message-content .dice-roll .dice-result .dice-formula') ?? elem.querySelector('.chat-message header .flavor-text');
				}
			} else if (roller === 'RSR') {
				//to-do: Rework this to use the new RSR system
				if (['check', 'save'].includes(hookType)) targetElement = elem.querySelector(`.flavor-text`);
				else if (['attack'].includes(hookType)) {
					targetElement = elem.querySelector('.rsr-section-attack > .rsr-header > .rsr-title') ?? elem.querySelector('.rsr-title');
				} else if (['damage'].includes(hookType)) {
					targetElement = elem.querySelector('.rsr-section-damage > .rsr-header > .rsr-title') ?? elem.querySelector('.rsr-title');
				}
			}
			if (settings.debug) {
				console.warn('ac5e hijack getTooltip', tooltip);
				console.warn('ac5e hijack targetElement:', targetElement);
			}
			if (targetElement) targetElement.setAttribute('data-tooltip', tooltip);
			return true;
		}
	}
}

export async function _overtimeHazards(combat, update, options, user) {
	if (!settings.autoHazards /*|| !game.user.isGM*/ || game.users.find((u) => u.isGM && u.active)?.id !== user) return true;

	const hasPHB = game.modules.get('dnd-players-handbook')?.active;
	const token = combat.combatant?.token?.object;
	const actor = combat.combatant?.token?.actor;
	const previousCombatantId = combat.previous?.tokenId;
	const previousToken = previousCombatantId ? canvas.tokens.get(previousCombatantId) : null;
	const previousActor = previousToken?.actor;

	const SUFFOCATION_UUID = 'Compendium.dnd-players-handbook.content.JournalEntry.phbAppendixCRule.JournalEntryPage.gAvV8TLyS8UGq00x';
	const BURNING_UUID = 'Compendium.dnd-players-handbook.content.JournalEntry.phbAppendixCRule.JournalEntryPage.mPBGM1vguT5IPzxT';
	const PRONE_UUID = 'Compendium.dnd5e.rules.JournalEntry.w7eitkpD7QQTB6j0.JournalEntryPage.y0TkcdyoZlOTmAFT';

	const TextEditorFn = game.version > '13' ? foundry.applications.ux.TextEditor.implementation : TextEditor;

	if (previousActor?.statuses.has('suffocation')) {
		const maxExhaustion = CONFIG.DND5E.conditionTypes?.exhaustion?.levels ?? 0;
		const exhaustionLevel = previousActor.system.attributes.exhaustion ?? 0;
		if (maxExhaustion && (exhaustionLevel < maxExhaustion)) {
			await previousActor.update({
				'system.attributes.exhaustion': exhaustionLevel + 1,
			});

			let flavor = _localize('AC5E.EnviromentalHazards.Suffocating');
			if (hasPHB) {
				const suffocationEntry = await fromUuid(SUFFOCATION_UUID);
				flavor = `<div align-text="center">${_localize('AC5E.EnviromentalHazards.SettingsName')}</div>${suffocationEntry?.text?.content ?? flavor}`;
			}

			const enrichedHTML = (await TextEditorFn.enrichHTML(flavor)).replace(/<a[^>]*data-action="apply"[^>]*>.*?<\/a>/g, '');

			await ChatMessage.create({
				content: enrichedHTML,
				speaker: ChatMessage.getSpeaker({ token: previousToken }),
			});
		}
	}

	if (actor?.statuses.has('burning')) {
		let flavor = _localize('AC5E.EnviromentalHazards.BurningHazard');
		if (hasPHB) {
			const burningEntry = await fromUuid(BURNING_UUID);
			flavor = `<div align-text="center">${_localize('AC5E.EnviromentalHazards.SettingsName')}</div>${burningEntry?.text?.content ?? flavor}`;
		}

		flavor = flavor.replace(/@UUID\[\.QxCrRcgMdUd3gfzz\]\{Prone\}/g, `@UUID[${PRONE_UUID}]{Prone}`);

		const enrichedHTML = await TextEditorFn.enrichHTML(flavor);
		const type = 'fire';

		if (!_activeModule('midi-qol')) {
			token.control();
			return new CONFIG.Dice.DamageRoll('1d4', actor?.getRollData(), {
				type,
				appearance: { colorset: type },
			}).toMessage({ flavor: enrichedHTML });
		} else {
			const damageRoll = await new Roll('1d4', actor?.getRollData(), {
				type,
				appearance: { colorset: type },
			}).toMessage({ flavor: enrichedHTML });
			const damage = damageRoll.rolls[0].total;

			const forceApply = MidiQOL.configSettings()?.autoApplyDamage?.includes('yes') ?? false;

			return MidiQOL.applyTokenDamage([{ type, damage }], damage, new Set([token]), null, null, { forceApply });
		}
	}

	return true;
}

export function _renderSettings(app, html, data) {
	const $html = $(html);
	const colorSettings = [
		{ key: 'buttonColorBackground', default: '#288bcc' },
		{ key: 'buttonColorBorder', default: 'white' },
		{ key: 'buttonColorText', default: 'white' },
	];

	for (let { key, default: defaultValue } of colorSettings) {
		const settingKey = `${Constants.MODULE_ID}.${key}`;
		const input = $html.find(`[name="${settingKey}"]`);
		if (input.length) {
			let colorPicker = $('<input type="color" class="color-picker">');

			const updateColorPicker = () => {
				const val = input.val().trim().toLowerCase();
				const resolved = _getValidColor(val);

				// Remove color picker if input is falsy
				if (resolved === false) {
					colorPicker.hide();
				} else {
					if (!colorPicker || !colorPicker.parent().length) {
						colorPicker = $('<input type="color" class="color-picker">');
						input.after(colorPicker);
					}
					colorPicker.val(resolved).show();
				}
			};

			// Sync picker -> input
			colorPicker.on('input', function () {
				const color = $(this).val();
				input.val(color).trigger('change');
			});

			// Sync input -> picker
			input.on('input', function () {
				updateColorPicker();
			});

			// Reset to default when blank
			input.on('blur', function () {
				if ($(this).val().trim() === '') {
					$(this).val(defaultValue).trigger('change');
					updateColorPicker();
				}
			});

			input.after(colorPicker);
			updateColorPicker();
		}
	}

	// Toggle visibility based on the main checkbox
	const toggle = $html.find(`[name="${Constants.MODULE_ID}.buttonColorEnabled"]`);
	const updateVisibility = () => {
		const visible = toggle.is(':checked');
		const keysToToggle = ['buttonColorBackground', 'buttonColorBorder', 'buttonColorText'];
		for (let key of keysToToggle) {
			$html.find(`[data-setting-id="${Constants.MODULE_ID}.${key}"]`).toggle(visible);
		}
	};

	updateVisibility();
	toggle.on('change', updateVisibility);
}
