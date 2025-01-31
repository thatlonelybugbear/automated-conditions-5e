import { _activeModule, _calcAdvantageMode, _getActionType, _getDistance, _hasAppliedEffects, _hasItem, _hasStatuses, _localize, _i18nConditions, _autoArmor, _autoEncumbrance, _autoRanged, _getTooltip, _getConfig, _setAC5eProperties, _systemCheck, _hasValidTargets } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
import { _ac5eChecks } from './ac5e-setpieces.mjs';

const settings = new Settings();

export function _rollFunctions(hook, ...args) {
	if (hook === 'activity') {
		const [activity, config, dialog, message] = args;
		return _preUseActivity(activity, config, dialog, message, hook);
	} else if (['conc', 'death', 'save'].includes(hook)) {
		const [config, dialog, message] = args;
		return _preRollSavingThrowV2(config, dialog, message, hook);
	} else if (hook === 'attack') {
		const [config, dialog, message] = args;
		return _preRollAttackV2(config, dialog, message, hook);
	} else if (hook === 'damage') {
		const [config, dialog, message] = args;
		return _preRollDamageV2(config, dialog, message, hook);
	} else if (['check', 'init', 'tool', 'skill'].includes(hook)) {
		const [config, dialog, message] = args;
		return _preRollAbilityTest(config, dialog, message, hook);
	}
}
function getMessageData(config) {
	const messageId = config?.event?.target?.closest?.('[data-message-id]')?.dataset?.messageId;
	const message = messageId ? game.messages.get(messageId) : false;
	const { activity: activityObj, item: itemObj, targets, messageType } = message?.flags?.dnd5e || {};
	const item = fromUuidSync(itemObj?.uuid);
	const activity = fromUuidSync(activityObj?.uuid);
	const { scene: sceneId, actor: actorId, token: tokenId, alias: tokenName } = message.speaker || {};
	const attackingToken = canvas.tokens.get(tokenId);
	const attackingActor = attackingToken?.actor ?? item?.actor;
	if (settings.debug) console.warn('AC5E getMessageData', messageId, item, attackingActor, tokenId);
	return {
		messageId,
		item,
		activity,
		attackingActor,
		attackingToken,
		targets,
		config: message?.config,
	};
}

export function _preRollSavingThrowV2(config, dialog, message, hook) {
	const options = {};
	options.deathSave = config.hookNames.includes('deathSave');
	options.concentrationSave = config.isConcentration;
	if (settings.debug) console.warn('ac5e _preRollSavingThrowV2:', hook, options, { config, dialog, message });
	const { subject: actor, ability, rolls, advantage: initialAdv, disadvantage: initialDis, tool, skill } = config || {};
	const { options: dialogOptions, configure /*applicationClass: {name: className}*/ } = dialog || {};
	const speaker = message?.data?.speaker;
	const rollTypeObj = message?.flags?.dnd5e?.roll;
	const messageType = message?.flags?.dnd5e?.messageType;
	const chatMessage = message?.document;
	const chatButtonTriggered = getMessageData(config);
	const activity = chatButtonTriggered?.activity;

	const sourceTokenID = speaker?.token;
	const sourceToken = canvas.tokens.get(sourceTokenID);
	let ac5eConfig = _getConfig(config, hook, sourceTokenID);
	if (ac5eConfig.returnEarly) {
		return _setAC5eProperties(ac5eConfig, config, dialog, message);
	}
	if (options.deathSave) {
		const hasAdvantage = actor.system.attributes.death?.roll?.mode === 1;
		const hasDisadvantage = actor.system.attributes.death?.roll?.mode === -1;
		if (hasAdvantage) ac5eConfig.source.advantage.push(_localize('DND5E.AdvantageMode'));
		if (hasDisadvantage) ac5eConfig.source.disadvantage.push(_localize('DND5E.AdvantageMode'));
	}

	if (options.concentrationSave) {
		if (_hasItem(actor, _localize('AC5E.WarCaster'))) ac5eConfig.source.advantage.push(_localize(itemName));
		const hasAdvantage = actor.system.attributes.concentration?.roll?.mode === 1;
		const hasDisadvantage = actor.system.attributes.concentration?.roll?.mode === -1;
		if (hasAdvantage) ac5eConfig.source.advantage.push(_localize('DND5E.AdvantageMode'));
		if (hasDisadvantage) ac5eConfig.source.disadvantage.push(_localize('DND5E.AdvantageMode'));
	}

	ac5eConfig = _ac5eChecks({ actor, token: sourceToken, ac5eConfig, hook, ability, activity, options });
	if (ac5eConfig.source.fail.length) {
		config.rolls[0].parts.push('-99');
		config.rolls[0].options.criticalSuccess = 21; //make it not crit)
	}
	_setAC5eProperties(ac5eConfig, config);
	return _calcAdvantageMode(ac5eConfig, config, dialog);
}

