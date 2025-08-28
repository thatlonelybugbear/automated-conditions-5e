import { _activeModule, _calcAdvantageMode, _collectActivityDamageTypes, _collectRollDamageTypes, _getActionType, _getDistance, _getValidColor, _hasAppliedEffects, _hasItem, _hasStatuses, _localize, _i18nConditions, _autoArmor, _autoEncumbrance, _autoRanged, _getTooltip, _getConfig, _setAC5eProperties, _systemCheck, _hasValidTargets } from './ac5e-helpers.mjs';
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
	} else if (hook === 'init') {
		const [actor, rollConfig] = args;
		return _preConfigureInitiative(actor, rollConfig, hook);
	}
}
function getMessageData(config, hook) {
	const messageId = config.event?.currentTarget?.dataset?.messageId ?? config?.event?.target?.closest?.('[data-message-id]')?.dataset?.messageId;
	const messageUuid = config?.midiOptions?.itemCardUuid ?? config?.workflow?.itemCardUuid; //for midi
	const message = messageId ? game.messages.get(messageId) : messageUuid ? fromUuidSync(messageUuid) : undefined;

	const messageTargets = getTargets(message);
	const { activity: activityObj, item: itemObj, messageType, use } = message?.flags?.dnd5e || {};
	const item = fromUuidSync(itemObj?.uuid);
	const activity = fromUuidSync(activityObj?.uuid);
	const options = {};
	options.d20 = {};
	if (hook === 'damage') {
		if (_activeModule('midi-qol')) {
			options.d20.attackRollTotal = config?.workflow?.attackTotal;
			options.d20.attackRollD20 = config?.workflow?.d20AttackRoll;
			options.d20.hasAdvantage = config?.workflow?.advantage;
			options.d20.hasDisadvantage = config?.workflow?.disadvantage;
			options.d20.isCritical = config?.midiOptions?.isCritical;
			options.d20.isFumble = config?.midiOptions?.isFumble;
		} else {
			const findAttackRoll = game.messages.filter((m) => m.flags?.dnd5e?.originatingMessage === messageId && m.flags?.dnd5e?.roll?.type === 'attack').at(-1)?.rolls[0];
			options.d20.attackRollTotal = findAttackRoll?.total;
			options.d20.attackRollD20 = findAttackRoll?.d20?.total;
			options.d20.hasAdvantage = findAttackRoll?.options?.advantageMode > 0;
			options.d20.hasDisadvantage = findAttackRoll?.options?.advantageMode < 0;
			options.d20.isCritical = findAttackRoll?.options?.isCritical ?? config?.isCritical;
			options.d20.isFumble = findAttackRoll?.options?.isFumble ?? config?.isFumble;
		}
	}
	options.messageId = messageId;
	options.spellLevel = hook !== 'use' && activity?.isSpell ? use?.spellLevel || item?.system.level : undefined;
	const { scene: sceneId, actor: actorId, token: tokenId, alias: tokenName } = message?.speaker || {};
	const attackingToken = canvas.tokens.get(tokenId);
	const attackingActor = attackingToken?.actor ?? item?.actor;
	if (settings.debug) console.warn('AC5E.getMessageData', { messageId: message?.id, activity, item, attackingActor, attackingToken, messageTargets, config, messageConfig: message?.config, use, options });
	return { messageId: message?.id, activity, item, attackingActor, attackingToken, messageTargets, config, messageConfig: message?.config, use, options };
}

function getTargets(message) {
	const messageTargets = message?.flags?.dnd5e?.targets;
	if (messageTargets?.length) return messageTargets;
	return [...game.user.targets].map((target) => ({ ac: target.actor?.system?.attributes?.ac?.value ?? null, uuid: target.actor?.uuid, tokenUuid: target.document.uuid, name: target.name, img: target.document.texture.src }));
}

