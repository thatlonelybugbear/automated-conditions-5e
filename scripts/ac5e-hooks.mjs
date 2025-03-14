import { _activeModule, _calcAdvantageMode, _getActionType, _getDistance, _hasAppliedEffects, _hasItem, _hasStatuses, _localize, _i18nConditions, _autoArmor, _autoEncumbrance, _autoRanged, _getTooltip, _getConfig, _setAC5eProperties, _systemCheck, _hasValidTargets } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
import { _ac5eChecks } from './ac5e-setpieces.mjs';

const settings = new Settings();

export function _rollFunctions(hook, ...args) {
	if (hook === 'activity') {
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
	const { subject: targetActor, ability, rolls, advantage: initialAdv, disadvantage: initialDis, tool, skill } = config || {};
	const { options: dialogOptions, configure /*applicationClass: {name: className}*/ } = dialog || {};
	const speaker = message?.data?.speaker;
	const rollTypeObj = message?.flags?.dnd5e?.roll;
	const messageType = message?.flags?.dnd5e?.messageType;
	const chatMessage = message?.document;
	const chatButtonTriggered = getMessageData(config);
	const activity = chatButtonTriggered?.activity;

	const targetTokenId = speaker?.token;
	const targetToken = canvas.tokens.get(targetTokenId);
	let ac5eConfig = _getConfig(config, hook, undefined, targetTokenId, options);
	if (ac5eConfig.returnEarly) {
		return _setAC5eProperties(ac5eConfig, config, dialog, message);
	}
	if (options.deathSave) {
		const hasAdvantage = targetActor.system.attributes.death?.roll?.mode === 1;
		const hasDisadvantage = targetActor.system.attributes.death?.roll?.mode === -1;
		if (hasAdvantage) ac5eConfig.target.advantage.push(_localize('DND5E.AdvantageMode'));
		if (hasDisadvantage) ac5eConfig.target.disadvantage.push(_localize('DND5E.AdvantageMode'));
	}

	if (options.concentrationSave) {
		if (_hasItem(targetActor, _localize('AC5E.WarCaster'))) ac5eConfig.target.advantage.push(_localize(itemName));
		const hasAdvantage = targetActor.system.attributes.concentration?.roll?.mode === 1;
		const hasDisadvantage = targetActor.system.attributes.concentration?.roll?.mode === -1;
		if (hasAdvantage) ac5eConfig.target.advantage.push(_localize('DND5E.AdvantageMode'));
		if (hasDisadvantage) ac5eConfig.target.disadvantage.push(_localize('DND5E.AdvantageMode'));
	}

	ac5eConfig = _ac5eChecks({ targetActor, targetToken, ac5eConfig, hook, ability, activity, options });
	// if (ac5eConfig.source.fail.length) {
	// 	config.rolls[0].parts.push('-99');
	// 	config.rolls[0].options.criticalSuccess = 21; //make it not crit)
	// }
	_setAC5eProperties(ac5eConfig, config);
	return _calcAdvantageMode(ac5eConfig, config, dialog);
}

export function _preRollAbilityTest(config, dialog, message, hook) {
	const options = {};
	options.testInitiative = config.hookNames.includes('initiativeDialog');
	const { subject: targetActor, ability, rolls, advantage: initialAdv, disadvantage: initialDis, tool, skill } = config || {};
	const speaker = message?.data?.speaker;

	// const { options: dialogOptions, configure /*applicationClass: {name: className}*/ } = dialog || {};
	// const rollTypeObj = message?.flags?.dnd5e?.roll;
	// const messageType = message?.flags?.dnd5e?.messageType;
	// const chatMessage = message?.document;

	const targetTokenID = speaker?.token;
	const targetToken = canvas.tokens.get(targetTokenID);

	let ac5eConfig = _getConfig(config, hook, undefined, targetTokenID, options);

	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config);

	if (options.testInitiative && targetActor.flags.dnd5e.initiativeAdv) ac5eConfig.target.advantage.push(_localize('DND5E.FlagsInitiativeAdv')); //to-do: move to setPieces
	ac5eConfig = _ac5eChecks({ ac5eConfig, targetToken, targetActor, hook, ability, tool, skill, options });
	//check Auto Armor
	//to-do: move to setPieces
	if (settings.autoArmor && ['dex', 'str'].includes(ability) && _autoArmor(targetActor).notProficient) {
		ac5eConfig.target.disadvantage.push(`${_localize(_autoArmor(targetActor).notProficient)} (${_localize('NotProficient')})`);
	}
	//to-do: move to setPieces
	if (_autoEncumbrance(targetActor, ability)) {
		ac5eConfig.target.disadvantage.push(_i18nConditions('HeavilyEncumbered'));
	}
	_setAC5eProperties(ac5eConfig, config, dialog, message, options);
	// if (ac5eConfig.source.fail.length) {
	// 	config.rolls[0].parts.push('-99');
	// 	config.rolls[0].options.criticalSuccess = 21; //make it not crit)
	// }
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

	//const actionType = _getActionType(activity);

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
	let ac5eConfig = _getConfig(config, hook, sourceTokenID, targetToken?.id);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message);
	ac5eConfig = _ac5eChecks({ sourceActor, sourceToken, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity });
	if (settings.debug) console.warn('preDamage ac5eConfig', ac5eConfig);

	let nearbyFoe, inRange, range;
	if (settings.autoRangedCombined !== 'off' && targetToken) {
		({ nearbyFoe, inRange, range } = _autoRanged(activity, sourceToken, singleTargetToken));
		//Nearby Foe
		if (nearbyFoe) {
			ac5eConfig.source.disadvantage.push(_localize('AC5E.NearbyFoe'));
		}
		if (!inRange) {
			ac5eConfig.source.fail.push(_localize('AC5E.OutOfRange'));
		}
		if (range === 'long') {
			ac5eConfig.source.disadvantage.push(_localize('RangeLong'));
		}
	}

	//check Auto Armor
	if (settings.autoArmor && ['dex', 'str'].includes(ability) && _autoArmor(sourceActor).notProficient) {
		ac5eConfig.source.disadvantage = ac5eConfig.source.disadvantage.concat(`${_localize(_autoArmor(sourceActor).notProficient)} (${_localize('NotProficient')})`);
	}
	if (_autoEncumbrance(sourceActor, ability)) {
		ac5eConfig.source.disadvantage = ac5eConfig.source.disadvantage.concat(_i18nConditions('HeavilyEncumbered'));
	}
	if (settings.debug) console.warn({ ac5eConfig });
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
	let targetActor = singleTargetActor;
	let targetToken = singleTargetToken;
	let distance = _getDistance(sourceToken, singleTargetToken);
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
	let ac5eConfig = _getConfig(config, hook, sourceTokenID, targetToken?.id);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message);
	ac5eConfig = _ac5eChecks({ sourceActor, sourceToken, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity });
	if (settings.debug) console.warn('preDamage ac5eConfig', ac5eConfig);
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
	const { item, range: itemRange, attack, damage, type, target, ability } = activity || {};
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
	// to-do: check how can we add logic for testing all these based on selected types of activities and settings.needsTarget, to allow for evaluation of conditions and flags from
	/* 	const sourceToken = sourceActor.token?.object ?? sourceActor.getActiveTokens()[0];
	const targets = game.user?.targets;
	let ac5eConfig = _getConfig(usageConfig, hook, sourceToken?.id, game.user?.targets?.first()?.id, options);
	const singleTargetToken = targets?.first();
	const singleTargetActor = singleTargetToken?.actor;
	ac5eConfig = _ac5eChecks({ actor: sourceActor, token: sourceToken, targetActor: singleTargetActor, targetToken: singleTargetToken, ac5eConfig, hook, ability: ability, distance: _getDistance(sourceToken, singleTargetToken), activity });
	_setAC5eProperties(ac5eConfig, usageConfig, dialogConfig, messageConfig);
	if (ac5eConfig.source.fail.length || ac5eConfig.target.fail.length) {
		const failString = `${item.name} roll fails, due to the following effects`;
		const sourceString = ac5eConfig.source.fail.length ? `, on the sourceActor: ${ac5eConfig.source.fail.join(',')}` : ''
		const targetString = ac5eConfig.target.fail.length ? `, on the targetActor: ${ac5eConfig.target.fail.join(',')}!` : '!'
		ui.notifications.warn(failString + sourceString + targetString);
		return false;
	};
*/
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
	let getConfigAC5E, targetElement, hookType, roller, tooltip, message;
	if (render?.config) message = getMessageData(render.config);
	if (hook === 'd20Dialog' || hook === 'damageDialog') {
		getConfigAC5E = render.config?.[Constants.MODULE_ID] ?? render.config?.rolls?.[0]?.options?.[Constants.MODULE_ID];
		const { hookType, options } = getConfigAC5E || {};
		if (!hookType) return true;
		let tokenName;
		const title = elem.querySelector('header.window-header h1.window-title') ?? elem.querySelector('dialog.application.dnd5e2.roll-configuration .window-header .window-title');
		let newTitle;
		if (render.config?.isConcentration) newTitle = `${game.i18n.translations.DND5E.Concentration} ${game.i18n.translations.DND5E.AbbreviationDC}: ${render.config.target} (${render.config.ability.capitalize()})`;
		else newTitle = render.message?.data?.flavor ?? render.options?.title ?? game.i18n.translations.DND5E.InitiativeRoll;
		title.textContent = newTitle; //: render.title;
		if (getConfigAC5E?.tokenId && (hookType === 'save' || hookType === 'check')) {
			const subtitleElement = elem.querySelector('.window-subtitle');
			tokenName = canvas.tokens.get(getConfigAC5E.tokenId)?.name;
			subtitleElement.textContent = `${tokenName}`;
			subtitleElement.style.display = 'block'; // Force a new line
		} else if (getConfigAC5E?.options?.testInitiative) {
			const actorUuid = render.rolls?.[0]?.data?.actorUuid ?? render.config?.subject?.uuid;
			const actor = fromUuidSync(actorUuid);
			const tokenName = actor?.token?.name ?? actor?.getActiveTokens()?.[0]?.name;
			const subtitleElement = elem.querySelector('.window-subtitle');
			subtitleElement.textContent = `${tokenName}`;
			subtitleElement.style.display = 'block'; // Force a new line
		}
		if (!['both', 'dialog'].includes(settings.showTooltips)) return true;
		tooltip = _getTooltip(getConfigAC5E);
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
		} else targetElement = elem[0].querySelector(`.dialog-button.${render.data.default}`);
		if (!targetElement) return true;
		targetElement.style.color = settings.buttonColorText;
		targetElement.style.backgroundColor = settings.buttonColorBackground;
		targetElement.style.boxShadow = '1px 1px 3px rgba(0, 0, 0, 0.6), 2px 2px 6px rgba(0, 0, 0, 0.3)';
		targetElement.style.border = `1px solid ${settings.buttonColorBorder}`;
		targetElement.classList.add('ac5e-button');
		targetElement.setAttribute('data-tooltip', tooltip);
		targetElement.focus(); //midi for some reason doesn't focus on skills with advMode. //to-do check this and why Dodging rolls FF for Dex save
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
				//should also work for Roll Groups not specifically called.
				if (['attack', 'damage'].includes(hookType)) {
					targetElement = elem.querySelector('.dice-formula');
				} else {
					targetElement = elem.querySelector('.message-content .dice-roll .dice-result .dice-formula') ?? elem.querySelector('.chat-message header .flavor-text');
				}
			} else if (roller === 'RSR') {
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

	if (previousActor?.statuses.has('suffocation')) {
		const maxExhaustion = CONFIG.DND5E.conditionTypes?.exhaustion?.levels ?? 0;
		if (maxExhaustion) {
			await previousActor.update({
				'system.attributes.exhaustion': Math.min((previousActor.system.attributes.exhaustion ?? 0) + 1, maxExhaustion),
			});

			let flavor = `<p>_localize('AC5E.EnviromentalHazards.Suffocating')</p>`;
			if (hasPHB) {
				const suffocationEntry = await fromUuid(SUFFOCATION_UUID);
				flavor = suffocationEntry?.text?.content ?? flavor;
			}

			const enrichedHTML = (await TextEditor.enrichHTML(flavor)).replace(/<a[^>]*data-action="apply"[^>]*>.*?<\/a>/g, '');

			await ChatMessage.create({
				content: enrichedHTML,
				speaker: ChatMessage.getSpeaker({ token: previousToken }),
			});
		}
	}

	if (actor?.statuses.has('burning')) {
		let flavor = `<p>_localize('AC5E.EnviromentalHazards.BurningHazard')</p>`;
		if (hasPHB) {
			const burningEntry = await fromUuid(BURNING_UUID);
			flavor = burningEntry?.text?.content ?? flavor;
		}

		flavor = flavor.replace(/@UUID\[\.QxCrRcgMdUd3gfzz\]\{Prone\}/g, `@UUID[${PRONE_UUID}]{Prone}`);

		const enrichedHTML = await TextEditor.enrichHTML(flavor);
		const type = 'fire';

		if (!_activeModule('midi-qol')) {
			token.control();
			return new CONFIG.Dice.DamageRoll('1d4', actor?.getRollData(), {
				type,
				appearance: { colorset: type },
			}).toMessage({ content: enrichedHTML });
		} else {
			const damageRoll = await new Roll('1d4', actor?.getRollData(), {
				type,
				appearance: { colorset: type },
			}).toMessage({ content: enrichedHTML });
			const damage = damageRoll.rolls[0].total;

			const forceApply = MidiQOL.configSettings()?.autoApplyDamage?.includes('yes') ?? false;

			return MidiQOL.applyTokenDamage([{ type, damage }], damage, new Set([token]), null, null, { forceApply });
		}
	}

	return true;
}