export function _preRollAbilityTest(config, dialog, message, hook) {
	const testInitiative = config.hookNames.includes('initiativeDialog');
	const { subject: actor, ability, rolls, advantage: initialAdv, disadvantage: initialDis, tool, skill } = config || {};
	const speaker = message?.data?.speaker;

	// const { options: dialogOptions, configure /*applicationClass: {name: className}*/ } = dialog || {};
	// const rollTypeObj = message?.flags?.dnd5e?.roll;
	// const messageType = message?.flags?.dnd5e?.messageType;
	// const chatMessage = message?.document;

	const sourceTokenID = speaker?.token;
	const sourceToken = canvas.tokens.get(sourceTokenID);

	let ac5eConfig = _getConfig(config, hook, sourceTokenID);

	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config);

	if (testInitiative && actor.flags.dnd5e.initiativeAdv) ac5eConfig.source.advantage.push(_localize('DND5E.FlagsInitiativeAdv'));
	ac5eConfig = _ac5eChecks({ actor, token: sourceToken, ac5eConfig, targetToken: undefined, targetActor: undefined, hook, ability, tool, skill, testInitiative });
	//check Auto Armor
	if (settings.autoArmor && ['dex', 'str'].includes(ability) && _autoArmor(actor).notProficient) {
		ac5eConfig.source.disadvantage.push(`${_localize(_autoArmor(actor).notProficient)} (${_localize('NotProficient')})`);
	}
	if (_autoEncumbrance(actor, ability)) {
		ac5eConfig.source.disadvantage.push(_i18nConditions('HeavilyEncumbered'));
	}
	_setAC5eProperties(ac5eConfig, config, dialog, message);
	if (ac5eConfig.source.fail.length) {
		config.rolls[0].parts.push('-99');
		config.rolls[0].options.criticalSuccess = 21; //make it not crit)
	}
	return _calcAdvantageMode(ac5eConfig, config, dialog, message);
}

export function _preRollAttackV2(config, dialog, message, hook) {
	if (settings.debug) console.warn('AC5e _preRollAttackV2', hook, { config, dialog, message });
	const {
		subject: { actor: sourceActor, /*type: actionType,*/ range: itemRange, ability },
		subject: activity,
		options,
		rolls,
	} = config || {}; //subject is an activity so no SYSTEM

	const {
		data: {
			speaker: { token: sourceTokenID },
		},
	} = message || {};

	const actionType = _getActionType(activity);

	//these targets get the uuid of either the linked Actor or the TokenDocument if unlinked. Better use user targets
	//const targets = [...game.user.targets];
	const targets = game.user.targets;
	const sourceToken = canvas.tokens.get(sourceTokenID); //Token5e
	const targetsSize = targets?.size; //targets?.length;
	const singleTargetToken = targets?.first(); //targets?.[0];
	const singleTargetActor = singleTargetToken?.actor;
	let ac5eConfig = _getConfig(config, hook, sourceTokenID, singleTargetToken?.id);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message);

	if (targetsSize != 1) {
		//to-do: Think about more than one targets
		//to-do: Add keybind to target unseen tokens when 'force' is selected.
		if (settings.needsTarget == 'force' && !_hasValidTargets(item, targetsSize, 'attack', 'enforce')) return false;
		if (settings.needsTarget == 'none' && !_hasValidTargets(item, targetsSize, 'attack', 'console')) return true;
	}
	ac5eConfig = _ac5eChecks({ actor: sourceActor, token: sourceToken, targetActor: singleTargetActor, targetToken: singleTargetToken, ac5eConfig, hook, ability: ability, distance: _getDistance(sourceToken, singleTargetToken), activity });

	let nearbyFoe, inRange, range;
	if (settings.autoRanged && actionType) {
		({ nearbyFoe, inRange, range } = _autoRanged(itemRange, sourceToken, singleTargetToken, actionType));
	}
	//Nearby Foe
	if (nearbyFoe) {
		ac5eConfig.source.disadvantage = ac5eConfig.source.disadvantage.concat('Nearby Foe');
	}
	if (!inRange) {
		ac5eConfig.source.fail = ac5eConfig.source.fail.concat(_localize('AC5E.OutOfRange'));
	}
	if (range === 'long') {
		ac5eConfig.source.disadvantage = ac5eConfig.source.disadvantage.concat(_localize('RangeLong'));
	}

	//check Auto Armor
	if (settings.autoArmor && ['dex', 'str'].includes(ability) && _autoArmor(sourceActor).notProficient) {
		ac5eConfig.source.disadvantage = ac5eConfig.source.disadvantage.concat(`${_localize(_autoArmor(sourceActor).notProficient)} (${_localize('NotProficient')})`);
	}
	if (_autoEncumbrance(sourceActor, ability)) {
		ac5eConfig.source.disadvantage = ac5eConfig.source.disadvantage.concat(_i18nConditions('HeavilyEncumbered'));
	}
	if (settings.debug) console.warn({ ac5eConfig });
	if (ac5eConfig.source.fail.length) {
		config.rolls[0].parts.push('-99');
		config.rolls[0].options.criticalSuccess = 21; //make it not crit)
	}
	_setAC5eProperties(ac5eConfig, config, dialog, message);
	return _calcAdvantageMode(ac5eConfig, config, dialog);
}