export function _preUseActivity(activity, usageConfig, dialogConfig, messageConfig, hook) {
	if (activity.type === 'check') return true; //maybe check for
	const { item, range: itemRange, attack, damage, type, target, ability, skill, tool } = activity || {};
	const sourceActor = item.actor;
	if (settings.debug) console.error('AC5e preUseActivity:', { item, sourceActor, activity, usageConfig, dialogConfig, messageConfig });
	if (!sourceActor) return;
	const chatButtonTriggered = getMessageData(usageConfig, hook);
	const { messageTargets, options } = chatButtonTriggered;
	options.ability = ability;
	options.skill = skill;
	options.tool = tool;
	options.hook = hook;
	options.activity = activity;
	options.targets = messageTargets;
	_collectActivityDamageTypes(activity, options); //adds options.defaultDamageType, options.damageTYpes

	const useWarnings = settings.autoArmorSpellUse === 'off' ? false : settings.autoArmorSpellUse === 'warn' ? 'Warn' : 'Enforce';
	if (item.type === 'spell' && useWarnings) {
		const notProficient = _autoArmor(sourceActor).notProficient;
		const raging = sourceActor.appliedEffects.some((effect) => [_localize('AC5E.Raging'), _localize('AC5E.Rage')].includes(effect.name));
		const silenced = item.system.properties.has('vocal') && sourceActor.statuses.has('silenced') && !sourceActor.appliedEffects.some((effect) => effect.name === _localize('AC5E.SubtleSpell')) && !sourceActor.flags?.[Constants.MODULE_ID]?.subtleSpell;
		// const silencedCheck = item.system.properties.has('vocal') && sourceActor.statuses.has('silenced') && !sourceActor.appliedEffects.some((effect) => effect.name === _localize('AC5E.SubtleSpell.Vocal')) && !sourceActor.flags?.[Constants.MODULE_ID]?.subtleSpellVocal;
		// const somaticCheck = item.system.properties.has('somatic') && sourceActor.items.filter((i)=>i.system?.equipped && i.system.type === 'weapon' && !i.system.properties.has('foc'))?.length > 1 && !sourceActor.appliedEffects.some((effect) => effect.name === _localize('AC5E.SubtleSpell.Somatic')) && !sourceActor.flags?.[Constants.MODULE_ID]?.subtleSpellSomatic;
		if (notProficient) notifyPreUse(sourceActor.name, useWarnings, 'Armor');
		else if (raging) notifyPreUse(sourceActor.name, useWarnings, 'Raging');
		else if (silenced) notifyPreUse(sourceActor.name, useWarnings, 'Silenced');
		if (useWarnings === 'Enforce' && (notProficient || raging || silenced)) return false;
	}
	const incapacitated = settings.autoArmorSpellUse !== 'off' && sourceActor.statuses.has('incapacitated');
	if (incapacitated && useWarnings) {
		notifyPreUse(sourceActor.name, useWarnings, 'Incapacitated');
		if (useWarnings === 'Enforce') return false;
	}

	// to-do: check how can we add logic for testing all these based on selected types of activities and settings.needsTarget, to allow for evaluation of conditions and flags from
	const sourceToken = sourceActor.token?.object ?? sourceActor.getActiveTokens()[0];

	//to-do: rework this to properly check for fail flags and fail use status effects
	// if (targets.size) {
	// 	for (const target of targets) {
	// 		const distance = _getDistance(sourceToken, target);
	// 		const perTargetOptions = foundry.utils.deepClone(options);
	// 		perTargetOptions.distance = distance;
	// 		let ac5eConfig = _getConfig(usageConfig, dialogConfig, hook, sourceToken?.id, target.id, perTargetOptions);
	// 		//ac5eConfig should include the options object
	// 		ac5eConfig = _ac5eChecks({ subjectToken: sourceToken, opponentToken: target, ac5eConfig });
	// 		if (ac5eConfig.subject.fail.length || ac5eConfig.opponent.fail.length) {
	// 			const failString = `${item.name} cannot target ${target.name}, due to the following effects`;
	// 			const sourceString = ac5eConfig.subject.fail.length ? `, on the sourceActor: ${ac5eConfig.subject.fail.join(',')}` : '';
	// 			const targetString = ac5eConfig.opponent.fail.length ? `, on the targetActor: ${ac5eConfig.opponent.fail.join(',')}!` : '!';
	// 			ui.notifications.warn(failString + sourceString + targetString);
	// 			game.user.updateTokenTargets(
	// 				Array.from(game.user.targets)
	// 					.filter((t) => t !== target)
	// 					.map((t) => t.id)
	// 			);
	// 			if (_activeModule('midi-qol')) usageConfig.workflow.targets = new Set(game.user.targets);
	// 		}
	// 	}
	// }
	//to-do: should we do something for !targets.size and midi?
	let targets = game.user?.targets;
	let singleTargetToken = targets?.first();
	const needsTarget = settings.needsTarget;
	//to-do: add an override for 'force' and a keypress, so that one could "target" unseen tokens. Default to source then probably?
	const invalidTargets = !_hasValidTargets(activity, targets?.size, needsTarget);
	if (invalidTargets) {
		if (needsTarget !== 'source') return false;
		else singleTargetToken = undefined;
	}
	if (singleTargetToken) options.distance = _getDistance(sourceToken, singleTargetToken);
	let ac5eConfig = _getConfig(usageConfig, dialogConfig, hook, sourceToken?.id, singleTargetToken?.id, options);
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: singleTargetToken });
	// _calcAdvantageMode(ac5eConfig, usageConfig, dialogConfig, messageConfig);   //@to-do: Still need to make a better check for `use` checks in setpieces, but no need to altering advMode or bonus etc
	_setAC5eProperties(ac5eConfig, usageConfig, dialogConfig, messageConfig);
	return true;
}

// export function _postConsumptionHook(activity, config, dialog, message) {
// 	const ac5eConfig = config[Constants.MODULE_ID] || {};
// 	if (settings.debug) console.warn('AC5E._postConsumptionHook', { activity, config, dialog, message, ac5eConfig });
// 	if (activity.isSpell) foundry.utils.mergeObject(ac5eConfig, { options: { spellLevel: dialog?.data?.flags?.use?.spellLevel || activity.item.system.level } });
// 	_setAC5eProperties(ac5eConfig, config, dialog, message);
// }

export function _preRollSavingThrowV2(config, dialog, message, hook) {
	const chatButtonTriggered = getMessageData(config, hook);
	const { messageId, item, activity, attackingActor, attackingToken, messageTargets, options = {}, use } = chatButtonTriggered || {};
	options.isDeathSave = config.hookNames.includes('deathSave');
	options.isConcentration = config.isConcentration;
	options.hook = hook;
	options.activity = activity;
	if (settings.debug) console.error('ac5e _preRollSavingThrowV2:', hook, options, { config, dialog, message });
	const { subject, ability, rolls } = config || {};
	options.ability = ability;
	options.targets = messageTargets;
	_collectActivityDamageTypes(activity, options); //adds options.defaultDamageType, options.damageTYpes

	const { options: dialogOptions, configure /*applicationClass: {name: className}*/ } = dialog || {};
	const speaker = message?.speaker;
	const rollTypeObj = message?.flags?.dnd5e?.roll;

	const messageType = message?.flags?.dnd5e?.messageType;
	const chatMessage = message?.document;

	const subjectTokenId = speaker?.token ?? subject?.token?.id ?? subject?.getActiveTokens()[0]?.id;
	const subjectToken = canvas.tokens.get(subjectTokenId);
	if (attackingToken) options.distance = _getDistance(attackingToken, subjectToken);
	let ac5eConfig = _getConfig(config, dialog, hook, subjectTokenId, attackingToken?.id, options);
	if (ac5eConfig.returnEarly) {
		return _setAC5eProperties(ac5eConfig, config, dialog, message);
	}
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken, opponentToken: attackingToken });
	// dialog.configure = !ac5eConfig.fastForward;
	return _calcAdvantageMode(ac5eConfig, config, dialog, message);
}

export function _preRollAbilityTest(config, dialog, message, hook, reEval) {
	if (settings.debug) console.warn('AC5E._preRollAbilityTest:', { config, dialog, message });
	const chatButtonTriggered = getMessageData(config, hook);
	const { messageId, item, activity, attackingActor, attackingToken, messageTargets, options = {}, use } = chatButtonTriggered || {};
	options.isInitiative = config.hookNames.includes('initiativeDialog');
	let ac5eConfig;
	const { subject, ability, rolls, advantage: initialAdv, disadvantage: initialDis, tool, skill } = config || {};
	const speaker = message?.speaker;
	options.skill = skill;
	options.tool = tool;
	options.ability = ability;
	options.hook = hook;
	options.activity = activity;
	options.targets = messageTargets;
	_collectActivityDamageTypes(activity, options); //adds options.defaultDamageType, options.damageTYpes

	const subjectTokenId = speaker?.token ?? subject?.token?.id ?? subject?.getActiveTokens()[0]?.id;
	const subjectToken = canvas.tokens.get(subjectTokenId);
	let opponentToken;
	//to-do: not ready for this yet. The following line would make it so checks would be perfomred based on target's data/effects
	// if (game.user.targets.size === 1) opponentToken = game.user.targets.first() !== subjectToken ? game.user.targets.first() : undefined;

	ac5eConfig = _getConfig(config, dialog, hook, subjectTokenId, opponentToken?.id, options);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message, options);

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
	// if (dialog?.configure) dialog.configure = !ac5eConfig.fastForward;
	_calcAdvantageMode(ac5eConfig, config, dialog, message);
	if (settings.debug) console.warn('AC5E._preRollAbilityTest', { ac5eConfig });
	return ac5eConfig;
}