export function _preRollDamageV2(config, dialog, message, hook) {
	if (settings.debug) console.warn('_preRollDamageV2', hook, { config, dialog, message });
	const {
		subject: activity,
		subject: { actor: sourceActor, ability },
		rolls,
		attackMode,
		ammunition,
	} = config;
	const {
		//these targets get the uuid of either the linked Actor or the TokenDocument if unlinked. Better use user targets for now, unless we don't care for multiple tokens of a linked actor.
		data: { /*flags: {dnd5e: {targets} } ,*/ speaker },
	} = message;

	const sourceTokenID = speaker.token;
	const sourceToken = canvas.tokens.get(sourceTokenID);
	const targets = game.user?.targets;
	const targetsSize = targets?.size;
	const singleTargetToken = targets?.first(); //to-do: refactor for dnd5e 3.x target in messageData; flags.dnd5e.targets[0].uuid Actor5e#uuid not entirely useful.
	const singleTargetActor = singleTargetToken?.actor;
	if (targetsSize != 1) {
		//to-do: Think about more than one targets
		//to-do: Add keybind to target unseen tokens when 'force' is selected.
		if (settings.needsTarget == 'force' && !_hasValidTargets(item, targetsSize, 'damage', 'enforce')) return false;
		if (settings.needsTarget == 'none' && !_hasValidTargets(item, targetsSize, 'damage', 'console')) return true;
	}
	let ac5eConfig = _getConfig(config, hook, sourceTokenID, singleTargetToken?.id);
	if (ac5eConfig.returnEarly) {
		return _setAC5eProperties(ac5eConfig, config, dialog, message);
	}
	ac5eConfig = _ac5eChecks({ actor: sourceActor, token: sourceToken, targetActor: singleTargetActor, targetToken: singleTargetToken, ac5eConfig, hook, ability: ability, distance: _getDistance(sourceToken, singleTargetToken), activity });
	if (settings.debug) console.warn('preDamage ac5eConfig', ac5eConfig);
	_setAC5eProperties(ac5eConfig, config, dialog, message);
	if (ac5eConfig.source.critical.length || ac5eConfig.target.critical.length) {
		config.rolls[0].options.isCritical = true;
		if (_activeModule('midi-qol')) config.midiOptions.isCritical = true;
	}
	return true;
}