export function _preRollAttackV2(config, dialog, message, hook, reEval) {
	if (settings.debug) console.error('AC5e _preRollAttackV2', hook, { config, dialog, message });
	const { subject: { actor: sourceActor, /*type: actionType,*/ range: itemRange, ability } = {}, subject: activity, rolls, ammunition, attackMode, mastery } = config || {};
	const {
		data: { speaker: { token: sourceTokenID } = {} },
	} = message || {};
	const chatButtonTriggered = getMessageData(config, hook);
	const { messageId, activity: messageActivity, attackingActor, attackingToken, messageTargets, /*config: message?.config,*/ use, options = {} } = chatButtonTriggered || {};
	options.ability = ability;
	options.activity = activity;
	options.hook = hook;
	options.ammo = ammunition;
	options.ammunition = sourceActor.items.get(ammunition)?.toObject();
	options.attackMode = attackMode;
	options.mastery = mastery;
	options.targets = messageTargets;
	const item = activity?.item;
	_collectActivityDamageTypes(activity, options); //adds options.defaultDamageType, options.damageTypes

	//these targets get the uuid of either the linked Actor or the TokenDocument if unlinked. Better use user targets
	//const targets = [...game.user.targets];
	const targets = game.user?.targets;
	const sourceToken = canvas.tokens.get(sourceTokenID); //Token5e
	let singleTargetToken = targets?.first();
	const needsTarget = settings.needsTarget;
	//to-do: add an override for 'force' and a keypress, so that one could "target" unseen tokens. Default to source then probably?
	const invalidTargets = !_hasValidTargets(activity, targets?.size, needsTarget);
	if (invalidTargets) {
		if (needsTarget !== 'source') return false;
		else singleTargetToken = undefined;
	}
	if (singleTargetToken) options.distance = _getDistance(sourceToken, singleTargetToken);
	let ac5eConfig = _getConfig(config, dialog, hook, sourceTokenID, singleTargetToken?.id, options, reEval);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message);
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: singleTargetToken });

	let nearbyFoe, inRange, range;
	if (settings.autoRangedCombined !== 'off' && singleTargetToken) {
		({ nearbyFoe, inRange, range } = _autoRanged(activity, sourceToken, singleTargetToken));
		//Nearby Foe
		if (nearbyFoe) {
			ac5eConfig.subject.disadvantage.push(_localize('AC5E.NearbyFoe'));
		}
		if (!config.workflow?.AoO && !inRange) {
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
	const modernRules = settings.dnd5eModernRules;
	//check for heavy item property
	const automateHeavy = settings.automateHeavy;
	if (automateHeavy) {
		const isHeavy = item?.system.properties.has('hvy');
		if (isHeavy) {
			const isSmall = modernRules ? (activity?.actionType === 'mwak' && sourceActor.system.abilities.str.value < 13) || (activity?.actionType === 'rwak' && sourceActor.system.abilities.dex.value < 13) : sourceToken.document.width * sourceToken.document.height * sourceToken.document.texture.scaleX * sourceToken.document.texture.scaleY < 1;
			if (isSmall) {
				const localizationStr = game.version > 13 ? 'DND5E.ITEM.Property.Heavy' : 'DND5E.Item.Property.Heavy';
				ac5eConfig.subject.disadvantage = ac5eConfig.subject.disadvantage.concat(`${_localize('DND5E.ItemWeaponProperties')}: ${_localize(localizationStr)}`);
			}
		}
	}
	if (settings.debug) console.warn('AC5E._preRollAttackV2:', { ac5eConfig });
	_calcAdvantageMode(ac5eConfig, config, dialog, message);
	return ac5eConfig; //return so if we retrigger the function manually we get updated results.
}

export function _preRollDamageV2(config, dialog, message, hook, reEval) {
	if (settings.debug) console.warn('AC5E._preRollDamageV2', hook, { config, dialog, message });
	const { subject: activity, subject: { actor: sourceActor, ability } = {}, rolls, attackMode, ammunition, mastery } = config || {};
	const {
		//these targets get the uuid of either the linked Actor or the TokenDocument if unlinked. Better use user targets for now, unless we don't care for multiple tokens of a linked actor.
		data: { /*flags: {dnd5e: {targets} } ,*/ speaker } = {},
	} = message || {};

	const chatButtonTriggered = getMessageData(config, hook);
	const { messageId, item, attackingActor, attackingToken, messageTargets, /*config: message?.config,*/ use, options = {} } = chatButtonTriggered || {};
	options.ammo = ammunition;
	options.ammunition = ammunition?.toObject(); //ammunition in damage is the Item5e
	options.attackMode = attackMode;
	options.mastery = mastery;
	options.activity = activity;
	options.hook = hook;
	options.targets = messageTargets;
	_collectRollDamageTypes(rolls, options); //adds options.defaultDamageType, options.damageTypes
	// options.spellLevel = use?.spellLevel;
	const sourceTokenID = speaker.token;
	const sourceToken = canvas.tokens.get(sourceTokenID);
	const targets = game.user?.targets;
	let singleTargetToken = targets?.first();
	const needsTarget = settings.needsTarget;

	//to-do: add an override for 'force' and a keypress, so that one could "target" unseen tokens. Default to source then probably?
	const invalidTargets = !_hasValidTargets(activity, targets?.size, needsTarget);
	if (invalidTargets) {
		if (needsTarget !== 'source') return false;
		else singleTargetToken = undefined;
	}
	if (singleTargetToken) options.distance = _getDistance(sourceToken, singleTargetToken);
	let ac5eConfig = _getConfig(config, dialog, hook, sourceTokenID, singleTargetToken?.id, options, reEval);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message);
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: singleTargetToken });

	_calcAdvantageMode(ac5eConfig, config, dialog, message);
	if (settings.debug) console.warn('AC5E._preRollDamageV2:', { ac5eConfig });
	return ac5eConfig; //we need to be returning the ac5eConfig object to re-eval when needed in the renderHijacks
}

export function _renderHijack(hook, render, elem) {
	let getConfigAC5E = hook === 'chat' ?
		render.rolls?.[0]?.options?.[Constants.MODULE_ID] ?? render.flags?.[Constants.MODULE_ID]:
		render.config?.rolls?.[0]?.options?.[Constants.MODULE_ID] ?? render.config?.[Constants.MODULE_ID];
	if (settings.debug) console.warn('AC5E._renderHijack:', { hook, render, elem });
	if (!getConfigAC5E) return;
	let { hookType, roller, tokenId, options } = getConfigAC5E || {};
	let targetElement, tooltip;
	if (hook === 'd20Dialog' || hook === 'damageDialog') {
		// need to check if the dialog title changed which means that we need to reavaluate everything with the new Ability probably
		if (getConfigAC5E.options.skill || getConfigAC5E.options.tool) {
			const selectedAbility = render.form.querySelector('select[name="ability"]').value;
			if (selectedAbility !== getConfigAC5E.options.ability) doDialogSkillOrToolRender(render, elem, getConfigAC5E, selectedAbility);
		} 
		else if (hook === 'damageDialog') doDialogDamageRender(render, elem, getConfigAC5E);
		else if (getConfigAC5E.hookType === 'attack') doDialogAttackRender(render, elem, getConfigAC5E);
		
		if (!hookType) return true;
		let tokenName;
		const title = elem.querySelector('header.window-header h1.window-title') ?? elem.querySelector('dialog.application.dnd5e2.roll-configuration .window-header .window-title');
		let newTitle;
		if (tokenId && (hookType === 'save' || hookType === 'check')) {
			const subtitleElement = elem.querySelector('.window-subtitle');
			const tokenName = canvas.tokens.get(tokenId)?.name;
			subtitleElement.textContent = `${tokenName}`;
		}
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
	} else if (hook === 'chat' && hookType !== 'use') {
		if (!['both', 'chat'].includes(settings.showTooltips)) return true;
		if (!game.user.isGM) {
			if (settings.showChatTooltips === 'none') return true;
			else if (settings.showChatTooltips === 'players' && !getConfigAC5E?.hasPlayerOwner) return true;
			else if (settings.showChatTooltips === 'owned' && getConfigAC5E?.ownership?.[game.user.id] !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) return true;
		}
		if (_activeModule('midi-qol')) {
			if (render?.rolls?.length > 1) {
				getConfigAC5E = [render?.rolls?.[0]?.options?.[Constants.MODULE_ID], render?.rolls?.[1]?.options?.[Constants.MODULE_ID], render?.rolls?.[2]?.options?.[Constants.MODULE_ID]];
				if (!getConfigAC5E?.[0]?.hookType) return true;
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
		if (maxExhaustion && exhaustionLevel < maxExhaustion) {
			await previousActor.update({
				'system.attributes.exhaustion': exhaustionLevel + 1,
			});

			let flavor = _localize('AC5E.EnvironmentalHazards.Suffocating');
			if (hasPHB) {
				const suffocationEntry = await fromUuid(SUFFOCATION_UUID);
				flavor = `<div align-text="center">${_localize('AC5E.EnvironmentalHazards.SettingsName')}</div>${suffocationEntry?.text?.content ?? flavor}`;
			}

			const enrichedHTML = (await TextEditorFn.enrichHTML(flavor)).replace(/<a[^>]*data-action="apply"[^>]*>.*?<\/a>/g, '');

			await ChatMessage.create({
				content: enrichedHTML,
				speaker: ChatMessage.getSpeaker({ token: previousToken }),
			});
		}
	}

	if (actor?.statuses.has('burning')) {
		let flavor = _localize('AC5E.EnvironmentalHazards.BurningHazard');
		if (hasPHB) {
			const burningEntry = await fromUuid(BURNING_UUID);
			flavor = `<div align-text="center">${_localize('AC5E.EnvironmentalHazards.SettingsName')}</div>${burningEntry?.text?.content ?? flavor}`;
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
	html = html instanceof HTMLElement ? html : html[0];
	renderChatTooltipsSettings(html);
	renderColoredButtonSettings(html);
}

function renderColoredButtonSettings(html) {
	const colorSettings = [
		{ key: 'buttonColorBackground', default: '#288bcc' },
		{ key: 'buttonColorBorder', default: '#f8f8ff' }, //using 'white' would trigger a console warning for not conforming to the required format, until you click out of the field.
		{ key: 'buttonColorText', default: '#f8f8ff' }, //this is Ghost White
	];
	for (let { key, default: defaultValue } of colorSettings) {
		const settingKey = `${Constants.MODULE_ID}.${key}`;
		const input = html.querySelector(`[name="${settingKey}"]`);
		if (!input) continue;

		const colorPicker = document.createElement('input');
		colorPicker.type = 'color';
		colorPicker.classList.add('color-picker');

		const updateColorPicker = () => {
			const val = input.value.trim().toLowerCase();
			const resolved = _getValidColor(val, defaultValue, game.user);
			if (['false', 'none', 'null', '0'].includes(resolved)) {
				colorPicker.style.display = 'none';
			} else {
				if (resolved !== val) {
					input.value = resolved;
					input.dispatchEvent(new Event('change'));
				}
				colorPicker.value = resolved;
				colorPicker.style.display = '';
			}
		};

		colorPicker.addEventListener('input', () => {
			input.value = colorPicker.value;
			input.dispatchEvent(new Event('change'));
		});

		input.addEventListener('input', () => {
			const val = input.value.trim().toLowerCase();
			const resolved = _getValidColor(val, defaultValue, game.user);

			if (['false', 'none', 'null', '0'].includes(resolved)) {
				colorPicker.style.display = 'none';
			} else {
				colorPicker.value = resolved;
				colorPicker.style.display = '';
			}
		});

		input.addEventListener('blur', () => {
			const raw = input.value.trim().toLowerCase();
			const resolved = _getValidColor(raw, defaultValue, game.user);

			if (['false', 'none', 'null', '0'].includes(resolved)) {
				colorPicker.style.display = 'none';

				input.value = resolved; // Normalize input display here
				game.settings.set(Constants.MODULE_ID, key, resolved);
			} else {
				input.value = resolved;
				colorPicker.value = resolved;
				colorPicker.style.display = '';
				game.settings.set(Constants.MODULE_ID, key, resolved);
			}
		});

		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') input.blur(); // triggers blur logic
		});

		input.insertAdjacentElement('afterend', colorPicker);
		updateColorPicker();
	}

	// Visibility toggle
	const toggle = html.querySelector(`[name="${Constants.MODULE_ID}.buttonColorEnabled"]`);
	if (toggle) {
		const updateVisibility = () => {
			const visible = toggle.checked;
			const keysToToggle = ['buttonColorBackground', 'buttonColorBorder', 'buttonColorText'];
			for (let key of keysToToggle) {
				const input = html.querySelector(`[name="${Constants.MODULE_ID}.${key}"]`);
				if (input) {
					const container = input.closest('.form-group') || input.parentElement;
					if (container) container.style.display = visible ? 'flex' : 'none';
				}
			}
		};
		toggle.addEventListener('change', updateVisibility);
		updateVisibility();
	}
}

function renderChatTooltipsSettings(html) {
	const tooltipSelect = html.querySelector(`[name="${Constants.MODULE_ID}.showTooltips"]`);
	const chatTooltipSelect = html.querySelector(`select[name="${Constants.MODULE_ID}.showChatTooltips"]`);
	const showNameTooltip = html.querySelector(`[name="${Constants.MODULE_ID}.showNameTooltips"]`);

	if (!tooltipSelect || !chatTooltipSelect || !showNameTooltip) return;

	function updateChatTooltipVisibility() {
		const val = tooltipSelect.value;
		const shouldShowChatTooltip = val === 'both' || val === 'chat';
		const shouldShowTooltip = val !== 'none';
		const containerChat = chatTooltipSelect.closest('.form-group') || chatTooltipSelect.parentElement;
		if (containerChat) containerChat.style.display = shouldShowChatTooltip ? 'flex' : 'none';
		const containerName = showNameTooltip.closest('.form-group') || showNameTooltip.parentElement;
		if (containerName) containerName.style.display = shouldShowTooltip ? 'flex' : 'none';
	}

	tooltipSelect.addEventListener('change', updateChatTooltipVisibility);
	updateChatTooltipVisibility();
}

function notifyPreUse(actorName, warning, type) {
	//warning 1: Warn, 2: Enforce ; type: Armor, Raging, Silenced, Incapacitated
	const key = `AC5E.ActivityUse.Type.${type}.${warning}`;
	return ui.notifications.warn(actorName ? `${actorName} ${_localize(key)}` : _localize(key));
}

export function _preConfigureInitiative(subject, rollConfig) {
	const hook = 'check';
	const subjectToken = subject.token?.object ?? subject.getActiveTokens()[0];
	const config = rollConfig.options;
	const options = {};
	options.isInitiative = true;
	options.hook = hook;
	const initAbility = rollConfig.data?.attributes?.init?.ability;
	const ability = initAbility === '' ? 'dex' : initAbility;
	options.ability = ability;
	let ac5eConfig = _getConfig(config, {}, hook, subjectToken?.id, undefined, options);
	//to-do: match the flags or init mode with the tooltip blurb
	if (subject?.flags?.dnd5e?.initiativeAdv || subject.system.attributes.init.roll.mode > 0) ac5eConfig.subject.advantage.push(_localize('DND5E.FlagsInitiativeAdv')); //to-do: move to setPieces
	if (subject?.flags?.dnd5e?.initiativeDisadv || subject.system.attributes.init.roll.mode < 0) ac5eConfig.subject.disadvantage.push(_localize('AC5E.FlagsInitiativeDisadv')); //to-do: move to setPieces
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken, opponentToken: undefined });

	//to-do: move to setPieces
	if (settings.autoArmor) {
		if (['dex', 'str'].includes(ability) && _autoArmor(subject).notProficient) ac5eConfig.subject.disadvantage.push(`${_localize(_autoArmor(subject).notProficient)} (${_localize('NotProficient')})`);
	}
	//to-do: move to setPieces
	if (_autoEncumbrance(subject, 'dex')) {
		ac5eConfig.subject.disadvantage.push(_i18nConditions('HeavilyEncumbered'));
	}
	let advantageMode = 0;
	if (ac5eConfig.subject.advantage.length || ac5eConfig.opponent.advantage.length) advantageMode += 1;
	if (ac5eConfig.subject.disadvantage.length || ac5eConfig.opponent.disadvantage.length) advantageMode -= 1;
	if (ac5eConfig.parts.length) rollConfig.parts = rollConfig.parts.concat(ac5eConfig.parts);
	if (advantageMode > 0) {
		rollConfig.advantageMode = 1;
		rollConfig.options.advantageMode = 1;
		rollConfig.advantage = true;
		rollConfig.disadvantage = false;
	} else if (advantageMode < 0) {
		rollConfig.advantageMode = -1;
		rollConfig.options.advantageMode = -1;
		rollConfig.advantage = false;
		rollConfig.disadvantage = true;
	} else if (advantageMode === 0) {
		rollConfig.advantageMode = 0;
		rollConfig.options.advantageMode = 0;
		rollConfig.advantage = false;
		rollConfig.disadvantage = false;
	}

	ac5eConfig.advantageMode = advantageMode;
	ac5eConfig.defaultButton = advantageMode === 0 ? 'normal' : advantageMode > 0 ? 'advantage' : 'disadvantage';
	_getTooltip(ac5eConfig);
	const ac5eConfigObject = { [Constants.MODULE_ID]: ac5eConfig };
	foundry.utils.mergeObject(rollConfig.options, ac5eConfigObject);
	if (settings.debug) console.warn('AC5E._preConfigureInitiative', { ac5eConfig });
	return ac5eConfig;
}