export function _preUseActivity(activity, usageConfig, dialogConfig, messageConfig, hook) {
	if (activity.type === 'check') return true; //maybe check for
	const { item, range: itemRange, attack, damage, type, target } = activity || {};
	const sourceActor = item.actor;
	if (settings.debug) console.warn('AC5e preUseActivity:', { item, sourceActor, activity, usageConfig, dialogConfig, messageConfig });
	if (!sourceActor) return;
	if (item.type == 'spell' && settings.autoArmorSpellUse !== 'off') {
		if (_autoArmor(sourceActor).notProficient) {
			if (settings.autoArmorSpellUse === 'warn') ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoArmorSpellUseChoicesWarnToast')}`);
			else if (settings.autoArmorSpellUse === 'enforce') {
				ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoArmorSpellUseChoicesEnforceToast')}`);
				return false;
			}
		}
		const incapacitatedCheck = sourceActor.statuses.has('incapacitated');
		const ragingCheck = sourceActor.appliedEffects.some((effect) => [_localize('AC5E.Raging'), _localize('AC5E.Rage')].includes(effect.name));
		const silencedCheck = item.system.properties.has('vocal') && sourceActor.statuses.has('silenced') && !sourceActor.appliedEffects.some((effect) => effect.name === _localize('AC5E.SubtleSpell')) && !sourceActor.flags?.[Constants.MODULE_ID]?.subtleSpell;
		if (incapacitatedCheck || ragingCheck || silencedCheck) {
			if (settings.autoArmorSpellUse === 'warn') {
				if (incapacitatedCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoIncapacitatedSpellUseChoicesWarnToast')}`);
				if (ragingCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoRagingSpellUseChoicesWarnToast')}`);
				if (silencedCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoSilencedSpellUseChoicesWarnToast')}`);
			} else if (settings.autoArmorSpellUse === 'enforce') {
				if (incapacitatedCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoIncapacitatedSpellUseChoicesEnforceToast')}`);
				if (ragingCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoRagingSpellUseChoicesEnforceToast')}`);
				if (silencedCheck) ui.notifications.warn(`${sourceActor.name} ${_localize('AC5E.AutoSilencedSpellUseChoicesEnforceToast')}`);
				return false;
			}
		}
	}
	if (!activity.parent.hasAttack && !activity.parent.activities.find((a) => a.damage?.parts?.length)) return true;
	//will cancel the Item use if the Item needs 1 target to function properly and none or more than 1 are selected.
	const targets = game.user?.targets;
	const targetsSize = targets?.size;
	//to-do: add an override for 'force' and a keypress, so that one could "target" unseen tokens. Default to source then probably?
	if (settings.needsTarget === 'force' && !_hasValidTargets(activity, targetsSize, 'pre', 'enforce')) return false;
	if (settings.needsTarget === 'none') return true;
	return true;
}
export function _renderHijack(hook, render, elem) {
	//function patchDialogTitles
	if (hook !== 'chat') {
		const title = elem.querySelector('header.window-header h1.window-title') ?? elem.querySelector('dialog.application.dnd5e2.roll-configuration .window-header .window-title');
		let newTitle;
		if (render.config?.isConcentration) newTitle = `${game.i18n.translations.DND5E.Concentration} ${game.i18n.translations.DND5E.AbbreviationDC}: ${render.config.target} (${render.config.ability.capitalize()})`;
		title.textContent = /*['attack', 'save'].includes(hookType) ?*/ newTitle ?? render.message?.data?.flavor ?? render.options?.title ?? game.i18n.translations.DND5E.InitiativeRoll; //: render.title;
	}
	const message = getMessageData(render.config);
	let getConfigAC5E;
	if (hook === 'd20Dialog') getConfigAC5E = render.config?.[Constants.MODULE_ID] ?? render?.options?.[Constants.MODULE_ID];
	else if (hook === 'chat') {
		if (game.modules.get('midi-qol')?.active && render?.rolls?.length > 1) {
			getConfigAC5E = [render?.rolls?.[0]?.options?.[Constants.MODULE_ID], render?.rolls?.[1]?.options?.[Constants.MODULE_ID]];
		} else getConfigAC5E = render?.flags?.[Constants.MODULE_ID] ?? render.rolls?.[0]?.options?.[Constants.MODULE_ID];
	} else getConfigAC5E = render?.options?.[Constants.MODULE_ID];
	if (settings.debug) {
		console.warn('hijack getConfigAC5E', getConfigAC5E ?? undefined);
		console.warn('ac5e hijack render:', render);
		console.warn('ac5e hijcak elem/elem[0]:', elem, elem[0]);
	}
	if (!getConfigAC5E) return true;
	if (settings.showTooltips == 'none' || (settings.showTooltips == 'chat' && render.collectionName !== 'messages') || (settings.showTooltips == 'dialog' && !render.options?.classes?.includes('ac5e dialog'))) return true;
	let targetElement;
	let hookType, roller;
	if (getConfigAC5E?.length) ({ hookType, roller } = getConfigAC5E[0] || {});
	else ({ hookType, roller } = getConfigAC5E);
	let tooltip = _getTooltip(getConfigAC5E);
	if (hook === 'chat') {
		if (roller == 'Core') {
			//should also work for Roll Groups not specifically called.
			if (['attack', 'damage'].includes(hookType)) {
				targetElement = elem.querySelector('.dice-formula');
			} else {
				targetElement = elem.querySelector('.message-content .dice-roll .dice-result .dice-formula') ?? elem.querySelector('.chat-message header .flavor-text');
			}
		} else if (roller == 'RSR') {
			if (['check', 'save'].includes(hookType)) targetElement = elem.querySelector(`.flavor-text`);
			else if (['attack'].includes(hookType)) {
				targetElement = elem.querySelector('.rsr-section-attack > .rsr-header > .rsr-title') ?? elem.querySelector('.rsr-title');
			} else if (['damage'].includes(hookType)) {
				targetElement = elem.querySelector('.rsr-section-damage > .rsr-header > .rsr-title') ?? elem.querySelector('.rsr-title');
			}
		} else if (roller == 'MidiQOL') {
			if (['check', 'save'].includes(hookType)) targetElement = elem.querySelector(`.flavor-text`) ?? elem.querySelector('.midi-qol-saves-display');
			if (['attack'].includes(hookType.toLocaleLowerCase())) {
				if (getConfigAC5E.length) {
					targetElement = [elem.querySelector('.midi-qol-attack-roll'), elem.querySelector('.midi-qol-damage-roll')];
					tooltip = [_getTooltip(getConfigAC5E[0]), _getTooltip(getConfigAC5E[1])];
				} else {
					targetElement = elem.querySelector('.midi-qol-attack-roll');
				}
				//to-do: add AC5E pill on Item card. Next release
			}
			if (['damage'].includes(hookType.toLocaleLowerCase())) targetElement = elem.querySelector('.midi-qol-damage-roll');
		}
	} else {
		if (tooltip === '') return true;
		if (!['activity', 'damage'].includes(hookType)) {
			const dialogElement = document.getElementById(elem.id);
			const advantageMode = render.rolls?.[0]?.options.advantageMode;
			if (advantageMode === 0) targetElement = elem.querySelector('nav.dialog-buttons button[data-action="normal"]');
			else if (advantageMode === -1) targetElement = elem.querySelector('nav.dialog-buttons button[data-action="disadvantage"]');
			else if (advantageMode === 1) targetElement = elem.querySelector('nav.dialog-buttons button[data-action="advantage"]');
			//	if (targetElement && !targetElement.innerHTML.includes('AC5E')) targetElement.innerHTML = `>AC5E<`;
		} else if (hookType === 'damage') {
			targetElement = elem.querySelector('button[data-action="critical"]');
			if (targetElement) {
				targetElement.focus(); //Critical is not focused; dnd5e issue.
			}
		} else {
			targetElement = elem[0].querySelector(`.dialog-button.${render.data.default}`);
		}
		if (targetElement && !targetElement.innerHTML.includes('>')) targetElement.innerHTML = `>${targetElement.innerHTML}<`;
		targetElement.style.color = 'white'; // Change text color
		targetElement.style.backgroundColor = game.user.color; // Change background color
	}
	if (settings.debug) {
		console.warn('ac5e hijack getTooltip', tooltip);
		console.warn('ac5e hijack targetElement:', targetElement);
	}
	if (tooltip === '') return true;
	if (targetElement?.length === 2) {
		targetElement[0].setAttribute('data-tooltip', tooltip[0]);
		targetElement[1].setAttribute('data-tooltip', tooltip[1]);
	} else if (targetElement) targetElement.setAttribute('data-tooltip', tooltip);
}