function doDialogAttackRender(dialog, elem, getConfigAC5E) {
	const selectedAmmunition = elem.querySelector('select[name="ammunition"]')?.value;
	const selectedAttackMode = elem.querySelector('select[name="attackMode"]')?.value;
	const selectedMastery = elem.querySelector('select[name="mastery"]')?.value;
	const hasAmmunition = getConfigAC5E.options.ammo;
	const hasAttackMode = getConfigAC5E.options.attackMode;
	const hasMastery = getConfigAC5E.options.mastery;
	const change = hasAmmunition && selectedAmmunition && hasAmmunition !== selectedAmmunition ? 'ammunition' : hasAttackMode && selectedAttackMode && hasAttackMode !== selectedAttackMode ? 'attackMode' : hasMastery && selectedMastery && hasMastery !== selectedMastery ? 'mastery' : false;
	if (!change) {
		if (hasAmmunition && selectedAmmunition) dialog.config.rolls[0].options[Constants.MODULE_ID].usedPartsAmmunition ??= dialog.config.rolls[0].options[Constants.MODULE_ID].parts;
		if (hasAttackMode) dialog.config.rolls[0].options[Constants.MODULE_ID].usedPartsAttackMode ??= dialog.config.rolls[0].options[Constants.MODULE_ID].parts;
		if (hasMastery) dialog.config.rolls[0].options[Constants.MODULE_ID].usedPartsMastery ??= dialog.config.rolls[0].options[Constants.MODULE_ID].parts;
		return;
	}
	const newConfig = dialog.config;
	if (selectedAmmunition) newConfig.ammunition = selectedAmmunition;
	if (selectedAttackMode) newConfig.attackMode = selectedAttackMode;
	if (selectedMastery) newConfig.mastery = selectedMastery;
	if (change === 'ammunition') newConfig.rolls[0].parts = newConfig.rolls[0].parts?.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.usedPartsAmmunition?.includes(part)) ?? [];
	if (change === 'attackMode') newConfig.rolls[0].parts = newConfig.rolls[0].parts?.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.usedPartsAttackMode?.includes(part)) ?? [];
	if (change === 'mastery') newConfig.rolls[0].parts = newConfig.rolls[0].parts?.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.usedPartsMastery?.includes(part)) ?? [];
	newConfig.advantage = undefined;
	newConfig.disadvantage = undefined;
	newConfig.rolls[0].options.advantageMode = 0;
	if (newConfig.midiOptions) {
		newConfig.midiOptions.isCritical = false;
		newConfig.midiOptions.advantage = false;
		newConfig.midiOptions.disadvantage = false;
	}
	newConfig.rolls[0].options.maximum = null;
	newConfig.rolls[0].options.minimum = null;
	const newDialog = { options: { window: { title: dialog.message.flavor }, advantageMode: 0, defaultButton: 'normal' } };
	const newMessage = dialog.message;
	getConfigAC5E = _preRollAttackV2(newConfig, newDialog, newMessage, 'attack');
	dialog.rebuild();
	dialog.render();
}

function doDialogDamageRender(dialog, elem, getConfigAC5E) {
	const rollsLength = dialog.config.rolls.length;
	const selects = Array.fromRange(rollsLength)
		.map((el) => {
			const labelSpan = elem.querySelector(`select[name="roll.${el}.damageType"]`)?.value;
			if (labelSpan) return labelSpan;

			// If there's no <select>, get the roll options damage type
			const damageType = dialog.config.rolls[el].options.type;
			if (damageType) return damageType;
		})
		.filter(Boolean);
	const formulas = Array.from(elem.querySelectorAll('.formula'))
		.map((el) => el.textContent?.trim())
		.filter(Boolean);

	const damageTypes = getConfigAC5E.options.damageTypes;
	const damageTypesArray = getConfigAC5E.options.selectedDamageTypes;
	const compared = compareArrays(damageTypesArray, selects);
	if (compared.equal) {
		dialog.config.rolls[0].options[Constants.MODULE_ID].usedParts ??= dialog.config.rolls[0].options[Constants.MODULE_ID].parts;
		return;
	}
	const newConfig = dialog.config;
	getConfigAC5E.options.defaultDamageType = undefined;
	getConfigAC5E.options.damageTypes = undefined;
	getConfigAC5E.options.selectedDamageTypes = undefined;

	const reEval = getConfigAC5E.reEval ?? {};
	reEval.initialDamages = getConfigAC5E.reEval?.initialDamages ?? selects;
	reEval.initialRolls = getConfigAC5E.reEval?.initialRolls ?? newConfig.rolls.map((roll) => ({ parts: roll.parts, options: { maximum: roll.options.maximum, minimum: roll.options.minimum } }));
	reEval.initialFormulas = getConfigAC5E.reEval?.initialFormulas ?? formulas;
	newConfig.rolls[compared.index].options.type = compared.selectedValue;
	const wasCritical = getConfigAC5E.preAC5eConfig.wasCritical;
	if (newConfig.midiOptions) newConfig.midiOptions.isCritical = wasCritical;
	for (let i = 0; i < rollsLength; i++) {
		newConfig.rolls[i].parts = reEval.initialRolls[i].parts;
		if (compared.index === i) newConfig.rolls[i].parts = newConfig.rolls[i].parts.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.[Constants.MODULE_ID]?.usedParts?.includes(part));
		newConfig.rolls[i].options.maximum = reEval.initialRolls[i].options.maximum;
		newConfig.rolls[i].options.minimum = reEval.initialRolls[i].options.minimum;
		newConfig.rolls[i].options.isCritical = wasCritical;
	}
	const newDialog = { options: { window: { title: dialog.message.flavor }, isCritical: wasCritical, defaultButton: wasCritical ? 'critical' : 'normal' } };
	const newMessage = dialog.message;
	getConfigAC5E = _preRollDamageV2(newConfig, newDialog, newMessage, 'damage', reEval);
	dialog.rebuild();
	dialog.render();
}

function doDialogSkillOrToolRender(dialog, elem, getConfigAC5E, selectedAbility) {
	const newConfig = dialog.config;
	newConfig.ability = selectedAbility;
	newConfig.advantage = undefined;
	newConfig.disadvantage = undefined;
	newConfig.rolls[0].options.advantageMode = 0;
	newConfig.rolls[0].parts = [];
	newConfig.rolls[0].options.maximum = null;
	newConfig.rolls[0].options.minimum = null;

	const newDialog = { options: { window: { title: dialog.message.flavor }, advantageMode: 0, defaultButton: 'normal' } };
	const newMessage = dialog.message;
	const reEval = getConfigAC5E.reEval ?? {};

	getConfigAC5E = _preRollAbilityTest(newConfig, newDialog, newMessage, 'check', reEval);
	dialog.rebuild();
	dialog.render();
}

function compareArrays(a, b) {
	const len = Math.max(a.length, b.length);
	for (let i = 0; i < len; i++) {
		if (a[i] !== b[i]) {
			return { equal: false, index: i, initialValue: a[i], selectedValue: b[i] };
		}
	}
	return { equal: true };
}
