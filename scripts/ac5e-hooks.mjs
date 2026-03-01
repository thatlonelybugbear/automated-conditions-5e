import {
	_activeModule,
	_calcAdvantageMode,
	_collectActivityDamageTypes,
	_collectRollDamageTypes,
	_getActionType,
	_getActivityEffectsStatusRiders,
	_getDistance,
	_getTokenFromActor,
	_getValidColor,
	_hasAppliedEffects,
	_hasItem,
	_hasStatuses,
	_localize,
	_i18nConditions,
	_autoArmor,
	_autoRanged,
	getAlteredTargetValueOrThreshold,
	_getTooltip,
	_getConfig,
	_filterOptinEntries,
	_captureFrozenD20Baseline,
	_captureFrozenDamageBaseline,
	_restoreD20ConfigFromFrozenBaseline,
	_restoreDamageConfigFromFrozenBaseline,
	_setAC5eProperties,
	_systemCheck,
	_hasValidTargets,
	_getSafeUseConfig,
	_mergeUseOptions,
	_resolveUseMessageContext,
	_setUseConfigInflightCache,
} from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
import { _ac5eChecks, _applyPendingUses } from './ac5e-setpieces.mjs';

const settings = new Settings();
const _hookDebugEnabled = (flag) => Boolean(settings.debug || globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.[flag]);

export function _rollFunctions(hook, ...args) {
	if (hook === 'use') {
		const [activity, config, dialog, message] = args;
		return _preUseActivity(activity, config, dialog, message, hook);
	} else if (hook === 'postUse') {
		const [activity, usageConfig, results] = args;
		return _postUseActivity(activity, usageConfig, results, hook);
	} else if (hook === 'buildRoll') {
		const [app, config, formData, index] = args;
		return _buildRollConfig(app, config, formData, index, hook);
	} else if (hook === 'postRollConfig') {
		const [rolls, config, dialog, message] = args;
		return _postRollConfiguration(rolls, config, dialog, message, hook);
	} else if ([/*'conc', 'death', */ 'save'].includes(hook)) {
		const [config, dialog, message] = args;
		return _preRollSavingThrow(config, dialog, message, hook);
	} else if (hook === 'attack') {
		const [config, dialog, message] = args;
		return _preRollAttack(config, dialog, message, hook);
	} else if (hook === 'damage') {
		const [config, dialog, message] = args;
		return _preRollDamage(config, dialog, message, hook);
	} else if (['check' /*, 'init', 'tool', 'skill'*/].includes(hook)) {
		const [config, dialog, message] = args;
		return _preRollAbilityCheck(config, dialog, message, hook);
	} else if (hook === 'init') {
		const [actor, rollConfig] = args;
		return _preConfigureInitiative(actor, rollConfig, hook);
	} else if (hook === 'preCreateItem') {
		const [item, updates] = args;
		return _preCreateItem(item, updates, hook);
	}
}
function _resolveMessageFromConfig(config) {
	const eventMessageId = config?.event?.currentTarget?.dataset?.messageId ?? config?.event?.target?.closest?.('[data-message-id]')?.dataset?.messageId;
	const messageId = eventMessageId ?? config?.options?.messageId ?? config?.messageId;
	const messageUuid = config?.midiOptions?.itemCardUuid ?? config?.workflow?.itemCardUuid; //for midi
	const message =
		messageId ? game.messages.get(messageId)
		: messageUuid ? fromUuidSync(messageUuid)
		: config?.message;
	return { messageId, message };
}

function _resolveOriginatingMessageContext(message, { triggerMessageId, originatingMessageId } = {}) {
	return _resolveUseMessageContext({ message, messageId: triggerMessageId, originatingMessageId });
}

function _resolveDocumentFromRef(ref) {
	if (!ref) return null;
	const documentCls = foundry?.abstract?.Document;
	if (documentCls && ref instanceof documentCls) return ref;
	const uuid = typeof ref === 'string' ? ref : ref?.uuid;
	if (typeof uuid === 'string' && uuid.includes('.')) return fromUuidSync(uuid) ?? null;
	return null;
}

function _resolveActivityFromItem(item, activityRef) {
	if (!item || !activityRef) return null;
	const activities = item?.system?.activities;
	if (!activities) return null;
	const activityId = typeof activityRef === 'string' ? activityRef : activityRef?.id;
	const activityUuid = typeof activityRef === 'object' ? activityRef?.uuid : undefined;
	if (activityUuid) {
		const direct = fromUuidSync(activityUuid);
		if (direct) return direct;
	}
	if (!activityId) return null;
	return activities.get?.(activityId) ?? activities.find?.((entry) => entry?.id === activityId || entry?.identifier === activityId || entry?.name === activityId) ?? null;
}

function _resolveActivityItemUse({ config, message, originatingMessage, usageMessage, registryMessages, useConfig } = {}) {
	const candidates = [message, usageMessage, originatingMessage, ...(Array.isArray(registryMessages) ? registryMessages : [])].filter(Boolean);
	const sourceMessage =
		candidates.find((msg) => {
			const flags = msg?.flags?.dnd5e;
			return Boolean(flags?.activity?.uuid || flags?.item?.uuid || flags?.use);
		}) ?? message;
	const dnd5eFlags = sourceMessage?.flags?.dnd5e || {};
	const configOptions = config?.options ?? {};
	const originatingUseOptions = config?.originatingUseConfig?.options ?? configOptions?.originatingUseConfig?.options ?? {};
	const fallbackOptions = { ...(useConfig?.options ?? {}), ...originatingUseOptions };
	const fallbackUse = useConfig?.use ?? config?.originatingUseConfig?.use ?? configOptions?.originatingUseConfig?.use;
	const itemRef = dnd5eFlags?.item ?? configOptions?.item ?? fallbackOptions?.item;
	const activityRef = dnd5eFlags?.activity ?? configOptions?.activity ?? fallbackOptions?.activity;
	const use = dnd5eFlags?.use ?? configOptions?.use ?? fallbackUse ?? usageMessage?.flags?.dnd5e?.use ?? originatingMessage?.flags?.dnd5e?.use;
	let item = _resolveDocumentFromRef(itemRef);
	let activity = _resolveDocumentFromRef(activityRef);
	if (!activity && item) activity = _resolveActivityFromItem(item, activityRef);
	if (!item && activity?.item) item = activity.item;
	return { item, activity, use, sourceMessage };
}

function _buildMessageOptions({ config, hook, message, triggerMessageId, resolvedMessageId, useConfig, originatingMessage, activity, item, use }) {
	const options = {};
	//@to-do: retrieve the data from "messages.flags.dnd5e.use.consumed"
	//current workaround for destroy on empty removing the activity used from the message data, thus not being able to collect riderStatuses.
	if (!activity && message) foundry.utils.mergeObject(options, message?.flags?.[Constants.MODULE_ID]); //destroy on empty removes activity/item from message.

	options.d20 = {};
	if (hook === 'damage') {
		if (_activeModule('midi-qol')) {
			options.d20.attackRollTotal = config?.workflow?.attackTotal;
			options.d20.attackRollD20 = config?.workflow?.d20AttackRoll;
			options.d20.hasAdvantage = config?.workflow?.advantage;
			options.d20.hasDisadvantage = config?.workflow?.disadvantage;
			options.d20.isCritical = config?.midiOptions?.isCritical ?? config?.workflow?.isCritical;
			options.d20.isFumble = config?.midiOptions?.isFumble ?? config?.workflow?.isFumble;
		} else {
			const findRoll0 = game.messages.filter((m) => m.flags?.dnd5e?.originatingMessage === resolvedMessageId && m.flags?.dnd5e?.roll?.type !== 'damage').at(-1)?.rolls[0];
			options.d20.attackRollTotal = findRoll0?.total;
			options.d20.attackRollD20 = findRoll0?.d20?.total;
			options.d20.hasAdvantage = findRoll0?.options?.advantageMode > 0;
			options.d20.hasDisadvantage = findRoll0?.options?.advantageMode < 0;
			options.d20.isCritical = findRoll0?.isCritical ?? findRoll0?.options?.isCritical ?? config?.isCritical;
			options.d20.isFumble = findRoll0?.isFumble ?? findRoll0?.options?.isFumble ?? config?.isFumble;
		}
	}
	if (originatingMessage?.id) options.originatingMessageId = originatingMessage.id;
	if (originatingMessage?.speaker?.token) options.originatingSpeakerTokenId = originatingMessage.speaker.token;
	const originatingUseConfig = useConfig ? foundry.utils.duplicate(useConfig) : null;
	if (originatingUseConfig) {
		originatingUseConfig.options ??= {};
		_mergeUseOptions(options, originatingUseConfig.options);
		if (!originatingUseConfig.options.activity && activity) {
			originatingUseConfig.options.activity = {
				id: activity.id,
				type: activity.type,
				uuid: activity.uuid,
			};
		}
		const resolvedItem = item ?? activity?.item;
		if (!originatingUseConfig.options.item && resolvedItem) {
			originatingUseConfig.options.item = {
				id: resolvedItem.id,
				type: resolvedItem.type,
				uuid: resolvedItem.uuid,
			};
		}
	}
	if (originatingUseConfig) options.originatingUseConfig = originatingUseConfig;
	options.messageId = resolvedMessageId ?? triggerMessageId;
	options.spellLevel = hook !== 'use' && activity?.isSpell ? use?.spellLevel || item?.system.level : undefined;
	return options;
}

function _resolveAttackerContext(message, item) {
	const { scene: sceneId, actor: actorId, token: tokenId, alias: tokenName } = message?.speaker || {};
	const attackingToken = canvas.tokens.get(tokenId);
	const messageTargets = message?.data?.flags?.dnd5e?.targets ?? message?.flags?.dnd5e?.targets;
	const attackingActor = attackingToken?.actor ?? item?.actor;
	return { attackingActor, attackingToken, messageTargets, speaker: { sceneId, actorId, tokenId, tokenName } };
}

function getMessageData(config, hook) {
	const { messageId: triggerMessageId, message } = _resolveMessageFromConfig(config);
	const originatingMessageId = config?.options?.originatingMessageId ?? config?.originatingMessageId;
	const { message: resolvedMessage, registryMessages, originatingMessage, usageMessage, resolvedMessageId, useConfig } = _resolveOriginatingMessageContext(message, {
		triggerMessageId,
		originatingMessageId,
	});
	const { item, activity, use, sourceMessage } = _resolveActivityItemUse({ config, message: resolvedMessage, originatingMessage, usageMessage, registryMessages, useConfig });
	const primaryMessage = resolvedMessage ?? sourceMessage;
	const options = _buildMessageOptions({
		config,
		hook,
		message: primaryMessage,
		triggerMessageId,
		resolvedMessageId,
		useConfig,
		originatingMessage,
		activity,
		item,
		use,
	});
	const { attackingActor, attackingToken, messageTargets } = _resolveAttackerContext(primaryMessage, item);
	if (_hookDebugEnabled('getMessageDataHook'))
		console.warn('AC5E.getMessageData', {
			messageId: primaryMessage?.id,
			activity,
			item,
			attackingActor,
			attackingToken,
			messageTargets,
			config,
			messageConfig: primaryMessage?.config,
			use,
			options,
		});
	if (ac5e?.debugOriginatingUseConfig || _hookDebugEnabled('originatingUseConfig'))
		console.warn('AC5E originatingUseConfig', {
			hook,
			messageId: primaryMessage?.id,
			originatingMessageId: options.originatingMessageId,
			originatingUseConfig: options.originatingUseConfig,
		});
	return {
		messageId: primaryMessage?.id,
		message: primaryMessage,
		activity,
		item,
		attackingActor,
		attackingToken,
		messageTargets,
		config,
		messageConfig: primaryMessage?.config,
		use,
		options,
	};
}

function getTargets(message, { hook, activity } = {}) {
	const subjectTokenId = message?.speaker?.token;
	const messageTargets = message?.data?.flags?.dnd5e?.targets ?? message?.flags?.dnd5e?.targets;
	if (messageTargets?.length) {
		return messageTargets;
	}
	if (hook === 'save') {
		// @to-do: verify save target selection rules during live testing (AoE vs self vs manual target selection).
		if (activity?.target?.affects?.type === 'self') {
			const speakerToken = message?.speaker?.token ? canvas.tokens.get(message.speaker.token) : null;
			if (speakerToken?.actor) {
				const targets = [
					{
						ac: speakerToken.actor.system?.attributes?.ac?.value ?? null,
						uuid: speakerToken.actor.uuid,
						tokenUuid: speakerToken.document?.uuid,
						name: speakerToken.name,
						img: speakerToken.document?.texture?.src,
					},
				];
				return targets;
			}
		}
		if (!game.user?.targets?.size) return [];
	}
	const targets = [...game.user.targets].map((target) => ({
		ac: target.actor?.system?.attributes?.ac?.value ?? null,
		uuid: target.actor?.uuid,
		tokenUuid: target.document.uuid,
		name: target.name,
		img: target.document.texture.src,
	}));
	return targets;
}

function _isForcedSentinelAC(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) && Math.abs(numeric) === 999;
}

function _getLiveTargetAC(target = {}) {
	const tokenUuid = target?.tokenUuid ?? target?.token?.uuid;
	if (tokenUuid) {
		const tokenDoc = fromUuidSync(tokenUuid);
		const tokenActor = tokenDoc?.actor ?? tokenDoc?.object?.actor;
		const tokenAC = tokenActor?.system?.attributes?.ac?.value;
		if (Number.isFinite(Number(tokenAC))) return Number(tokenAC);
	}
	const actorUuid = target?.uuid;
	if (actorUuid) {
		const actor = fromUuidSync(actorUuid);
		const actorAC = actor?.system?.attributes?.ac?.value;
		if (Number.isFinite(Number(actorAC))) return Number(actorAC);
	}
	return null;
}

function hydrateTargetACs(targets = []) {
	if (!Array.isArray(targets)) return [];
	return targets.map((target) => {
		if (!target || typeof target !== 'object') return target;
		const liveAC = _getLiveTargetAC(target);
		if (liveAC !== null) return { ...target, ac: liveAC };
		if (_isForcedSentinelAC(target.ac)) return { ...target, ac: null };
		return target;
	});
}

function resolveTargets(message, messageTargets, { hook, activity } = {}) {
	const freshTargets = getTargets(message, { hook, activity });
	if (Array.isArray(freshTargets) && freshTargets.length) return hydrateTargetACs(freshTargets);
	if (Array.isArray(messageTargets)) return hydrateTargetACs(messageTargets);
	return [];
}

function syncResolvedTargetsToMessage(messageLike, targets) {
	if (!messageLike || !Array.isArray(targets)) return;
	try {
		foundry.utils.setProperty(messageLike, 'data.flags.dnd5e.targets', targets);
	} catch (_err) {
		// ignore immutable message-like payloads
	}
	try {
		foundry.utils.setProperty(messageLike, 'flags.dnd5e.targets', targets);
	} catch (_err) {
		// ignore immutable message-like payloads
	}
}

function syncTargetsToConfigAndMessage(config, ac5eConfig, targets, messageLike) {
	if (!Array.isArray(targets)) return;
	if (ac5eConfig && typeof ac5eConfig === 'object') {
		ac5eConfig.options ??= {};
		if (Object.isExtensible(ac5eConfig.options)) ac5eConfig.options.targets = foundry.utils.duplicate(targets);
	}
	const targetMessage = messageLike ?? getMessageForConfigTargets(config) ?? config;
	syncResolvedTargetsToMessage(targetMessage, targets);
	if (targetMessage?.updateSource instanceof Function) {
		try {
			targetMessage.updateSource({ 'flags.dnd5e.targets': targets });
		} catch (_err) {
			// ignore if message source is immutable in this flow
		}
	}
}

function refreshAttackTargetsForSubmission(dialog, config, ac5eConfig, messageLikeOverride) {
	if (!config || !ac5eConfig || ac5eConfig.hookType !== 'attack') return;
	if (Number.isInteger(ac5eConfig?.buildRollConfig?.index) && ac5eConfig.buildRollConfig.index !== 0) return;
	refreshAttackAutoRangeState(ac5eConfig, config);

	const messageLike = messageLikeOverride ?? getMessageForConfigTargets(config) ?? dialog?.message ?? config;
	const messageTargets = messageLike?.data?.flags?.dnd5e?.targets ?? messageLike?.flags?.dnd5e?.targets ?? [];
	const finalTargets = resolveTargets(messageLike, messageTargets, { hook: 'attack', activity: ac5eConfig.options?.activity });
	if (!finalTargets.length) return;

	syncTargetsToConfigAndMessage(config, ac5eConfig, finalTargets, messageLike);
	config.advantage = undefined;
	config.disadvantage = undefined;
	_calcAdvantageMode(ac5eConfig, config, undefined, undefined, { skipSetProperties: true });
	syncTargetsToConfigAndMessage(config, ac5eConfig, ac5eConfig.options?.targets ?? finalTargets, messageLike);
	if (ac5e?.debugTargets) {
		console.warn('AC5E targets postRollConfiguration refresh', {
			hook: ac5eConfig.hookType,
			targetCount: finalTargets.length,
			targetActorUuids: finalTargets.map((target) => target?.uuid).filter(Boolean),
			targetTokenUuids: finalTargets.map((target) => target?.tokenUuid).filter(Boolean),
		});
	}
}

function getBaseTargetADCValue(config, ac5eConfig) {
	const collectFinite = (values = []) => values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && !_isForcedSentinelAC(value));

	const hookType = ac5eConfig?.hookType;
	const useTargetAcs = hookType === 'attack' || hookType === 'damage';
	if (useTargetAcs) {
		const byTargets = collectFinite((ac5eConfig?.options?.targets ?? []).map((target) => target?.ac));
		if (byTargets.length) return Math.min(...byTargets);
	}

	const byPreTargets = collectFinite(Object.values(ac5eConfig?.preAC5eConfig?.baseTargetAcByKey ?? {}).map((entry) => entry?.ac));
	if (byPreTargets.length) return Math.min(...byPreTargets);

	const direct = collectFinite([ac5eConfig?.preAC5eConfig?.baseRoll0Options?.target, config?.rolls?.[0]?.options?.target, config?.rolls?.[0]?.target, config?.target]);
	if (direct.length) return direct[0];

	return 10;
}

function getMessageForConfigTargets(config) {
	const options = config?.options ?? {};
	const messageId = options?.messageId ?? config?.messageId;
	const directMessage = messageId ? game.messages.get(messageId) : undefined;
	const context = _resolveUseMessageContext({ message: directMessage, messageId, originatingMessageId: options?.originatingMessageId });
	return context?.originatingMessage ?? context?.message ?? directMessage;
}

function getSubjectTokenId(source) {
	return source?.speaker?.token ?? source?.data?.speaker?.token ?? source?.document?.speaker?.token ?? source?.config?.speaker?.token;
}

function getSubjectTokenIdFromConfig(config) {
	const tokenId = getSubjectTokenId(config);
	if (tokenId) return tokenId;
	const actor = config?.subject;
	return actor ? (_getTokenFromActor(actor)?.id ?? actor.getActiveTokens?.()?.[0]?.id) : undefined;
}

function getSubjectTokenForHook(hook, message, actor) {
	if (hook === 'save' || hook === 'check') {
		if (actor) return _getTokenFromActor(actor) ?? actor.getActiveTokens?.()?.[0];
	}
	const speakerTokenId = message?.speaker?.token;
	if (speakerTokenId) return canvas.tokens.get(speakerTokenId);
	if (actor) return _getTokenFromActor(actor) ?? actor.getActiveTokens?.()?.[0];
	return undefined;
}

function getOpponentTokenForSave(options, activity, subjectToken) {
	const useTokenId = options?.originatingSpeakerTokenId ?? options?.originatingUseConfig?.tokenId;
	if (useTokenId) {
		const token = canvas.tokens.get(useTokenId);
		if (token && token !== subjectToken) return token;
	}
	const activityActor = activity?.actor ?? activity?.item?.actor;
	const activityToken = activityActor ? (_getTokenFromActor(activityActor) ?? activityActor.getActiveTokens?.()?.[0]) : undefined;
	if (activityToken && activityToken !== subjectToken) return activityToken;
	const targetActorUuid = options?.targets?.[0]?.uuid;
	const targetActor = targetActorUuid ? fromUuidSync(targetActorUuid) : undefined;
	const targetToken = getSingleTargetToken(options?.targets) ?? targetActor?.getActiveTokens?.()?.[0];
	if (targetToken && targetToken !== subjectToken) return targetToken;
	return undefined;
}

function getSingleTargetToken(messageTargets) {
	if (!Array.isArray(messageTargets) || !messageTargets.length) return undefined;
	const tokenUuid = messageTargets[0]?.tokenUuid;
	if (!tokenUuid) return undefined;
	const tokenDoc = fromUuidSync(tokenUuid);
	return tokenDoc?.object ?? canvas.tokens?.get(tokenDoc?.id);
}

export function _preCreateItem(item, updates) {
	// if (_activeModule('dnd5e-scriptlets') && game.settings.get('dnd5e-scriptlets', 'UpdateCreatedOrigins')) return; //@to-do: integration with scriptlets when it's fixed
	const itemUuid = item.uuid;
	if (!itemUuid) return;
	const effects = foundry.utils.duplicate(item._source.effects);
	if (!effects.length) return;
	for (const e of effects) if (e.origin && e.origin !== itemUuid && e.type !== 'enchantment') e.origin = itemUuid; //make sure that we dont overwrite enchantment effects origins; might be from compendium template items
	item.updateSource({ effects });
}

export function _preUseActivity(activity, usageConfig, dialogConfig, messageConfig, hook) {
	if (activity.type === 'check') return true; //maybe check for
	const { item, range: itemRange, attack, damage, type, target, ability, skill, tool } = activity || {};
	const sourceActor = item.actor;
	if (_hookDebugEnabled('preUseActivityHook')) console.error('AC5e preUseActivity:', { item, sourceActor, activity, usageConfig, dialogConfig, messageConfig });
	if (!sourceActor) return;
	const options = {};
	options.ability = ability;
	options.skill = skill;
	options.tool = tool;
	options.hook = hook;
	options.activity = activity;
	options.targets = getTargets();
	_collectActivityDamageTypes(activity, options); //adds options.defaultDamageType, options.damageTYpes
	options.riderStatuses = _getActivityEffectsStatusRiders(activity);
	const useWarnings =
		settings.autoArmorSpellUse === 'off' ? false
		: settings.autoArmorSpellUse === 'warn' ? 'Warn'
		: 'Enforce';
	if (item.type === 'spell' && useWarnings) {
		const notProficient = _autoArmor(sourceActor).notProficient;
		const raging = sourceActor.appliedEffects.some((effect) => [_localize('AC5E.Raging'), _localize('AC5E.Rage')].includes(effect.name));
		const silenced =
			item.system.properties.has('vocal') &&
			sourceActor.statuses.has('silenced') &&
			!sourceActor.appliedEffects.some((effect) => effect.name === _localize('AC5E.SubtleSpell')) &&
			!sourceActor.flags?.[Constants.MODULE_ID]?.subtleSpell;
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
	const sourceToken = _getTokenFromActor(sourceActor) ?? sourceActor?.getActiveTokens?.()?.[0];

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
	const isTargetSelf = activity.target?.affects?.type === 'self';
	let targets = game.user?.targets;
	let singleTargetToken = isTargetSelf ? sourceToken : targets?.first();
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
	const subjectFail = _filterOptinEntries(ac5eConfig?.subject?.fail ?? [], ac5eConfig?.optinSelected);
	const opponentFail = _filterOptinEntries(ac5eConfig?.opponent?.fail ?? [], ac5eConfig?.optinSelected);
	const failEntries = [...subjectFail, ...opponentFail];
	if (failEntries.length && useWarnings) {
		const getChanceReason = (chanceData = {}) => {
			if (!chanceData || typeof chanceData !== 'object') return undefined;
			if (!chanceData.enabled || !chanceData.triggered) return undefined;
			const rolled = Number(chanceData.rolled);
			if (Number.isFinite(rolled)) return `rolled a ${Math.trunc(rolled)}`;
			return 'triggered';
		};
		const failDetails = failEntries
			.map((entry) => {
				if (!entry || typeof entry !== 'object') return { label: entry ? String(entry) : undefined, description: undefined, chanceReason: undefined };
				const label = entry?.label ?? entry?.name ?? entry?.id ?? entry?.bonus ?? entry?.modifier ?? entry?.set ?? entry?.threshold;
				const description = entry?.description !== undefined ? String(entry.description).trim() : undefined;
				const chanceReason = getChanceReason(entry?.chance);
				return { label: label !== undefined ? String(label) : undefined, description, chanceReason };
			})
			.filter((entry) => entry?.label || entry?.description || entry?.chanceReason);
		const failLabels = failDetails.map((entry) => entry.label).filter(Boolean);
		const failReasons = [...new Set(failDetails.flatMap((entry) => [entry.description, entry.chanceReason]).filter(Boolean))];
		const reasonText = failLabels.length ? ` (${failLabels.join(', ')})` : '';
		const reasonDetailText = failReasons.length ? ` Reason: ${failReasons.join('; ')}` : '';
		const failText = _localize('AC5E.Fail');
		const itemName = item?.name ?? 'activity';
		ui.notifications.warn(`AC5E: ${sourceActor.name} - ${itemName}: ${failText}${reasonText}${reasonDetailText}`);
		if (useWarnings === 'Enforce') return false;
	}
	// _calcAdvantageMode(ac5eConfig, usageConfig, dialogConfig, messageConfig);   //@to-do: Still need to make a better check for `use` checks in setpieces, but no need to altering advMode or bonus etc
	_setAC5eProperties(ac5eConfig, usageConfig, dialogConfig, messageConfig);
	return true;
}
//@to-do: validate need of this/seems to match fine without
function syncTargetADCToDialog(app, nextTarget) {
	const root = app?.form ?? app?.element?.[0] ?? app?.element;
	if (!root?.querySelectorAll) return;
	const selectors = [
		'input[name="target"]',
		'input[name="target.value"]',
		'input[name="rolls.0.target"]',
		'input[name="rolls.0.target.value"]',
		'input[name="rolls.0.options.target"]',
		'input[name="rolls.0.options.target.value"]',
	].join(', ');
	const nextValue = String(nextTarget);
	for (const input of root.querySelectorAll(selectors)) {
		if (!input || input.value === nextValue) continue;
		input.value = nextValue;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}
}

function getExistingRoll(config, index = 0) {
	if (!Array.isArray(config?.rolls)) return undefined;
	const roll = config.rolls[index];
	return roll && typeof roll === 'object' ? roll : undefined;
}

function getExistingRollOptions(config, index = 0) {
	const roll = getExistingRoll(config, index);
	const options = roll?.options;
	return options && typeof options === 'object' ? options : undefined;
}

const _defaultButtonFocusTimers = new WeakMap();

function enforceDefaultButtonFocus(root, button, { attempts = 10, delay = 60 } = {}) {
	if (!root || !button) return;
	const previousTimer = _defaultButtonFocusTimers.get(root);
	if (previousTimer) clearTimeout(previousTimer);
	const doc = root.ownerDocument ?? document;
	let remaining = Math.max(1, Number(attempts) || 1);
	const tick = () => {
		if (!root?.isConnected || !button?.isConnected) {
			_defaultButtonFocusTimers.delete(root);
			return;
		}
		if (doc?.activeElement !== button) {
			try {
				button.focus({ preventScroll: true });
			} catch (_err) {
				// ignore focus errors from detached/disabled elements
			}
		}
		remaining -= 1;
		if (remaining <= 0) {
			_defaultButtonFocusTimers.delete(root);
			return;
		}
		const timer = setTimeout(tick, Math.max(0, Number(delay) || 0));
		_defaultButtonFocusTimers.set(root, timer);
	};
	tick();
}

export function _buildRollConfig(app, config, formData, index, hook) {
	if (ac5e.buildDebug || _hookDebugEnabled('buildRollConfigHook')) console.warn('AC5E._buildRollConfig', { hook, app, config, formData, index });
	if (!config) return true;
	const options = config.options ?? (config.options = {});
	const ac5eConfig = options[Constants.MODULE_ID] ?? (options[Constants.MODULE_ID] = {});
	ac5eConfig.buildRollConfig = { hook, index };
	const activeHook = ac5eConfig.hookType ?? hook;
	const shouldSyncAttackTargets = activeHook === 'attack' || activeHook === 'damage';
	const targetMessage = getMessageForConfigTargets(config) ?? config;
	let resolvedTargets = [];
	if (shouldSyncAttackTargets) {
		const messageTargets = targetMessage?.data?.flags?.dnd5e?.targets ?? targetMessage?.flags?.dnd5e?.targets ?? [];
		resolvedTargets = resolveTargets(targetMessage, messageTargets, { hook: activeHook, activity: ac5eConfig.options?.activity });
		syncTargetsToConfigAndMessage(config, ac5eConfig, resolvedTargets, targetMessage);
	}
	if (ac5e?.debugTargets)
		console.warn('AC5E targets buildRollConfig', {
			hook: activeHook,
			subjectTokenId: ac5eConfig.tokenId ?? getSubjectTokenIdFromConfig(config),
			targetMessageId: targetMessage?.id,
			targetCount: resolvedTargets?.length ?? 0,
			targetTokenUuids: (resolvedTargets ?? []).map((target) => target?.tokenUuid).filter(Boolean),
		});
	if (ac5eConfig.hookType === 'damage') {
		const optins = getOptinsFromForm(formData);
		setOptinSelections(ac5eConfig, optins);
		applyOptinCriticalToDamageConfig(ac5eConfig, config, formData);
		if (config?.rolls?.length) {
			for (const roll of config.rolls) {
				if (!roll?.options) continue;
				roll.options[Constants.MODULE_ID] ??= {};
				roll.options[Constants.MODULE_ID].optinSelected = ac5eConfig.optinSelected;
			}
		}
	} else if (ac5eConfig.hookType && ['attack', 'save', 'check'].includes(ac5eConfig.hookType)) {
		if (index !== 0) return true;
		const preRestoreParts = _getD20ActivePartsSnapshot(config);
		_restoreD20ConfigFromFrozenBaseline(ac5eConfig, config);
		const preservedExternalParts = _collectPreservedExternalD20Parts(ac5eConfig, preRestoreParts);
		const optins = getOptinsFromForm(formData);
		setOptinSelections(ac5eConfig, optins);
		if (ac5eConfig.hookType === 'attack') refreshAttackAutoRangeState(ac5eConfig, config);
		if (ac5e?.debugTargetADC)
			console.warn('AC5E targetADC: buildRollConfig entries', {
				hook: ac5eConfig.hookType,
				subjectTargetADC: ac5eConfig?.subject?.targetADC,
				opponentTargetADC: ac5eConfig?.opponent?.targetADC,
				optins,
			});
		const targetADCEntries = getTargetADCEntriesForHook(ac5eConfig, ac5eConfig.hookType).filter((entry) => entry.optin);
		const derivedBaseTargetADC = getBaseTargetADCValue(config, ac5eConfig);
		if (ac5eConfig.optinBaseTargetADCValue === undefined || _isForcedSentinelAC(ac5eConfig.optinBaseTargetADCValue)) {
			ac5eConfig.optinBaseTargetADCValue = derivedBaseTargetADC;
		}
		if (targetADCEntries.length) {
			const selectedIds = new Set(Object.keys(optins).filter((key) => optins[key]));
			ac5eConfig.optinBaseTargetADC ??= Array.isArray(ac5eConfig.targetADC) ? [...ac5eConfig.targetADC] : [];
			const baseTargetADC = ac5eConfig.optinBaseTargetADC ?? [];
			const selectedValues = [];
			for (const entry of targetADCEntries) {
				if (!selectedIds.has(entry.id)) continue;
				const values = Array.isArray(entry.values) ? entry.values : [];
				for (const value of values) selectedValues.push(value);
			}
			ac5eConfig.targetADC = [...new Set(baseTargetADC.concat(selectedValues))];
			if (ac5e?.debugTargetADC) console.warn('AC5E targetADC: selected', { selectedIds: [...selectedIds], selectedValues, baseTargetADC, targetADC: ac5eConfig.targetADC });
			if (selectedValues.length) {
				const baseTarget = getBaseTargetADCValue(config, ac5eConfig);
				const type = ac5eConfig.hookType === 'attack' ? 'acBonus' : 'dcBonus';
				ac5eConfig.initialTargetADC = baseTarget;
				ac5eConfig.alteredTargetADC = getAlteredTargetValueOrThreshold(baseTarget, selectedValues, type);
			}
		} else if (ac5eConfig.optinBaseTargetADC) {
			ac5eConfig.targetADC = [...ac5eConfig.optinBaseTargetADC];
			ac5eConfig.alteredTargetADC = undefined;
			ac5eConfig.initialTargetADC = ac5eConfig.optinBaseTargetADCValue ?? ac5eConfig.initialTargetADC;
		}
		config.advantage = undefined;
		config.disadvantage = undefined;
		_calcAdvantageMode(ac5eConfig, config, undefined, undefined, { skipSetProperties: true });
		if (ac5eConfig.alteredTargetADC !== undefined) {
			const nextTarget = ac5eConfig.alteredTargetADC;
			config.target = nextTarget;
			const roll0Target = getExistingRoll(config, 0);
			if (roll0Target) {
				roll0Target.target = nextTarget;
				if (roll0Target.options && typeof roll0Target.options === 'object') {
					roll0Target.options.target = nextTarget;
				}
			}
			if (Object.isExtensible(options)) options.target = nextTarget;
			if (ac5eConfig.hookType === 'attack') {
				if (Array.isArray(ac5eConfig.options?.targets)) {
					for (const target of ac5eConfig.options.targets) {
						if (target && typeof target === 'object') target.ac = nextTarget;
					}
				}
			}
			if (formData?.object && typeof formData.object === 'object') {
				if ('target' in formData.object) formData.object.target = nextTarget;
				if ('target.value' in formData.object) formData.object['target.value'] = nextTarget;
				if ('rolls.0.target' in formData.object) formData.object['rolls.0.target'] = nextTarget;
				if ('rolls.0.target.value' in formData.object) formData.object['rolls.0.target.value'] = nextTarget;
				if ('rolls.0.options.target' in formData.object) formData.object['rolls.0.options.target'] = nextTarget;
				if ('rolls.0.options.target.value' in formData.object) formData.object['rolls.0.options.target.value'] = nextTarget;
			}
			syncTargetADCToDialog(app, nextTarget);
		} else if (ac5eConfig.optinBaseTargetADCValue !== undefined) {
			const baseTarget = getBaseTargetADCValue(config, ac5eConfig);
			ac5eConfig.optinBaseTargetADCValue = baseTarget;
			config.target = baseTarget;
			const roll0Target = getExistingRoll(config, 0);
			if (roll0Target) {
				roll0Target.target = baseTarget;
				if (roll0Target.options && typeof roll0Target.options === 'object') {
					roll0Target.options.target = baseTarget;
				}
			}
			if (Object.isExtensible(options)) options.target = baseTarget;
			if (ac5eConfig.hookType === 'attack') {
				if (Array.isArray(ac5eConfig.options?.targets)) {
					for (const target of ac5eConfig.options.targets) {
						if (target && typeof target === 'object') target.ac = baseTarget;
					}
				}
			}
			if (formData?.object && typeof formData.object === 'object') {
				if ('target' in formData.object) formData.object.target = baseTarget;
				if ('target.value' in formData.object) formData.object['target.value'] = baseTarget;
				if ('rolls.0.target' in formData.object) formData.object['rolls.0.target'] = baseTarget;
				if ('rolls.0.target.value' in formData.object) formData.object['rolls.0.target.value'] = baseTarget;
				if ('rolls.0.options.target' in formData.object) formData.object['rolls.0.options.target'] = baseTarget;
				if ('rolls.0.options.target.value' in formData.object) formData.object['rolls.0.options.target.value'] = baseTarget;
			}
			syncTargetADCToDialog(app, baseTarget);
		}
		if (ac5eConfig.hookType === 'attack') {
			syncTargetsToConfigAndMessage(config, ac5eConfig, ac5eConfig.options?.targets ?? [], targetMessage);
		}
		if (ac5e?.debugTargetADC)
			console.warn('AC5E targetADC: buildRollConfig target', {
				hook: ac5eConfig.hookType,
				configTarget: config.target,
				rollTarget: config?.rolls?.[0]?.target,
				rollOptionsTarget: config?.rolls?.[0]?.options?.target,
				alteredTargetADC: ac5eConfig.alteredTargetADC,
			});
		const roll0 = getExistingRoll(config, 0);
		const roll0Options = getExistingRollOptions(config, 0);
		const nextDefaultButton = ac5eConfig.defaultButton ?? 'normal';
		ac5eConfig.defaultButton = nextDefaultButton;
		if (Object.isExtensible(options)) {
			options.advantage = config.advantage;
			options.disadvantage = config.disadvantage;
			options.advantageMode = ac5eConfig.advantageMode ?? options.advantageMode;
			options.defaultButton = nextDefaultButton;
			config.options = options;
		}
		if (roll0Options && Object.isExtensible(roll0Options)) {
			roll0.options.advantage = config.advantage;
			roll0.options.disadvantage = config.disadvantage;
			roll0.options.advantageMode = options.advantageMode;
		}
		if (config?.rolls?.length) {
			for (const roll of config.rolls) {
				if (!roll?.options) continue;
				roll.options[Constants.MODULE_ID] ??= {};
				roll.options[Constants.MODULE_ID].optinSelected = ac5eConfig.optinSelected;
				roll.options[Constants.MODULE_ID].defaultButton = ac5eConfig.defaultButton;
				roll.options[Constants.MODULE_ID].advantageMode = ac5eConfig.advantageMode;
			}
		}
		const entries = getBonusEntriesForHook(ac5eConfig, ac5eConfig.hookType).filter((entry) => entry.optin);
		if (entries.length) {
			const selectedIds = new Set(Object.keys(optins).filter((key) => optins[key]));
			const partsToAdd = [];
			for (const entry of entries) {
				if (!selectedIds.has(entry.id)) continue;
				const values = Array.isArray(entry.values) ? entry.values : [];
				for (const value of values) partsToAdd.push(value);
			}
			ac5eConfig._lastAppliedD20OptinParts = [...partsToAdd];
			_appendPartsToD20Config(config, partsToAdd);
		} else {
			ac5eConfig._lastAppliedD20OptinParts = [];
		}
		_appendPartsToD20Config(config, preservedExternalParts);
	}
	return true;
}

export function _postRollConfiguration(rolls, config, dialog, message, hook) {
	if (ac5e.buildDebug || _hookDebugEnabled('postRollConfigurationHook')) console.warn('AC5E._postRollConfiguration', { hook, rolls, config, dialog, message });
	if (!config) return true;
	if (!Array.isArray(config?.rolls) && Array.isArray(rolls)) {
		config.rolls = rolls;
	}
	if (Array.isArray(rolls) && Array.isArray(config?.rolls) && rolls[0]?.options?.[Constants.MODULE_ID]) {
		const configRoll0Options = getExistingRollOptions(config, 0);
		if (configRoll0Options) configRoll0Options[Constants.MODULE_ID] = rolls[0].options[Constants.MODULE_ID];
	}

	const options = config.options ?? {};
	const ac5eConfig =
		rolls?.[0]?.options?.[Constants.MODULE_ID] ??
		config?.rolls?.[0]?.options?.[Constants.MODULE_ID] ??
		options[Constants.MODULE_ID] ??
		config?.[Constants.MODULE_ID] ??
		dialog?.config?.options?.[Constants.MODULE_ID];
	if (_activeModule('midi-qol') && ['attack', 'check', 'save'].includes(ac5eConfig?.hookType) && Array.isArray(rolls) && rolls[0]?.options) {
		const advModes = CONFIG?.Dice?.D20Roll?.ADV_MODE;
		const currentMode = rolls[0].options.advantageMode;
		const isNonNormalMode = advModes && (currentMode === advModes.ADVANTAGE || currentMode === advModes.DISADVANTAGE);
		if (isNonNormalMode) {
			const selected = ac5eConfig?.optinSelected ?? {};
			const countCollection = (value) =>
				typeof value?.size === 'number' ? value.size
				: Array.isArray(value) ? value.length
				: typeof value === 'string' ? (value.trim() ? 1 : 0)
				: 0;
			const subject = ac5eConfig?.subject ?? {};
			const opponent = ac5eConfig?.opponent ?? {};
			const hasAdvReasons =
				_filterOptinEntries(subject?.advantage ?? [], selected).length +
					_filterOptinEntries(opponent?.advantage ?? [], selected).length +
					countCollection(subject?.advantageNames) +
					countCollection(opponent?.advantageNames) >
				0;
			const hasDisReasons =
				_filterOptinEntries(subject?.disadvantage ?? [], selected).length +
					_filterOptinEntries(opponent?.disadvantage ?? [], selected).length +
					countCollection(subject?.disadvantageNames) +
					countCollection(opponent?.disadvantageNames) >
				0;
			const d20Dice = (Array.isArray(rolls[0].dice) ? rolls[0].dice : []).filter((die) => Number(die?.faces) === 20);
			const hasSingleD20Result = d20Dice.length && d20Dice.every((die) => !Array.isArray(die?.results) || die.results.length <= 1);
			if (hasAdvReasons && hasDisReasons && hasSingleD20Result) {
				rolls[0].options.advantageMode = advModes.NORMAL;
				rolls[0].options.advantage = true;
				rolls[0].options.disadvantage = true;
				const configRoll0Options = getExistingRollOptions(config, 0);
				if (configRoll0Options && typeof configRoll0Options === 'object') {
					configRoll0Options.advantageMode = advModes.NORMAL;
					configRoll0Options.advantage = true;
					configRoll0Options.disadvantage = true;
				}
				if (options && typeof options === 'object') {
					options.advantageMode = advModes.NORMAL;
					options.defaultButton = 'normal';
				}
				ac5eConfig.advantageMode = advModes.NORMAL;
				ac5eConfig.defaultButton = 'normal';
				if (_hookDebugEnabled('postRollConfigurationHook')) console.warn('AC5E postRollConfiguration normalized non-multi d20 advantageMode', { currentMode, roll: rolls[0] });
			}
		}
	}
	refreshAttackTargetsForSubmission(dialog, config, ac5eConfig, message);
	const currentTargets = message?.data?.flags?.dnd5e?.targets ?? ac5eConfig?.options?.targets ?? dnd5e.utils.getTargetDescriptors();
	if (ac5eConfig?.hookType === 'attack' && Array.isArray(currentTargets)) {
		const finiteAcs = currentTargets.map((target) => Number(target?.ac)).filter((value) => Number.isFinite(value));
		const nextTarget = finiteAcs.length ? Math.min(...finiteAcs) : undefined;

		if (nextTarget !== undefined) {
			if (Array.isArray(rolls)) {
				const roll0Options = rolls[0]?.options;
				if (roll0Options && typeof roll0Options === 'object') roll0Options.target = nextTarget;
			}
			const configRoll0Options = getExistingRollOptions(config, 0);
			if (configRoll0Options) configRoll0Options.target = nextTarget;
		}

		try {
			foundry.utils.setProperty(message, 'data.flags.dnd5e.targets', foundry.utils.duplicate(currentTargets));
		} catch (_err) {
			// ignore immutable message-like payloads
		}
	}
	if (!ac5eConfig?.pendingUses?.length) return true;
	if (ac5eConfig.pendingUsesApplied) return true;
	if (Array.isArray(rolls) && !rolls.length) return true;

	const optins = ac5eConfig.optinSelected ?? {};
	const selectedIds = new Set(Object.keys(optins).filter((key) => optins[key]));
	const pending = ac5eConfig.pendingUses.filter((entry) => !entry.optin || selectedIds.has(entry.id));
	if (!pending.length) {
		ac5eConfig.pendingUsesApplied = true;
		return true;
	}

	_applyPendingUses(pending);
	ac5eConfig.pendingUsesApplied = true;
	return true;
}

function getOptinsFromForm(formData) {
	const optins = { ...(formData?.object?.ac5eOptins ?? {}) };
	const raw = formData?.object ?? {};
	for (const [key, value] of Object.entries(raw)) {
		if (!key.startsWith('ac5eOptins.')) continue;
		const id = key.slice('ac5eOptins.'.length);
		optins[id] = !!value;
	}
	return optins;
}

export async function _postUseActivity(activity, usageConfig, results, hook) {
	const message = results?.message;
	const ac5eConfig = usageConfig?.[Constants.MODULE_ID];
	if (!message || !ac5eConfig) return true;

	const dnd5eUseFlag = message?.flags?.dnd5e;
	if (dnd5eUseFlag) {
		ac5eConfig.options ??= {};
		if (dnd5eUseFlag.use?.spellLevel !== undefined) ac5eConfig.options.spellLevel ??= dnd5eUseFlag.use.spellLevel;
		if (dnd5eUseFlag.scaling !== undefined) ac5eConfig.options.scaling ??= dnd5eUseFlag.scaling;
		if (Array.isArray(dnd5eUseFlag.use?.effects)) ac5eConfig.options.useEffects ??= foundry.utils.duplicate(dnd5eUseFlag.use.effects);
		if (Array.isArray(dnd5eUseFlag.targets)) ac5eConfig.options.targets ??= foundry.utils.duplicate(dnd5eUseFlag.targets);
		if (dnd5eUseFlag.activity) ac5eConfig.options.activity ??= foundry.utils.duplicate(dnd5eUseFlag.activity);
		if (dnd5eUseFlag.item) ac5eConfig.options.item ??= foundry.utils.duplicate(dnd5eUseFlag.item);
	}

	const safeUseConfig = _getSafeUseConfig(ac5eConfig);
	_setUseConfigInflightCache({
		messageId: message.id,
		originatingMessageId: message?.flags?.dnd5e?.originatingMessage,
		useConfig: safeUseConfig,
	});
	await message.setFlag(Constants.MODULE_ID, 'use', safeUseConfig);
	return true;
}

// export function _postConsumptionHook(activity, config, dialog, message) {
// 	const ac5eConfig = config[Constants.MODULE_ID] || {};
// 	if (settings.debug) console.warn('AC5E._postConsumptionHook', { activity, config, dialog, message, ac5eConfig });
// 	if (activity.isSpell) foundry.utils.mergeObject(ac5eConfig, { options: { spellLevel: dialog?.data?.flags?.use?.spellLevel || activity.item.system.level } });
// 	_setAC5eProperties(ac5eConfig, config, dialog, message);
// }

export function _preRollSavingThrow(config, dialog, message, hook) {
	const chatButtonTriggered = getMessageData(config, hook);
	const { messageId, message: resolvedMessage, item, activity, attackingActor, attackingToken, messageTargets, options = {}, use } = chatButtonTriggered || {};
	const messageForTargets = resolvedMessage ?? message;
	options.isDeathSave = config.hookNames.includes('deathSave');
	options.isConcentration = config.isConcentration;
	options.hook = hook;
	options.activity = activity;
	if (_hookDebugEnabled('preRollSavingThrowHook')) console.error('ac5e _preRollSavingThrow:', hook, options, { config, dialog, message });
	const { subject, ability, rolls } = config || {};
	options.ability = ability;
	options.targets = resolveTargets(messageForTargets, messageTargets, { hook, activity });
	_collectActivityDamageTypes(activity, options); //adds options.defaultDamageType, options.damageTYpes

	const { options: dialogOptions, configure /*applicationClass: {name: className}*/ } = dialog || {};
	const speaker = message?.speaker;
	const rollTypeObj = message?.flags?.dnd5e?.roll;

	const messageType = message?.flags?.dnd5e?.messageType;
	const chatMessage = message?.document;

	const subjectToken = getSubjectTokenForHook(hook, messageForTargets, subject);
	const subjectTokenId = subjectToken?.id;
	let opponentToken = getOpponentTokenForSave(options, activity, subjectToken);
	if (opponentToken === subjectToken) opponentToken = undefined;
	if (opponentToken && subjectToken) options.distance = _getDistance(opponentToken, subjectToken);
	if (ac5e?.debugTargets)
		console.warn('AC5E targets save', {
			subjectTokenId: subjectToken?.id,
			attackingTokenId: attackingToken?.id,
			opponentTokenId: opponentToken?.id,
			distance: options.distance,
			targetCount: options.targets?.length ?? 0,
			targetTokenUuids: (options.targets ?? []).map((target) => target?.tokenUuid).filter(Boolean),
		});
	let ac5eConfig = _getConfig(config, dialog, hook, subjectTokenId, opponentToken?.id, options);
	if (ac5eConfig.returnEarly) {
		return _setAC5eProperties(ac5eConfig, config, dialog, message);
	}
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken, opponentToken });
	_calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties: true });
	_captureFrozenD20Baseline(ac5eConfig, config);
	// dialog.configure = !ac5eConfig.fastForward;
	return _setAC5eProperties(ac5eConfig, config, dialog, message);
}

export function _preRollAbilityCheck(config, dialog, message, hook, reEval) {
	if (_hookDebugEnabled('preRollAbilityCheckHook')) console.warn('AC5E._preRollAbilityCheck:', { config, dialog, message });
	const chatButtonTriggered = getMessageData(config, hook);
	const { messageId, message: resolvedMessage, item, activity, attackingActor, attackingToken, messageTargets, options = {}, use } = chatButtonTriggered || {};
	const messageForTargets = resolvedMessage ?? message;
	options.isInitiative = config.hookNames.includes('initiativeDialog');
	if (options.isInitiative) return true;
	let ac5eConfig;
	const { subject, ability, rolls, advantage: initialAdv, disadvantage: initialDis, tool, skill } = config || {};
	const speaker = message?.speaker;
	options.skill = skill;
	options.tool = tool;
	options.ability = ability;
	options.hook = hook;
	options.activity = activity;
	options.targets = resolveTargets(messageForTargets, messageTargets, { hook, activity });
	_collectActivityDamageTypes(activity, options); //adds options.defaultDamageType, options.damageTYpes

	const subjectToken = getSubjectTokenForHook(hook, messageForTargets, subject);
	const subjectTokenId = subjectToken?.id;
	let opponentToken;
	//to-do: not ready for this yet. The following line would make it so checks would be perfomred based on target's data/effects
	// if (game.user.targets.size === 1) opponentToken = game.user.targets.first() !== subjectToken ? game.user.targets.first() : undefined;

	ac5eConfig = _getConfig(config, dialog, hook, subjectTokenId, opponentToken?.id, options);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message, options);

	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken, opponentToken });

	// if (dialog?.configure) dialog.configure = !ac5eConfig.fastForward;
	_calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties: true });
	_captureFrozenD20Baseline(ac5eConfig, config);
	_setAC5eProperties(ac5eConfig, config, dialog, message);
	if (_hookDebugEnabled('preRollAbilityCheckHook')) console.warn('AC5E._preRollAbilityCheck', { ac5eConfig });
	return ac5eConfig;
}

export function _preRollAttack(config, dialog, message, hook, reEval) {
	if (_hookDebugEnabled('preRollAttackHook')) console.error('AC5e _preRollAttack', hook, { config, dialog, message });
	const { subject: { actor: sourceActor, /*type: actionType,*/ range: itemRange, ability } = {}, subject: configActivity, rolls, ammunition, attackMode, mastery } = config || {};
	const {
		data: { speaker: { token: sourceTokenID } = {} },
	} = message || {};
	const chatButtonTriggered = getMessageData(config, hook);
	const { messageId, message: resolvedMessage, activity: messageActivity, attackingActor, attackingToken, messageTargets, /*config: message?.config,*/ use, options = {} } = chatButtonTriggered || {};
	const messageForTargets = resolvedMessage ?? message;
	const activity = messageActivity || configActivity;
	options.ability = ability;
	options.activity = activity;
	options.hook = hook;
	options.ammo = ammunition;
	options.ammunition = sourceActor.items.get(ammunition)?.toObject();
	options.attackMode = attackMode;
	const actionType = activity?.getActionType(attackMode);
	options.actionType = actionType;
	options.mastery = mastery;
	options.targets = resolveTargets(messageForTargets, messageTargets, { hook, activity });
	const item = activity?.item;
	_collectActivityDamageTypes(activity, options); //adds options.defaultDamageType, options.damageTypes

	//these targets get the uuid of either the linked Actor or the TokenDocument if unlinked. Better use user targets
	//const targets = [...game.user.targets];
	const sourceToken = getSubjectTokenForHook(hook, messageForTargets, sourceActor);
	const isTargetSelf = activity?.target?.affects?.type === 'self';
	let singleTargetToken = getSingleTargetToken(options.targets) ?? (isTargetSelf ? sourceToken : game.user?.targets?.first());
	const needsTarget = settings.needsTarget;
	//to-do: add an override for 'force' and a keypress, so that one could "target" unseen tokens. Default to source then probably?
	const invalidTargets = !_hasValidTargets(activity, options.targets?.length ?? game.user?.targets?.size, needsTarget);
	if (invalidTargets) {
		if (needsTarget !== 'source') return false;
		else singleTargetToken = undefined;
	}
	if (singleTargetToken) options.distance = _getDistance(sourceToken, singleTargetToken);
	if (ac5e?.debugTargets)
		console.warn('AC5E targets attack', {
			subjectTokenId: sourceToken?.id,
			opponentTokenId: singleTargetToken?.id,
			distance: options.distance,
			targetCount: options.targets?.length ?? 0,
			targetTokenUuids: (options.targets ?? []).map((target) => target?.tokenUuid).filter(Boolean),
		});
	let ac5eConfig = _getConfig(config, dialog, hook, sourceToken?.id, singleTargetToken?.id, options, reEval);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message);
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: singleTargetToken });

	let nearbyFoe, inRange, range, longDisadvantage = false, outOfRangeFail = false, outOfRangeFailSourceLabel;
	if (singleTargetToken) {
		ac5eConfig.subject.rangeNotes = [];
		({ nearbyFoe, inRange, range, longDisadvantage, outOfRangeFail, outOfRangeFailSourceLabel } = _autoRanged(activity, sourceToken, singleTargetToken, { ...options, ac5eConfig }));
		//Nearby Foe
		if (nearbyFoe) {
			ac5eConfig.subject.disadvantage.push(_localize('AC5E.NearbyFoe'));
		}
		if (!outOfRangeFail && !inRange && outOfRangeFailSourceLabel) {
			ac5eConfig.subject.rangeNotes.push(`${_localize('AC5E.OutOfRange')} fail suppressed: ${outOfRangeFailSourceLabel}`);
		}
		if (outOfRangeFail && !config.workflow?.AoO && !inRange) {
			ac5eConfig.subject.fail.push(_localize('AC5E.OutOfRange'));
		}
		if (range === 'long' && longDisadvantage) {
			ac5eConfig.subject.disadvantage.push(_localize('RangeLong'));
		}
	}

	const modernRules = settings.dnd5eModernRules;
	//check for heavy item property
	const automateHeavy = settings.automateHeavy;
	if (automateHeavy) {
		const isHeavy = item?.system.properties.has('hvy');
		if (isHeavy) {
			const isSmall =
				modernRules ?
					(actionType === 'mwak' && sourceActor.system.abilities.str.value < 13) || (actionType === 'rwak' && sourceActor.system.abilities.dex.value < 13)
				:	sourceToken.document.width * sourceToken.document.height * sourceToken.document.texture.scaleX * sourceToken.document.texture.scaleY < 1;
			if (isSmall) {
				const localizationStr = game.version > 13 ? 'DND5E.ITEM.Property.Heavy' : 'DND5E.Item.Property.Heavy';
				ac5eConfig.subject.disadvantage = ac5eConfig.subject.disadvantage.concat(`${_localize('DND5E.ItemWeaponProperties')}: ${_localize(localizationStr)}`);
			}
		}
	}
	if (_hookDebugEnabled('preRollAttackHook')) console.warn('AC5E._preRollAttack:', { ac5eConfig });
	_calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties: true });
	_captureFrozenD20Baseline(ac5eConfig, config);
	_setAC5eProperties(ac5eConfig, config, dialog, message);
	syncTargetsToConfigAndMessage(config, ac5eConfig, options.targets ?? [], messageForTargets);
	return ac5eConfig; //return so if we retrigger the function manually we get updated results.
}

export function _preRollDamage(config, dialog, message, hook, reEval) {
	if (_hookDebugEnabled('preRollDamageHook')) console.warn('AC5E._preRollDamage', hook, { config, dialog, message });
	const { subject: configActivity, subject: { actor: sourceActor, ability } = {}, rolls, attackMode, ammunition, mastery } = config || {};
	const {
		//these targets get the uuid of either the linked Actor or the TokenDocument if unlinked. Better use user targets for now, unless we don't care for multiple tokens of a linked actor.
		data: { /*flags: {dnd5e: {targets} } ,*/ speaker } = {},
	} = message || {};

	const chatButtonTriggered = getMessageData(config, hook);
	const { messageId, message: resolvedMessage, item, activity, attackingActor, attackingToken, messageTargets, /*config: message?.config,*/ use, options = {} } = chatButtonTriggered || {};
	const messageForTargets = resolvedMessage ?? message;
	options.ammo = ammunition;
	options.ammunition = ammunition?.toObject(); //ammunition in damage is the Item5e
	options.attackMode = attackMode;
	options.mastery = mastery;
	options.activity = activity;
	options.hook = hook;
	options.targets = resolveTargets(messageForTargets, messageTargets, { hook, activity });
	_collectRollDamageTypes(rolls, options); //adds options.defaultDamageType, options.damageTypes

	const sourceToken = getSubjectTokenForHook(hook, messageForTargets, sourceActor);
	const sourceTokenId = sourceToken?.id;
	const isTargetSelf = activity?.target?.affects?.type === 'self';
	let singleTargetToken = getSingleTargetToken(options.targets) ?? (isTargetSelf ? sourceToken : game.user?.targets?.first());
	const needsTarget = settings.needsTarget;

	//to-do: add an override for 'force' and a keypress, so that one could "target" unseen tokens. Default to source then probably?
	const invalidTargets = !_hasValidTargets(activity, options.targets?.length ?? game.user?.targets?.size, needsTarget);
	if (invalidTargets) {
		if (needsTarget !== 'source') return false;
		else singleTargetToken = undefined;
	}
	if (singleTargetToken) options.distance = _getDistance(sourceToken, singleTargetToken);
	if (ac5e?.debugTargets)
		console.warn('AC5E targets damage', {
			subjectTokenId: sourceToken?.id,
			opponentTokenId: singleTargetToken?.id,
			distance: options.distance,
			targetCount: options.targets?.length ?? 0,
			targetTokenUuids: (options.targets ?? []).map((target) => target?.tokenUuid).filter(Boolean),
		});
	let ac5eConfig = _getConfig(config, dialog, hook, sourceTokenId, singleTargetToken?.id, options, reEval);
	if (ac5eConfig.returnEarly) return _setAC5eProperties(ac5eConfig, config, dialog, message);
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: singleTargetToken });

	_calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties: true });
	applyOptinCriticalToDamageConfig(ac5eConfig, config);
	_captureFrozenDamageBaseline(ac5eConfig, config);
	_setAC5eProperties(ac5eConfig, config, dialog, message);
	if (_hookDebugEnabled('preRollDamageHook')) console.warn('AC5E._preRollDamage:', { ac5eConfig });
	return ac5eConfig; //we need to be returning the ac5eConfig object to re-eval when needed in the renderHijacks
}

export function _renderHijack(hook, render, elem) {
	let getConfigAC5E =
		hook === 'chat' ?
			(render.rolls?.[0]?.options?.[Constants.MODULE_ID] ?? render.flags?.[Constants.MODULE_ID])
		:	(render.config?.options?.[Constants.MODULE_ID] ?? render.config?.[Constants.MODULE_ID] ?? render.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]);
	if (_hookDebugEnabled('renderHijackHook')) console.warn('AC5E._renderHijack:', { hook, render, elem });
	if (!getConfigAC5E) return;
	let { hookType, roller, tokenId, options } = getConfigAC5E || {};
	let targetElement, tooltip;
	if (hook === 'd20Dialog' || hook === 'damageDialog') {
		// need to check if the dialog title changed which means that we need to reavaluate everything with the new Ability probably
		if (options?.skill || options?.tool) {
			const selectedAbility = render?.form?.querySelector?.('select[name="ability"]')?.value;
			if (selectedAbility && selectedAbility !== options?.ability) doDialogSkillOrToolRender(render, elem, getConfigAC5E, selectedAbility);
		} else if (hook === 'damageDialog') doDialogDamageRender(render, elem, getConfigAC5E);
		else if (getConfigAC5E.hookType === 'attack') doDialogAttackRender(render, elem, getConfigAC5E);
		if (hook === 'd20Dialog' && ['attack', 'save', 'check'].includes(getConfigAC5E.hookType) && !getConfigAC5E.options?.isInitiative) {
			renderOptionalBonusesRoll(render, elem, getConfigAC5E);
			const optinSelections = readOptinSelections(elem, getConfigAC5E);
			setOptinSelections(getConfigAC5E, optinSelections);
			if (render?.config) {
				_restoreD20ConfigFromFrozenBaseline(getConfigAC5E, render.config);
				getConfigAC5E.optinBaseTargetADCValue ??= render.config.target ?? render.config.rolls?.[0]?.options?.target ?? 10;
				render.config.advantage = undefined;
				render.config.disadvantage = undefined;
				_calcAdvantageMode(getConfigAC5E, render.config, undefined, undefined, { skipSetProperties: true });
				const targetADCEntries = getTargetADCEntriesForHook(getConfigAC5E, getConfigAC5E.hookType).filter((entry) => entry.optin);
				if (ac5e?.debugTargetADC) console.warn('AC5E targetADC: render entries', { hook: getConfigAC5E.hookType, targetADCEntries, optinSelected: getConfigAC5E.optinSelected });
				if (targetADCEntries.length) {
					const selectedIds = new Set(Object.keys(getConfigAC5E.optinSelected ?? {}).filter((key) => getConfigAC5E.optinSelected[key]));
					const selectedValues = [];
					for (const entry of targetADCEntries) {
						if (!selectedIds.has(entry.id)) continue;
						const values = Array.isArray(entry.values) ? entry.values : [];
						for (const value of values) selectedValues.push(value);
					}
					if (ac5e?.debugTargetADC) console.warn('AC5E targetADC: render selected', { selectedIds: [...selectedIds], selectedValues });
					if (selectedValues.length) {
						const baseTarget = getConfigAC5E.optinBaseTargetADCValue ?? 10;
						const type = getConfigAC5E.hookType === 'attack' ? 'acBonus' : 'dcBonus';
						const alteredTarget = getAlteredTargetValueOrThreshold(baseTarget, selectedValues, type);
						if (!isNaN(alteredTarget)) {
							render.config.target = alteredTarget;
							const roll0Target = getExistingRoll(render.config, 0);
							if (roll0Target) {
								roll0Target.target = alteredTarget;
								if (roll0Target.options && typeof roll0Target.options === 'object') {
									roll0Target.options.target = alteredTarget;
								}
							}
							if (getConfigAC5E.options?.targets?.length) {
								for (const target of getConfigAC5E.options.targets) {
									if (ac5e?.debugTargets)
										console.warn('AC5E targets render', {
											hook: getConfigAC5E.hookType,
											targetCount: getConfigAC5E.options?.targets?.length ?? 0,
											targetTokenUuids: (getConfigAC5E.options?.targets ?? []).map((t) => t?.tokenUuid).filter(Boolean),
											activeTargetUuid: target?.actor?.uuid,
										});
									if (target && typeof target === 'object') target.ac = alteredTarget;
								}
							}
							getConfigAC5E.alteredTargetADC = alteredTarget;
							getConfigAC5E.initialTargetADC = baseTarget;
						}
					}
				} else if (getConfigAC5E.optinBaseTargetADCValue !== undefined) {
					const baseTarget = getConfigAC5E.optinBaseTargetADCValue;
					render.config.target = baseTarget;
					const roll0Target = getExistingRoll(render.config, 0);
					if (roll0Target) {
						roll0Target.target = baseTarget;
						if (roll0Target.options && typeof roll0Target.options === 'object') {
							roll0Target.options.target = baseTarget;
						}
					}
					if (getConfigAC5E.options?.targets?.length) {
						for (const target of getConfigAC5E.options.targets) {
							if (target && typeof target === 'object') target.ac = baseTarget;
						}
					}
					getConfigAC5E.alteredTargetADC = undefined;
					getConfigAC5E.initialTargetADC = baseTarget;
				}
				const renderTargets = getConfigAC5E.options?.targets ?? [];
				syncTargetsToConfigAndMessage(render.config, getConfigAC5E, renderTargets, render.message);
			}
		}
		if (hook === 'damageDialog') {
			const currentSelections = readOptinSelections(elem, getConfigAC5E);
			setOptinSelections(getConfigAC5E, currentSelections);
			applyOptinCriticalToDamageConfig(getConfigAC5E, render.config);
			const isCritical = render?.config?.isCritical ?? getConfigAC5E?.isCritical;
			const hasCriticalAction = !!elem.querySelector('button[data-action="critical"]');
			getConfigAC5E.defaultButton = isCritical && hasCriticalAction ? 'critical' : 'normal';
		}

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
		if (render?.message?.data?.flags) {
			foundry.utils.mergeObject(render.message.data.flags, {
				[Constants.MODULE_ID]: { tooltipObj: getConfigAC5E.tooltipObj, hookType: getConfigAC5E.hookType },
			});
		} else if (render?.message) {
			foundry.utils.setProperty(render.message, 'data.flags', {
				[Constants.MODULE_ID]: { tooltipObj: getConfigAC5E.tooltipObj, hookType: getConfigAC5E.hookType },
			});
		}
		const ac5eForButton = render?.config?.options?.[Constants.MODULE_ID] ?? render?.config?.[Constants.MODULE_ID] ?? render?.config?.rolls?.[0]?.options?.[Constants.MODULE_ID] ?? getConfigAC5E;
		let defaultButton = ac5eForButton?.defaultButton ?? 'normal';
		const hasRequestedButton = !!elem.querySelector(`button[data-action="${defaultButton}"]`);
		if (!hasRequestedButton) {
			const fallbackButton = elem.querySelector('button[data-action="normal"]') ?? elem.querySelector('button[data-action]');
			defaultButton = fallbackButton?.dataset?.action ?? 'normal';
			if (ac5eForButton && typeof ac5eForButton === 'object') ac5eForButton.defaultButton = defaultButton;
		}
		const allButtons = elem.querySelectorAll('button[data-action]');
		for (const button of allButtons) {
			button.classList.remove('ac5e-button');
			button.style.backgroundColor = '';
			button.style.border = '';
			button.style.color = '';
		}
		targetElement = elem.querySelector(`button[data-action="${defaultButton}"]`);
		if (!targetElement) return true;
		enforceDefaultButtonFocus(elem, targetElement);
		if (settings.buttonColorEnabled) {
			if (settings.buttonColorBackground) targetElement.style.backgroundColor = settings.buttonColorBackground;
			if (settings.buttonColorBorder) targetElement.style.border = `1px solid ${settings.buttonColorBorder}`;
			if (settings.buttonColorText) targetElement.style.color = settings.buttonColorText;
			// if (game.settings.get('core', 'colorScheme') === 'light') targetElement.style.boxShadow = '1px 1px 3px rgba(0, 0, 0, 0.6), 2px 2px 6px rgba(0, 0, 0, 0.3)';
		}
		targetElement.classList.add('ac5e-button');
		targetElement.setAttribute('data-tooltip', tooltip);
		if (_hookDebugEnabled('renderHijackHook')) {
			console.warn('ac5e hijack getTooltip', tooltip);
			console.warn('ac5e hijack targetElement:', targetElement);
		}
		return true;
	} else if (hook === 'chat' && hookType !== 'use') {
		if (!['both', 'chat'].includes(settings.showTooltips)) return true;
		const messageFlags = render?.flags?.[Constants.MODULE_ID];
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
				tooltip = (messageFlags?.hookType === ac5eElement?.hookType && messageFlags?.tooltipObj?.[messageFlags.hookType]) || _getTooltip(ac5eElement);
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
			if (_hookDebugEnabled('renderHijackHook')) {
				console.warn('ac5e hijack getTooltip', tooltip);
				console.warn('ac5e hijack targetElement:', targetElement);
			}
			return true;
		} else {
			tooltip = messageFlags?.tooltipObj?.[messageFlags.hookType] || _getTooltip(getConfigAC5E);
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
			if (_hookDebugEnabled('renderHijackHook')) {
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
	if (ac5eConfig.returnEarly) {
		_getTooltip(ac5eConfig);
		const ac5eConfigObject = { [Constants.MODULE_ID]: ac5eConfig };
		foundry.utils.mergeObject(rollConfig.options, ac5eConfigObject);
		return ac5eConfig;
	}
	//to-do: match the flags or init mode with the tooltip blurb
	//v5.1.x the flags.dnd5e.initiaiveAdv/Disadv are no more, and they are getting automatically replaced by the system with system.attributes.init.roll.mode
	if (subject?.flags?.dnd5e?.initiativeAdv) ac5eConfig.subject.advantage.push(_localize('AC5E.FlagsInitiativeAdv')); //to-do: move to setPieces
	if (subject?.flags?.dnd5e?.initiativeDisadv) ac5eConfig.subject.disadvantage.push(_localize('AC5E.FlagsInitiativeDisadv')); //to-do: move to setPieces
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken, opponentToken: undefined });

	if (!foundry.utils.isEmpty(ac5eConfig.subject.noAdvantage)) {
		ac5eConfig.subject.advantage = [];
		ac5eConfig.opponent.advantage = [];
		ac5eConfig.subject.advantageNames = new Set();
		ac5eConfig.opponent.advantageNames = new Set();
	}
	if (!foundry.utils.isEmpty(ac5eConfig.subject.noDisadvantage)) {
		ac5eConfig.subject.disadvantage = [];
		ac5eConfig.opponent.disadvantage = [];
		ac5eConfig.subject.disadvantageNames = new Set();
		ac5eConfig.opponent.disadvantageNames = new Set();
	}
	const getCount = (value) =>
		typeof value?.size === 'number' ? value.size
		: Array.isArray(value) || typeof value === 'string' ? value.length
		: 0;
	const subjectAdvantageNamesCount = getCount(ac5eConfig.subject.advantageNames);
	const opponentAdvantageNamesCount = getCount(ac5eConfig.opponent.advantageNames);
	const subjectDisadvantageNamesCount = getCount(ac5eConfig.subject.disadvantageNames);
	const opponentDisadvantageNamesCount = getCount(ac5eConfig.opponent.disadvantageNames);
	let advantageMode = 0;
	if (ac5eConfig.subject.advantage.length || ac5eConfig.opponent.advantage.length || subjectAdvantageNamesCount || opponentAdvantageNamesCount) advantageMode += 1;
	if (ac5eConfig.subject.disadvantage.length || ac5eConfig.opponent.disadvantage.length || subjectDisadvantageNamesCount || opponentDisadvantageNamesCount) advantageMode -= 1;
	if (ac5eConfig.parts.length) rollConfig.parts = rollConfig.parts.concat(ac5eConfig.parts);
	if (advantageMode > 0) {
		rollConfig.options.advantage = true;
		rollConfig.options.disadvantage = false;
	} else if (advantageMode < 0) {
		rollConfig.options.advantage = false;
		rollConfig.options.disadvantage = true;
	} else if (advantageMode === 0) {
		rollConfig.options.advantage = true;
		rollConfig.options.disadvantage = true;
	}

	ac5eConfig.advantageMode = advantageMode;
	ac5eConfig.defaultButton =
		advantageMode === 0 ? 'normal'
		: advantageMode > 0 ? 'advantage'
		: 'disadvantage';
	_getTooltip(ac5eConfig);
	const ac5eConfigObject = { [Constants.MODULE_ID]: ac5eConfig };
	foundry.utils.mergeObject(rollConfig.options, ac5eConfigObject);
	if (_hookDebugEnabled('preConfigureInitiativeHook')) console.warn('AC5E._preConfigureInitiative', { ac5eConfig });
	return ac5eConfig;
}

function doDialogAttackRender(dialog, elem, getConfigAC5E) {
	const selectedAmmunition = elem.querySelector('select[name="ammunition"]')?.value;
	const selectedAttackMode = elem.querySelector('select[name="attackMode"]')?.value;
	const selectedMastery = elem.querySelector('select[name="mastery"]')?.value;
	const hasAmmunition = getConfigAC5E.options.ammo;
	const hasAttackMode = getConfigAC5E.options.attackMode;
	const hasMastery = getConfigAC5E.options.mastery;
	const change =
		hasAmmunition && selectedAmmunition && hasAmmunition !== selectedAmmunition ? 'ammunition'
		: hasAttackMode && selectedAttackMode && hasAttackMode !== selectedAttackMode ? 'attackMode'
		: hasMastery && selectedMastery && hasMastery !== selectedMastery ? 'mastery'
		: false;
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
	if (change === 'ammunition')
		newConfig.rolls[0].parts =
			newConfig.rolls[0].parts?.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.usedPartsAmmunition?.includes(part)) ?? [];
	if (change === 'attackMode')
		newConfig.rolls[0].parts =
			newConfig.rolls[0].parts?.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.usedPartsAttackMode?.includes(part)) ?? [];
	if (change === 'mastery')
		newConfig.rolls[0].parts =
			newConfig.rolls[0].parts?.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.usedPartsMastery?.includes(part)) ?? [];
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
	if (getConfigAC5E.options.targets) foundry.utils.setProperty(newMessage, 'data.flags.dnd5e.targets', getConfigAC5E.options.targets);
	getConfigAC5E = _preRollAttack(newConfig, newDialog, newMessage, 'attack');
	dialog.rebuild();
	dialog.render();
}

function doDialogDamageRender(dialog, elem, getConfigAC5E) {
	if (dialog._ac5eDamageRenderInProgress) return;
	dialog._ac5eDamageRenderInProgress = true;
	try {
		_restoreDamageConfigFromFrozenBaseline(getConfigAC5E, dialog.config);
		const frozenDamageBaseline = getConfigAC5E?.preAC5eConfig?.frozenDamageBaseline ?? getConfigAC5E?.frozenDamageBaseline;
		ensureDamagePreservedInitialData(getConfigAC5E, frozenDamageBaseline);
		renderOptionalBonusesDamage(dialog, elem, getConfigAC5E);
		setOptinSelections(getConfigAC5E, readOptinSelections(elem, getConfigAC5E));
		applyOptinCriticalToDamageConfig(getConfigAC5E, dialog.config);
		const currentCritical = getConfigAC5E.isCritical ?? dialog.config.isCritical ?? false;
		const previousCritical = getConfigAC5E._lastOptinCritical;
		getConfigAC5E._lastOptinCritical = currentCritical;
		if (previousCritical !== undefined && previousCritical !== currentCritical) {
			dialog.rebuild();
			dialog.render();
			return;
		}
		const rollsLength = dialog.config.rolls.length;
		const previousRollCount = getConfigAC5E._lastDamageRollCount ?? rollsLength;
		const baseFormulas =
			getConfigAC5E.preservedInitialData?.formulas ?? (getConfigAC5E.isCritical ? dialog.config.rolls.map((roll) => roll?.parts?.join(' + ') ?? roll?.formula).filter(Boolean) : undefined);
		const damageTypesByIndex = getDamageTypesByIndex(dialog, elem);
		const selects = Array.fromRange(rollsLength)
			.map((el) => {
				const labelSpan = elem.querySelector(`select[name="roll.${el}.damageType"]`)?.value;
				if (labelSpan) return labelSpan;
				return dialog.config.rolls[el].options.type;
			})
			.filter(Boolean);
		const domFormulas = Array.from(elem.querySelectorAll('.formula'))
			.map((el) => el.textContent?.trim())
			.filter(Boolean);
		const configFormulas = (dialog.config?.rolls ?? [])
			.map((roll) => roll?.formula ?? (Array.isArray(roll?.parts) ? roll.parts.join(' + ') : undefined))
			.filter((formula) => typeof formula === 'string' && formula.trim().length)
			.map((formula) => formula.trim());
		const formulas = configFormulas.length >= rollsLength || configFormulas.length > domFormulas.length ? configFormulas : domFormulas;

		const rollCountChanged = rollsLength !== previousRollCount;
		getConfigAC5E._lastDamageRollCount = rollsLength;
		if (rollCountChanged) {
			// Avoid rebuild loops when other modules add/remove damage rolls mid-render.
			getConfigAC5E.options.selectedDamageTypes = selects;
			const currentFormulas = formulas;
			if (getConfigAC5E.preservedInitialData) {
				const preserved = getConfigAC5E.preservedInitialData;
				const preservedLength = preserved.formulas.length;
				if (currentFormulas.length > preservedLength) {
					const newFormulas = currentFormulas.slice(preservedLength);
					if (ac5e?.debug.optins) {
					}
					preserved.formulas = preserved.formulas.concat(newFormulas);
					preserved.modified = preserved.modified.concat(newFormulas);
					const newAdditives = newFormulas.map(() => 0);
					const newMultipliers = newFormulas.map(() => 1);
					const newSteps = newFormulas.map(() => 0);
					const newFormulaOperators = newFormulas.map(() => []);
					const newOptinBonusParts = newFormulas.map(() => []);
					const activeAdditives = Array.isArray(preserved.activeExtraDice) ? preserved.activeExtraDice : [];
					const activeMultipliers = Array.isArray(preserved.activeExtraDiceMultipliers) ? preserved.activeExtraDiceMultipliers : [];
					const activeSteps = Array.isArray(preserved.activeDiceSteps) ? preserved.activeDiceSteps : [];
					const activeFormulaOperators = Array.isArray(preserved.activeFormulaOperators) ? preserved.activeFormulaOperators : [];
					const activeOptinBonusParts = Array.isArray(preserved.activeOptinBonusParts) ? preserved.activeOptinBonusParts : [];
					preserved.activeExtraDice = activeAdditives.concat(newAdditives);
					preserved.activeExtraDiceMultipliers = activeMultipliers.concat(newMultipliers);
					preserved.activeDiceSteps = activeSteps.concat(newSteps);
					preserved.activeFormulaOperators = activeFormulaOperators.concat(newFormulaOperators);
					preserved.activeOptinBonusParts = activeOptinBonusParts.concat(newOptinBonusParts);
				} else if (currentFormulas.length < preservedLength) {
					if (ac5e?.debug.optins) {
					}
					preserved.formulas = preserved.formulas.slice(0, currentFormulas.length);
					preserved.modified = preserved.modified.slice(0, currentFormulas.length);
					if (Array.isArray(preserved.activeExtraDice)) {
						preserved.activeExtraDice = preserved.activeExtraDice.slice(0, currentFormulas.length);
					}
					if (Array.isArray(preserved.activeExtraDiceMultipliers)) {
						preserved.activeExtraDiceMultipliers = preserved.activeExtraDiceMultipliers.slice(0, currentFormulas.length);
					}
					if (Array.isArray(preserved.activeDiceSteps)) {
						preserved.activeDiceSteps = preserved.activeDiceSteps.slice(0, currentFormulas.length);
					}
					if (Array.isArray(preserved.activeFormulaOperators)) {
						preserved.activeFormulaOperators = preserved.activeFormulaOperators.slice(0, currentFormulas.length);
					}
					if (Array.isArray(preserved.activeOptinBonusParts)) {
						preserved.activeOptinBonusParts = preserved.activeOptinBonusParts.slice(0, currentFormulas.length);
					}
				}
			} else if (currentFormulas.length) {
				getConfigAC5E.preservedInitialData = {
					formulas: [...currentFormulas],
					modified: [...currentFormulas],
					activeModifiers: '',
					activeExtraDice: currentFormulas.map(() => 0),
					activeExtraDiceMultipliers: currentFormulas.map(() => 1),
					activeDiceSteps: currentFormulas.map(() => 0),
					activeFormulaOperators: currentFormulas.map(() => []),
					activeOptinBonusParts: currentFormulas.map(() => []),
					activeAdvDis: '',
				};
			}
			if (!dialog._ac5eDamageRollCountRefreshQueued) {
				dialog._ac5eDamageRollCountRefreshQueued = true;
				Promise.resolve().then(() => {
					dialog._ac5eDamageRollCountRefreshQueued = false;
					dialog.rebuild();
					dialog.render();
				});
			}
			return;
		}

		const changed = applyOrResetFormulaChanges(elem, getConfigAC5E, 'apply', baseFormulas, damageTypesByIndex);
		const effectiveFormulas = getConfigAC5E.preservedInitialData?.modified ?? formulas;

		for (let i = 0; i < rollsLength; i++) {
			if (effectiveFormulas[i]) {
				dialog.config.rolls[i].formula = effectiveFormulas[i];
				dialog.config.rolls[i].parts = effectiveFormulas[i]
					.split('+')
					.map((p) => p.trim())
					.filter(Boolean);
			}
		}
		// Compare damage types
		const damageTypesArray = getConfigAC5E.options.selectedDamageTypes;
		const compared = compareArrays(damageTypesArray, selects);
		const damageTypesChanged = !compared.equal;

		// Case 1: Only modifiers/extra dice changed
		if (!damageTypesChanged && changed) {
			dialog.rebuild();
			dialog.render();
			return;
		}

		// Case 2: Nothing changed
		if (!damageTypesChanged && !changed) {
			dialog.config.rolls[0].options[Constants.MODULE_ID].usedParts ??= dialog.config.rolls[0].options[Constants.MODULE_ID].parts;
			return;
		}

		// Case 3: Damage type changed
		const newConfig = dialog.config;
		const currentRollsSnapshot = (newConfig.rolls ?? []).map((roll) => ({
			parts: Array.isArray(roll?.parts) ? [...roll.parts] : [],
			formula: roll?.formula,
			options: {
				maximum: roll?.options?.maximum,
				minimum: roll?.options?.minimum,
			},
		}));
		getConfigAC5E.options.defaultDamageType = undefined;
		getConfigAC5E.options.damageTypes = undefined;
		getConfigAC5E.options.selectedDamageTypes = undefined;

		const currentOptinSelections = readOptinSelections(elem, getConfigAC5E);
		setOptinSelections(getConfigAC5E, currentOptinSelections);
		applyOptinCriticalToDamageConfig(getConfigAC5E, newConfig);

		const reEval = getConfigAC5E.reEval ?? {};
		reEval.initialDamages = getConfigAC5E.reEval?.initialDamages ?? selects;
		reEval.initialRolls =
			getConfigAC5E.reEval?.initialRolls ??
			newConfig.rolls.map((roll) => ({
				parts: Array.isArray(roll?.parts) ? roll.parts : [],
				options: {
					maximum: roll?.options?.maximum,
					minimum: roll?.options?.minimum,
				},
			}));
		reEval.initialFormulas = getConfigAC5E.reEval?.initialFormulas ?? formulas;

		if (newConfig.rolls?.[compared.index]?.options) {
			newConfig.rolls[compared.index].options.type = compared.selectedValue;
		}
		const effectiveCritical = newConfig.isCritical ?? getConfigAC5E.isCritical ?? getConfigAC5E.preAC5eConfig?.wasCritical ?? false;
		if (newConfig.midiOptions) newConfig.midiOptions.isCritical = effectiveCritical;
		const rollCriticalByIndex = Array.isArray(getConfigAC5E.damageRollCriticalByIndex) ? getConfigAC5E.damageRollCriticalByIndex : [];
		const preservedBaseFormulas = Array.isArray(getConfigAC5E.preservedInitialData?.formulas) ? getConfigAC5E.preservedInitialData.formulas : [];

		for (let i = 0; i < rollsLength; i++) {
			const roll = newConfig.rolls[i];
			if (!roll) continue;
			const baseFormula = preservedBaseFormulas?.[i] ?? reEval.initialFormulas?.[i] ?? currentRollsSnapshot?.[i]?.formula;
			if (typeof baseFormula === 'string' && baseFormula.trim().length) {
				roll.formula = baseFormula;
				roll.parts = baseFormula
					.split('+')
					.map((part) => part.trim())
					.filter(Boolean);
			} else {
				const initialParts = Array.isArray(reEval.initialRolls?.[i]?.parts) ? [...reEval.initialRolls[i].parts] : [];
				const currentParts = Array.isArray(currentRollsSnapshot?.[i]?.parts) ? [...currentRollsSnapshot[i].parts] : [];
				roll.parts = initialParts.length ? initialParts : currentParts;
				if (roll.parts.length) roll.formula = roll.parts.join(' + ');
			}
			if (roll.options) {
				roll.options.maximum = currentRollsSnapshot?.[i]?.options?.maximum ?? reEval.initialRolls?.[i]?.options?.maximum;
				roll.options.minimum = currentRollsSnapshot?.[i]?.options?.minimum ?? reEval.initialRolls?.[i]?.options?.minimum;
				roll.options.isCritical = rollCriticalByIndex[i] ?? effectiveCritical;
			}
		}

		const newDialog = {
			options: {
				window: { title: dialog.message.flavor },
				isCritical: effectiveCritical,
				defaultButton: effectiveCritical ? 'critical' : 'normal',
			},
		};
		const newMessage = dialog.message;

		// Rebuild baseline for the new damage profile without optins, then re-apply current selections.
		setOptinSelections(getConfigAC5E, {});
		getConfigAC5E = _preRollDamage(newConfig, newDialog, newMessage, 'damage', reEval);
		setOptinSelections(getConfigAC5E, currentOptinSelections);
		applyOptinCriticalToDamageConfig(getConfigAC5E, dialog.config);
		const nextDamageTypesByIndex = Array.isArray(damageTypesByIndex) ? [...damageTypesByIndex] : [];
		if (Number.isInteger(compared?.index) && compared?.selectedValue) nextDamageTypesByIndex[compared.index] = compared.selectedValue;

		applyOrResetFormulaChanges(elem, getConfigAC5E, 'apply', baseFormulas, nextDamageTypesByIndex);

		dialog.rebuild();
		dialog.render();
	} finally {
		dialog._ac5eDamageRenderInProgress = false;
	}
}

function getDamageBaselineFormulas(baseline) {
	const rolls = Array.isArray(baseline?.rolls) ? baseline.rolls : [];
	return rolls
		.map((roll) =>
			typeof roll?.formula === 'string' ? roll.formula
			: Array.isArray(roll?.parts) && roll.parts.length ? roll.parts.join(' + ')
			: undefined,
		)
		.filter((formula) => typeof formula === 'string' && formula.trim().length);
}

function ensureDamagePreservedInitialData(ac5eConfig, baseline) {
	if (!ac5eConfig) return;
	const baselineFormulas = getDamageBaselineFormulas(baseline);
	if (!baselineFormulas.length) return;
	const profileKey = baseline?.profileKey ?? '__default__';
	const previousProfileKey = ac5eConfig._preservedInitialDataProfileKey ?? '__default__';
	const existingLength = Array.isArray(ac5eConfig?.preservedInitialData?.formulas) ? ac5eConfig.preservedInitialData.formulas.length : 0;
	if (ac5eConfig.preservedInitialData && previousProfileKey === profileKey && existingLength >= baselineFormulas.length) return;
	ac5eConfig.preservedInitialData = {
		formulas: [...baselineFormulas],
		modified: [...baselineFormulas],
		activeModifiers: '',
		activeExtraDice: baselineFormulas.map(() => 0),
		activeExtraDiceMultipliers: baselineFormulas.map(() => 1),
		activeDiceSteps: baselineFormulas.map(() => 0),
		activeFormulaOperators: baselineFormulas.map(() => []),
		activeOptinBonusParts: baselineFormulas.map(() => []),
		activeAdvDis: '',
	};
	ac5eConfig._preservedInitialDataProfileKey = profileKey;
}

function getSelectedDamageTypesFromDialog(dialog, elem) {
	const types = new Set();
	const selects = elem?.querySelectorAll?.('select[name^="roll."][name$=".damageType"]') ?? [];
	selects.forEach((select, index) => {
		const value = select?.value ?? dialog?.config?.rolls?.[index]?.options?.type;
		if (value) types.add(String(value).toLowerCase());
	});
	if (!types.size && dialog?.config?.rolls?.length) {
		for (const roll of dialog.config.rolls) {
			if (roll?.options?.type) types.add(String(roll.options.type).toLowerCase());
		}
	}
	return types;
}

function getDamageTypesByIndex(dialog, elem) {
	const types = [];
	const selects = elem?.querySelectorAll?.('select[name^="roll."][name$=".damageType"]') ?? [];
	selects.forEach((select) => {
		const name = select?.getAttribute?.('name') ?? '';
		const match = name.match(/roll\.(\d+)\.damageType/);
		const index = match ? Number(match[1]) : undefined;
		if (Number.isInteger(index)) types[index] = select?.value ?? dialog?.config?.rolls?.[index]?.options?.type;
	});
	if (!types.length && dialog?.config?.rolls?.length) {
		dialog.config.rolls.forEach((roll, index) => {
			if (roll?.options?.type) types[index] = roll.options.type;
		});
	}
	return types;
}

function getRollDamageTypeFromForm(formData, config, index) {
	const key = `roll.${index}.damageType`;
	const fromForm = formData?.object?.[key];
	if (fromForm) return String(fromForm).toLowerCase();
	const rollType = config?.rolls?.[index]?.options?.type;
	if (rollType) return String(rollType).toLowerCase();
	if (config?.options?.type) return String(config.options.type).toLowerCase();
	return undefined;
}

function resolveBonusAddTo(entry) {
	if (entry?.addTo?.mode === 'all') return { mode: 'all', types: [] };
	if (entry?.addTo?.mode === 'types' && Array.isArray(entry.addTo.types) && entry.addTo.types.length) {
		return { mode: 'types', types: entry.addTo.types.map((t) => String(t).toLowerCase()) };
	}
	return { mode: 'base', types: [] };
}

function shouldApplyBonusToRoll(entry, rollIndex, rollType, selectedTypes) {
	const addTo = resolveBonusAddTo(entry);
	if (addTo.mode === 'all') return true;
	if (addTo.mode === 'base') {
		if (rollIndex !== 0) return false;
		if (!entry?.requiredDamageTypes?.length) return true;
		if (!selectedTypes?.size) return false;
		return entry.requiredDamageTypes.every((t) => selectedTypes.has(String(t).toLowerCase()));
	}
	if (!rollType) return false;
	return addTo.types.some((t) => t === String(rollType).toLowerCase());
}

function isBonusEligibleForDamageTypes(entry, selectedTypes) {
	const addTo = resolveBonusAddTo(entry);
	if (addTo.mode === 'types') {
		if (!selectedTypes?.size) return false;
		return addTo.types.some((t) => selectedTypes.has(t));
	}
	if (!entry?.requiredDamageTypes?.length) return true;
	if (!selectedTypes?.size) return false;
	return entry.requiredDamageTypes.every((t) => selectedTypes.has(String(t).toLowerCase()));
}

function resolveExtraDiceAddTo(entry) {
	if (entry?.addTo?.mode === 'all') return { mode: 'all', types: [] };
	if (entry?.addTo?.mode === 'types' && Array.isArray(entry.addTo.types) && entry.addTo.types.length) {
		return { mode: 'types', types: entry.addTo.types.map((t) => String(t).toLowerCase()) };
	}
	if (Array.isArray(entry?.requiredDamageTypes) && entry.requiredDamageTypes.length) {
		return { mode: 'types', types: entry.requiredDamageTypes.map((t) => String(t).toLowerCase()) };
	}
	return { mode: 'base', types: [] };
}

function resolveCriticalAddTo(entry) {
	if (entry?.addTo?.mode === 'all') return { mode: 'all', types: [] };
	if (entry?.addTo?.mode === 'types' && Array.isArray(entry.addTo.types) && entry.addTo.types.length) {
		return { mode: 'types', types: entry.addTo.types.map((t) => String(t).toLowerCase()) };
	}
	return { mode: 'global', types: [] };
}

function shouldApplyCriticalToRoll(entry, rollType) {
	const addTo = resolveCriticalAddTo(entry);
	if (addTo.mode === 'all') return true;
	if (addTo.mode === 'global') return false;
	if (!rollType) return false;
	return addTo.types.some((t) => t === String(rollType).toLowerCase());
}

function isExtraDiceEligibleForSelectedTypes(entry, selectedTypes) {
	const addTo = resolveExtraDiceAddTo(entry);
	if (addTo.mode === 'all' || addTo.mode === 'base') return true;
	if (!selectedTypes?.size) return false;
	return addTo.types.some((t) => selectedTypes.has(t));
}

function shouldApplyExtraDiceToRoll(entry, rollIndex, rollType) {
	const addTo = resolveExtraDiceAddTo(entry);
	if (addTo.mode === 'all') return true;
	if (addTo.mode === 'base') return rollIndex === 0;
	if (!rollType) return false;
	return addTo.types.some((t) => t === String(rollType).toLowerCase());
}

function resolveDamageModifierAddTo(entry) {
	if (entry?.addTo?.mode === 'all') return { mode: 'all', types: [] };
	if (entry?.addTo?.mode === 'types' && Array.isArray(entry.addTo.types) && entry.addTo.types.length) {
		return { mode: 'types', types: entry.addTo.types.map((t) => String(t).toLowerCase()) };
	}
	return { mode: 'base', types: [] };
}

function shouldApplyDamageModifierToRoll(entry, rollIndex, rollType, selectedTypes) {
	const addTo = resolveDamageModifierAddTo(entry);
	if (addTo.mode === 'all') return true;
	if (addTo.mode === 'base') {
		if (rollIndex !== 0) return false;
		if (!entry?.requiredDamageTypes?.length) return true;
		if (!selectedTypes?.size) return false;
		return entry.requiredDamageTypes.every((t) => selectedTypes.has(String(t).toLowerCase()));
	}
	if (!rollType) return false;
	return addTo.types.some((t) => t === String(rollType).toLowerCase());
}

function isFormulaOperatorDamageModifier(value) {
	return typeof value === 'string' && /^[*/]/.test(value.trim());
}

function normalizeFormulaOperatorDamageModifier(value) {
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	const match = trimmed.match(/^([*/])\s*(.+)$/);
	if (!match) return '';
	const operator = match[1];
	const operand = match[2]?.trim();
	if (!operand) return '';
	return `${operator} ${operand}`;
}

function parseFormulaOperatorToken(token) {
	if (typeof token !== 'string') return null;
	const match = token.trim().match(/^([*/])\s*(.+)$/);
	if (!match) return null;
	const operator = match[1];
	const operand = match[2]?.trim();
	if (!operand) return null;
	return { operator, operand };
}

function isUnaryTopLevelSign(formula, index) {
	for (let i = index - 1; i >= 0; i--) {
		const ch = formula[i];
		if (/\s/.test(ch)) continue;
		return ['+', '-', '*', '/', '^', '(', '{', '[', ','].includes(ch);
	}
	return true;
}

function splitTopLevelSignedTerms(formula) {
	const terms = [];
	let current = '';
	let currentSign = '';
	let parenDepth = 0;
	let braceDepth = 0;
	let bracketDepth = 0;
	for (let i = 0; i < formula.length; i++) {
		const ch = formula[i];
		if (ch === '(') parenDepth++;
		else if (ch === ')' && parenDepth > 0) parenDepth--;
		else if (ch === '{') braceDepth++;
		else if (ch === '}' && braceDepth > 0) braceDepth--;
		else if (ch === '[') bracketDepth++;
		else if (ch === ']' && bracketDepth > 0) bracketDepth--;

		if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0 && (ch === '+' || ch === '-')) {
			if (isUnaryTopLevelSign(formula, i)) {
				current += ch;
				continue;
			}
			terms.push({ sign: currentSign, expression: current });
			currentSign = ch;
			current = '';
			continue;
		}
		current += ch;
	}
	terms.push({ sign: currentSign, expression: current });
	return terms;
}

function applyFormulaOperatorToAllTerms(formula, token) {
	if (typeof formula !== 'string') return formula;
	const parsed = parseFormulaOperatorToken(token);
	if (!parsed) return formula;
	const terms = splitTopLevelSignedTerms(formula);
	const transformed = terms
		.map((term, index) => {
			const rawExpression = String(term.expression ?? '').trim();
			if (!rawExpression) return '';
			const nextExpression = `${rawExpression} ${parsed.operator} ${parsed.operand}`;
			if (index === 0) return term.sign === '-' ? `- ${nextExpression}` : nextExpression;
			return `${term.sign} ${nextExpression}`;
		})
		.filter(Boolean)
		.join(' ');
	return transformed || formula;
}

function getDamageFormulaReplacementData(ac5eConfig) {
	const activity = ac5eConfig?.options?.activity;
	if (activity?.getRollData instanceof Function) {
		const rollData = activity.getRollData();
		if (rollData && typeof rollData === 'object') return rollData;
	}
	const actor = canvas?.tokens?.get(ac5eConfig?.tokenId)?.actor;
	if (actor?.getRollData instanceof Function) {
		const rollData = actor.getRollData();
		if (rollData && typeof rollData === 'object') return rollData;
	}
	return undefined;
}

function resolveDamageFormulaDataReferences(formula, replacementData) {
	if (typeof formula !== 'string' || !formula.includes('@')) return formula;
	if (!replacementData || typeof Roll?.replaceFormulaData !== 'function') return formula;
	const resolved = Roll.replaceFormulaData(formula, replacementData, { warn: false });
	if (typeof resolved !== 'string' || /[^\x20-\x7E]/.test(resolved)) return formula;
	return resolved;
}

function normalizeDamageModifierEntries(ac5eConfig) {
	const rawEntries = Array.isArray(ac5eConfig?.damageModifiers) ? ac5eConfig.damageModifiers : [];
	const selectedIds = new Set(Object.keys(ac5eConfig?.optinSelected ?? {}).filter((key) => ac5eConfig.optinSelected[key]));
	return rawEntries
		.map((entry) => {
			if (typeof entry === 'string') {
				return {
					id: undefined,
					value: entry,
					optin: false,
					forceOptin: false,
					addTo: undefined,
					requiredDamageTypes: [],
				};
			}
			if (!entry || typeof entry !== 'object') return null;
			const value = typeof entry.value === 'string' ? entry.value : typeof entry.modifier === 'string' ? entry.modifier : undefined;
			if (!value) return null;
			return {
				id: entry.id,
				value,
				optin: !!entry.optin,
				forceOptin: !!entry.forceOptin,
				addTo: entry.addTo,
				requiredDamageTypes: Array.isArray(entry.requiredDamageTypes) ? entry.requiredDamageTypes : [],
			};
		})
		.filter((entry) => entry && (!(entry.optin || entry.forceOptin) || entry.forceOptin || selectedIds.has(entry.id)));
}

function areStringArraysEqual(a = [], b = []) {
	if (!Array.isArray(a) || !Array.isArray(b)) return false;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function areStringMatrixEqual(a = [], b = []) {
	if (!Array.isArray(a) || !Array.isArray(b)) return false;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (!areStringArraysEqual(a[i] ?? [], b[i] ?? [])) return false;
	}
	return true;
}

function getDamageBonusEntries(ac5eConfig, selectedTypes) {
	const subjectBonuses = Array.isArray(ac5eConfig?.subject?.bonus) ? ac5eConfig.subject.bonus : [];
	const opponentBonuses = Array.isArray(ac5eConfig?.opponent?.bonus) ? ac5eConfig.opponent.bonus : [];
	return subjectBonuses
		.concat(opponentBonuses)
		.filter((entry) => entry && typeof entry === 'object' && entry.mode === 'bonus' && (!entry.hook || entry.hook === 'damage'))
		.filter((entry) => isBonusEligibleForDamageTypes(entry, selectedTypes));
}

function getDamageEntriesByMode(ac5eConfig, selectedTypes, mode) {
	const subjectEntries = Array.isArray(ac5eConfig?.subject?.[mode]) ? ac5eConfig.subject[mode] : [];
	const opponentEntries = Array.isArray(ac5eConfig?.opponent?.[mode]) ? ac5eConfig.opponent[mode] : [];
	const entries = subjectEntries.concat(opponentEntries).filter((entry) => entry && typeof entry === 'object' && entry.mode === mode && (!entry.hook || entry.hook === 'damage'));
	if (mode === 'extraDice' || mode === 'diceUpgrade' || mode === 'diceDowngrade') return entries.filter((entry) => isExtraDiceEligibleForSelectedTypes(entry, selectedTypes));
	return entries.filter((entry) => isBonusEligibleForDamageTypes(entry, selectedTypes));
}

function getDamageOptinModeEntries(ac5eConfig, mode) {
	const subjectEntries = Array.isArray(ac5eConfig?.subject?.[mode]) ? ac5eConfig.subject[mode] : [];
	const opponentEntries = Array.isArray(ac5eConfig?.opponent?.[mode]) ? ac5eConfig.opponent[mode] : [];
	return subjectEntries.concat(opponentEntries).filter((entry) => entry && typeof entry === 'object' && entry.optin && (!entry.hook || entry.hook === 'damage'));
}

function getDamageNonBonusOptinEntries(ac5eConfig, selectedTypes) {
	const modes = ['advantage', 'disadvantage', 'noAdvantage', 'noDisadvantage', 'critical', 'noCritical', 'fail', 'fumble', 'success'];
	return modes.flatMap((mode) => getDamageOptinModeEntries(ac5eConfig, mode)).filter((entry) => isBonusEligibleForDamageTypes(entry, selectedTypes));
}

function getRollNonBonusOptinEntries(ac5eConfig, hookType) {
	const modes = ['advantage', 'disadvantage', 'noAdvantage', 'noDisadvantage', 'critical', 'noCritical', 'fail', 'fumble', 'success', 'modifiers'];
	return modes.flatMap((mode) => {
		const subjectEntries = Array.isArray(ac5eConfig?.subject?.[mode]) ? ac5eConfig.subject[mode] : [];
		const opponentEntries = Array.isArray(ac5eConfig?.opponent?.[mode]) ? ac5eConfig.opponent[mode] : [];
		return subjectEntries.concat(opponentEntries).filter((entry) => entry && typeof entry === 'object' && entry.optin && (!entry.hook || entry.hook === hookType));
	});
}

function getBonusEntriesForHook(ac5eConfig, hookType) {
	const subjectBonuses = Array.isArray(ac5eConfig?.subject?.bonus) ? ac5eConfig.subject.bonus : [];
	const opponentBonuses = Array.isArray(ac5eConfig?.opponent?.bonus) ? ac5eConfig.opponent.bonus : [];
	return subjectBonuses.concat(opponentBonuses).filter((entry) => entry && typeof entry === 'object' && entry.mode === 'bonus' && (!entry.hook || entry.hook === hookType));
}

function _getD20ActivePartsSnapshot(config) {
	const configParts = Array.isArray(config?.parts) ? config.parts : [];
	const roll0Parts = Array.isArray(config?.rolls?.[0]?.parts) ? config.rolls[0].parts : [];
	const source = configParts.length >= roll0Parts.length ? configParts : roll0Parts;
	return foundry.utils.duplicate(source);
}

function _subtractPartsByOccurrence(parts = [], toSubtract = []) {
	if (!Array.isArray(parts) || !parts.length) return [];
	if (!Array.isArray(toSubtract) || !toSubtract.length) return [...parts];
	const subtractionCounts = new Map();
	for (const part of toSubtract) {
		subtractionCounts.set(part, (subtractionCounts.get(part) ?? 0) + 1);
	}
	const kept = [];
	for (const part of parts) {
		const remaining = subtractionCounts.get(part) ?? 0;
		if (remaining > 0) {
			subtractionCounts.set(part, remaining - 1);
			continue;
		}
		kept.push(part);
	}
	return kept;
}

function _collectPreservedExternalD20Parts(ac5eConfig, beforeParts = []) {
	if (!Array.isArray(beforeParts) || !beforeParts.length) return [];
	const baselineParts =
		Array.isArray(ac5eConfig?.frozenD20Baseline?.parts) ? ac5eConfig.frozenD20Baseline.parts
		: Array.isArray(ac5eConfig?.preAC5eConfig?.frozenD20Baseline?.parts) ? ac5eConfig.preAC5eConfig.frozenD20Baseline.parts
		: [];
	const withoutBaseline = _subtractPartsByOccurrence(beforeParts, baselineParts);
	const previousOptinParts = Array.isArray(ac5eConfig?._lastAppliedD20OptinParts) ? ac5eConfig._lastAppliedD20OptinParts : [];
	return _subtractPartsByOccurrence(withoutBaseline, previousOptinParts);
}

function _appendPartsToD20Config(config, parts = []) {
	if (!Array.isArray(parts) || !parts.length) return;
	const appendByOccurrence = (targetParts = [], additions = []) => {
		const remaining = new Map();
		for (const part of targetParts) {
			remaining.set(part, (remaining.get(part) ?? 0) + 1);
		}
		for (const part of additions) {
			const current = remaining.get(part) ?? 0;
			if (current > 0) {
				remaining.set(part, current - 1);
				continue;
			}
			targetParts.push(part);
		}
	};
	config.parts ??= [];
	appendByOccurrence(config.parts, parts);
	const roll0 = getExistingRoll(config, 0);
	if (!roll0) return;
	roll0.parts = Array.isArray(roll0.parts) ? roll0.parts : [];
	appendByOccurrence(roll0.parts, parts);
}

function getTargetADCEntriesForHook(ac5eConfig, hookType) {
	const subjectEntries = Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC : [];
	const opponentEntries = Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC : [];
	return subjectEntries.concat(opponentEntries).filter((entry) => entry && typeof entry === 'object' && entry.mode === 'targetADC' && (!entry.hook || entry.hook === hookType));
}

function getSelectedOptinEntries(ac5eConfig, optins, selectedTypes, hookType) {
	const selectedIds = new Set(Object.keys(optins ?? {}).filter((key) => optins[key]));
	if (hookType === 'damage') {
		const entries = getDamageBonusEntries(ac5eConfig, selectedTypes).filter((entry) => entry.optin);
		return { selectedEntries: entries.filter((entry) => selectedIds.has(entry.id)), selectedIds };
	}
	const entries = getAllOptinEntriesForHook(ac5eConfig, hookType);
	return { selectedEntries: entries.filter((entry) => selectedIds.has(entry.id)), selectedIds };
}

function getAllOptinEntriesForHook(ac5eConfig, hookType) {
	const subjectBonuses = Array.isArray(ac5eConfig?.subject?.bonus) ? ac5eConfig.subject.bonus : [];
	const opponentBonuses = Array.isArray(ac5eConfig?.opponent?.bonus) ? ac5eConfig.opponent.bonus : [];
	const subjectTargetADC = Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC : [];
	const opponentTargetADC = Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC : [];
	const subjectRange = Array.isArray(ac5eConfig?.subject?.range) ? ac5eConfig.subject.range : [];
	const opponentRange = Array.isArray(ac5eConfig?.opponent?.range) ? ac5eConfig.opponent.range : [];
	return subjectBonuses
		.concat(opponentBonuses, subjectTargetADC, opponentTargetADC, subjectRange, opponentRange)
		.filter((entry) => entry && typeof entry === 'object' && entry.optin && (!entry.hook || entry.hook === hookType));
}

function getCadenceLabelSuffix(cadence) {
	const keyMap = {
		oncePerTurn: 'AC5E.OptinCadence.OncePerTurn',
		oncePerRound: 'AC5E.OptinCadence.OncePerRound',
		oncePerCombat: 'AC5E.OptinCadence.OncePerCombat',
	};
	const key = keyMap[cadence];
	if (!key) return '';
	const localized = _localize(key);
	if (localized && localized !== key) return localized;
	const fallback = {
		oncePerTurn: '(1/turn)',
		oncePerRound: '(1/round)',
		oncePerCombat: '(1/combat)',
	};
	return fallback[cadence] ?? '';
}

function localizeWithFallback(key, fallback) {
	const localized = _localize(key);
	return localized && localized !== key ? localized : fallback;
}

function renderOptionalBonusesRoll(dialog, elem, ac5eConfig) {
	const entries = [...getAllOptinEntriesForHook(ac5eConfig, ac5eConfig.hookType), ...getRollNonBonusOptinEntries(ac5eConfig, ac5eConfig.hookType)].filter(
		(entry) => Boolean(entry?.optin || entry?.forceOptin),
	);
	renderOptionalBonusesFieldset(dialog, elem, ac5eConfig, entries);
}

function renderOptionalBonusesDamage(dialog, elem, ac5eConfig) {
	const selectedTypes = getSelectedDamageTypesFromDialog(dialog, elem);
	const entries = [
		...getDamageEntriesByMode(ac5eConfig, selectedTypes, 'bonus'),
		...getDamageEntriesByMode(ac5eConfig, selectedTypes, 'extraDice'),
		...getDamageEntriesByMode(ac5eConfig, selectedTypes, 'diceUpgrade'),
		...getDamageEntriesByMode(ac5eConfig, selectedTypes, 'diceDowngrade'),
		...getDamageNonBonusOptinEntries(ac5eConfig, selectedTypes),
	].filter((entry) => Boolean(entry?.optin || entry?.forceOptin));
	renderOptionalBonusesFieldset(dialog, elem, ac5eConfig, entries);
}

function renderOptionalBonusesFieldset(dialog, elem, ac5eConfig, entries) {
	const fieldsetExisting = elem.querySelector('.ac5e-optional-bonuses');
	const permissionFieldsetExisting = elem.querySelector('.ac5e-ask-permission-bonuses');
	const rollingActorId = getRollingActorIdForOptins(ac5eConfig);
	const visibleEntries = entries.filter((entry) => {
		return Boolean(entry?.optin || entry?.forceOptin);
	});
	const mainEntries = [];
	const askPermissionEntries = [];
	for (const entry of visibleEntries) {
		if (shouldAskPermissionForOptinEntry(entry, ac5eConfig, rollingActorId)) askPermissionEntries.push(entry);
		else mainEntries.push(entry);
	}
	const fieldset = fieldsetExisting ?? document.createElement('fieldset');
	fieldset.className = 'ac5e-optional-bonuses';
	const permissionFieldset = permissionFieldsetExisting ?? document.createElement('fieldset');
	permissionFieldset.className = 'ac5e-ask-permission-bonuses';
	const optionalLegend = localizeWithFallback('AC5E.OptinLegend.Optional', 'AC5E');
	const askPermissionLegend = localizeWithFallback('AC5E.OptinLegend.FromOtherSources', 'AC5E From other sources (ask for permission)');
	prepareOptinFieldset(fieldset, dialog, elem, ac5eConfig, optionalLegend);
	prepareOptinFieldset(permissionFieldset, dialog, elem, ac5eConfig, askPermissionLegend);

	if (!fieldsetExisting) {
		attachOptinFieldsetChangeHandler(fieldset, dialog, elem, ac5eConfig);
	}
	if (!permissionFieldsetExisting) {
		attachOptinFieldsetChangeHandler(permissionFieldset, dialog, elem, ac5eConfig);
	}

	const configFieldset = elem.querySelector('fieldset[data-application-part="configuration"]');
	if (!fieldsetExisting) {
		if (configFieldset) configFieldset.before(fieldset);
		else elem.prepend(fieldset);
	}
	if (!permissionFieldsetExisting) {
		if (configFieldset) configFieldset.before(permissionFieldset);
		else elem.prepend(permissionFieldset);
	}

	if (!mainEntries.length) {
		fieldset.style.display = 'none';
		fieldset.setAttribute('aria-hidden', 'true');
	} else {
		fieldset.style.removeProperty('display');
		fieldset.removeAttribute('aria-hidden');
		renderOptinRows(fieldset, mainEntries, ac5eConfig, { askPermission: false });
	}

	if (!askPermissionEntries.length) {
		permissionFieldset.style.display = 'none';
		permissionFieldset.setAttribute('aria-hidden', 'true');
	} else {
		permissionFieldset.style.removeProperty('display');
		permissionFieldset.removeAttribute('aria-hidden');
		renderOptinRows(permissionFieldset, askPermissionEntries, ac5eConfig, { askPermission: true });
	}
}

function prepareOptinFieldset(fieldset, dialog, elem, ac5eConfig, legendText) {
	fieldset._ac5eDialog = dialog;
	fieldset._ac5eConfig = ac5eConfig;
	fieldset._ac5eRootElement = elem;
	fieldset.innerHTML = '';
	const legend = document.createElement('legend');
	legend.textContent = legendText;
	fieldset.append(legend);
}

function attachOptinFieldsetChangeHandler(fieldset, dialog, elem, ac5eConfig) {
	fieldset.addEventListener('change', (event) => {
		if (event.target?.dataset?.ac5eOptin === 'true') {
			const activeFieldset = event.currentTarget;
			const activeDialog = activeFieldset?._ac5eDialog ?? dialog;
			const activeConfig = activeFieldset?._ac5eConfig ?? ac5eConfig;
			const activeElem = activeFieldset?._ac5eRootElement ?? elem;
			const nextSelections = readOptinSelections(activeElem, activeConfig);
			setOptinSelections(activeConfig, nextSelections);
			if (['attack', 'save', 'check'].includes(activeConfig.hookType)) {
				if (activeConfig.hookType === 'attack') refreshAttackAutoRangeState(activeConfig, activeDialog?.config);
				_calcAdvantageMode(activeConfig, activeDialog.config, undefined, undefined, { skipSetProperties: true });
				const roll0 = activeDialog.config?.rolls?.[0];
				if (roll0?.options) {
					roll0.options[Constants.MODULE_ID] ??= {};
					roll0.options[Constants.MODULE_ID].defaultButton = activeConfig.defaultButton ?? 'normal';
					roll0.options[Constants.MODULE_ID].advantageMode = activeConfig.advantageMode ?? 0;
					roll0.options[Constants.MODULE_ID].optinSelected = activeConfig.optinSelected ?? {};
				}
				if (activeDialog.config?.options) {
					activeDialog.config.options.defaultButton = activeConfig.defaultButton ?? 'normal';
					activeDialog.config.options.advantageMode = activeConfig.advantageMode ?? 0;
					activeDialog.config.options[Constants.MODULE_ID] ??= activeConfig;
					activeDialog.config.options[Constants.MODULE_ID].defaultButton = activeConfig.defaultButton ?? 'normal';
					activeDialog.config.options[Constants.MODULE_ID].advantageMode = activeConfig.advantageMode ?? 0;
					activeDialog.config.options[Constants.MODULE_ID].optinSelected = activeConfig.optinSelected ?? {};
				}
				activeDialog.config[Constants.MODULE_ID] ??= activeConfig;
				activeDialog.config[Constants.MODULE_ID].defaultButton = activeConfig.defaultButton ?? 'normal';
				activeDialog.config[Constants.MODULE_ID].advantageMode = activeConfig.advantageMode ?? 0;
				activeDialog.config[Constants.MODULE_ID].optinSelected = activeConfig.optinSelected ?? {};
			}
			activeDialog.render();
		}
	});
}

function renderOptinRows(fieldset, visibleEntries, ac5eConfig, { askPermission = false } = {}) {
	const shouldSuffixUnnamedOptins = visibleEntries.length > 1;
	visibleEntries.forEach((entry, index) => {
		const isOptinEntry = Boolean(entry?.optin || entry?.forceOptin);
		if (!isOptinEntry) return;
		const row = document.createElement('div');
		row.className = 'form-group';
		const label = document.createElement('label');
		const rawLabel = typeof entry?.label === 'string' ? entry.label.trim() : '';
		const rawName = typeof entry?.name === 'string' ? entry.name.trim() : '';
		const isUnnamedOptin = isOptinEntry && !rawLabel && !rawName;
		const baseLabel = rawLabel || rawName || String(entry?.id ?? '');
		const indexedLabel = isUnnamedOptin && shouldSuffixUnnamedOptins ? `${baseLabel} #${index + 1}` : baseLabel;
		const cadenceSuffix = isOptinEntry ? getCadenceLabelSuffix(entry?.cadence) : '';
		const permissionSuffix = getAskPermissionSourceSuffix(entry, askPermission);
		const fullLabel = permissionSuffix ? `${indexedLabel} (${permissionSuffix})` : indexedLabel;
		label.textContent = cadenceSuffix ? `${fullLabel} ${cadenceSuffix}` : fullLabel;
		const description =
			typeof entry.description === 'string' ? entry.description.trim()
			: typeof entry.autoDescription === 'string' ? entry.autoDescription.trim()
			: '';
		let descriptionPill = null;
		if (description) {
			descriptionPill = document.createElement('i');
			descriptionPill.className = 'ac5e-optin-description-pill';
			descriptionPill.classList.add('fa-solid', 'fa-circle-info');
			descriptionPill.title = description;
			descriptionPill.setAttribute('role', 'note');
			descriptionPill.style.display = 'inline-flex';
			descriptionPill.style.alignItems = 'center';
			descriptionPill.style.justifyContent = 'center';
			descriptionPill.style.width = '1em';
			descriptionPill.style.height = '1em';
			descriptionPill.style.minWidth = '1em';
			descriptionPill.style.maxWidth = '1em';
			descriptionPill.style.marginInline = '0.35em';
			descriptionPill.style.padding = '0';
			descriptionPill.style.flex = '0 0 1em';
			descriptionPill.style.alignSelf = 'center';
			descriptionPill.style.color = 'currentColor';
			descriptionPill.style.border = 'none';
			descriptionPill.style.backgroundColor = 'transparent';
			descriptionPill.style.fontSize = '0.8em';
			descriptionPill.style.fontWeight = '600';
			descriptionPill.style.lineHeight = '1';
			descriptionPill.style.verticalAlign = 'middle';
			descriptionPill.style.transform = 'translateY(0.01em)';
			descriptionPill.style.cursor = 'help';
			descriptionPill.style.userSelect = 'none';
			descriptionPill.style.opacity = '0.95';
		}
		const input = document.createElement('input');
		input.type = 'checkbox';
		input.name = `ac5eOptins.${entry.id}`;
		input.dataset.ac5eOptinId = entry.id;
		input.dataset.ac5eOptin = 'true';
		input.checked = !!ac5eConfig?.optinSelected?.[entry.id];
		if (descriptionPill) row.append(label, descriptionPill, input);
		else row.append(label, input);
		fieldset.append(row);
	});
}

function getRollingActorIdForOptins(ac5eConfig) {
	const tokenId = ac5eConfig?.tokenId;
	if (!tokenId) return null;
	const token = canvas?.tokens?.get(tokenId);
	return token?.actor?.id ?? null;
}

function shouldAskPermissionForOptinEntry(entry, ac5eConfig, rollingActorId) {
	if (!(entry?.optin || entry?.forceOptin)) return false;
	const sourceActorId = typeof entry?.sourceActorId === 'string' && entry.sourceActorId ? entry.sourceActorId : null;
	const permissionSourceActorId =
		typeof entry?.permissionSourceActorId === 'string' && entry.permissionSourceActorId ? entry.permissionSourceActorId : null;
	const key = String(entry?.changeKey ?? '').toLowerCase();
	const hookType = String(ac5eConfig?.hookType ?? '').toLowerCase();
	const isModifyAC = key.includes('.modifyac');
	const isGrants = key.includes('.grants.');
	const isAura = key.includes('.aura.') || Boolean(entry?.isAura);
	if (permissionSourceActorId !== null && permissionSourceActorId !== rollingActorId) return true;

	if (hookType === 'attack' && isModifyAC) {
		if (isGrants) return false;
		if (isAura) return sourceActorId !== null && sourceActorId !== rollingActorId;
		return true;
	}

	return sourceActorId !== null && sourceActorId !== rollingActorId;
}

function getAskPermissionSourceSuffix(entry, askPermission) {
	if (!askPermission) return '';
	const permissionSourceName = typeof entry?.permissionSourceActorName === 'string' ? entry.permissionSourceActorName.trim() : '';
	if (permissionSourceName) return permissionSourceName;
	if (entry?.isAura) return '';
	const sourceName = typeof entry?.sourceActorName === 'string' ? entry.sourceActorName.trim() : '';
	return sourceName || '';
}

function readOptinSelections(elem, ac5eConfig) {
	const selected = {};
	const inputs = elem.querySelectorAll('input[data-ac5e-optin="true"]');
	for (const input of inputs) {
		const id = input.dataset.ac5eOptinId;
		if (id && input.checked) selected[id] = true;
	}
	return selected;
}

function setOptinSelections(ac5eConfig, nextSelections) {
	const previous = ac5eConfig?.optinSelected ?? {};
	const prevKeys = Object.keys(previous);
	const nextKeys = Object.keys(nextSelections ?? {});
	const changed = prevKeys.length !== nextKeys.length || prevKeys.some((key) => previous[key] !== nextSelections[key]);
	if (changed) {
		if (ac5eConfig?.tooltipObj && ac5eConfig.hookType) delete ac5eConfig.tooltipObj[ac5eConfig.hookType];
		ac5eConfig.tooltipObj = ac5eConfig.tooltipObj ?? {};
		ac5eConfig.advantageMode = undefined;
		ac5eConfig.defaultButton = undefined;
	}
	ac5eConfig.optinSelected = nextSelections ?? {};
}

function applyOptinCriticalToDamageConfig(ac5eConfig, config, formData) {
	if (!ac5eConfig || !config) return;
	const optionBaseCritical = config?.options?.[Constants.MODULE_ID]?.baseCritical ?? config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.baseCritical;
	const selectedIds = new Set(Object.keys(ac5eConfig.optinSelected ?? {}).filter((key) => ac5eConfig.optinSelected[key]));
	const allCriticalEntries = (ac5eConfig.subject?.critical ?? [])
		.concat(ac5eConfig.opponent?.critical ?? [])
		.filter((entry) => entry && typeof entry === 'object')
		.filter((entry) => !entry.optin || selectedIds.has(entry.id));
	const globalCriticalEntries = allCriticalEntries.filter((entry) => resolveCriticalAddTo(entry).mode !== 'types');
	const localizedCriticalEntries = allCriticalEntries.filter((entry) => resolveCriticalAddTo(entry).mode === 'types');
	const hasGlobalCritical = globalCriticalEntries.length > 0;
	const wasOptinForced = !!ac5eConfig.optinForcedCritical;
	const currentCritical = config.isCritical ?? config.midiOptions?.isCritical ?? false;
	if (!hasGlobalCritical && !wasOptinForced) {
		ac5eConfig.optinBaseCritical = currentCritical;
	}
	const baseCritical = ac5eConfig.optinBaseCritical ?? optionBaseCritical ?? ac5eConfig.preAC5eConfig?.baseCritical ?? ac5eConfig.preAC5eConfig?.wasCritical ?? currentCritical ?? false;
	if (ac5eConfig.preAC5eConfig?.baseCritical === undefined) {
		ac5eConfig.preAC5eConfig.baseCritical = baseCritical;
	}
	if (optionBaseCritical === undefined) {
		const options = config?.options;
		if (options && Object.isExtensible(options)) {
			options[Constants.MODULE_ID] ??= {};
			options[Constants.MODULE_ID].baseCritical = baseCritical;
		}
		const roll0Options = config?.rolls?.[0]?.options;
		if (roll0Options && Object.isExtensible(roll0Options)) {
			roll0Options[Constants.MODULE_ID] ??= {};
			roll0Options[Constants.MODULE_ID].baseCritical = baseCritical;
		}
	}

	if (hasGlobalCritical) {
		if (!wasOptinForced && ac5eConfig.optinBaseCritical === undefined) {
			ac5eConfig.optinBaseCritical = baseCritical;
		}
		ac5eConfig.optinForcedCritical = true;
		ac5eConfig.isCritical = true;
		config.isCritical = true;
		if (config.midiOptions) config.midiOptions.isCritical = true;
	} else {
		ac5eConfig.isCritical = baseCritical;
		config.isCritical = baseCritical;
		if (config.midiOptions) config.midiOptions.isCritical = baseCritical;
		ac5eConfig.optinForcedCritical = false;
	}
	if (ac5eConfig.isCritical === undefined && config.isCritical !== undefined) {
		ac5eConfig.isCritical = config.isCritical;
	}

	if (Array.isArray(config.rolls)) {
		const rollCriticalByIndex = [];
		for (let i = 0; i < config.rolls.length; i++) {
			const roll = config.rolls[i];
			if (!roll?.options) continue;
			const rollType =
				getRollDamageTypeFromForm(formData, config, i) ?? (Array.isArray(ac5eConfig?.options?.selectedDamageTypes) ? String(ac5eConfig.options.selectedDamageTypes[i] ?? '').toLowerCase() : undefined);
			const localizedCritical = localizedCriticalEntries.some((entry) => shouldApplyCriticalToRoll(entry, rollType));
			const effectiveRollCritical = config.isCritical || localizedCritical;
			roll.options.isCritical = effectiveRollCritical;
			rollCriticalByIndex[i] = effectiveRollCritical;
		}
		ac5eConfig.damageRollCriticalByIndex = rollCriticalByIndex;
	}
}

function refreshAttackAutoRangeState(ac5eConfig, config) {
	if (!ac5eConfig || ac5eConfig.hookType !== 'attack') return;
	const options = ac5eConfig.options ?? {};
	const activity = options.activity ?? config?.subject ?? config?.activity;
	if (!activity) return;
	const sourceTokenId = ac5eConfig.tokenId ?? getSubjectTokenIdFromConfig(config);
	const sourceToken =
		sourceTokenId ? canvas.tokens.get(sourceTokenId)
		: activity?.actor ? (_getTokenFromActor(activity.actor) ?? activity.actor.getActiveTokens?.()?.[0])
		: undefined;
	const isTargetSelf = activity?.target?.affects?.type === 'self';
	const targets = Array.isArray(options.targets) ? options.targets : [];
	const singleTargetToken = getSingleTargetToken(targets) ?? (isTargetSelf ? sourceToken : game.user?.targets?.first());
	if (!sourceToken || !singleTargetToken) return;
	const failLabel = _localize('AC5E.OutOfRange');
	const nearbyLabel = _localize('AC5E.NearbyFoe');
	const longLabel = _localize('RangeLong');
	ac5eConfig.subject.fail = (ac5eConfig.subject.fail ?? []).filter((v) => v !== failLabel);
	ac5eConfig.subject.disadvantage = (ac5eConfig.subject.disadvantage ?? []).filter((v) => v !== nearbyLabel && v !== longLabel);
	ac5eConfig.subject.rangeNotes = [];
	const mergedOptions = { ...options, targets, ac5eConfig };
	mergedOptions.distance = _getDistance(sourceToken, singleTargetToken);
	const { nearbyFoe, inRange, range, longDisadvantage, outOfRangeFail, outOfRangeFailSourceLabel } = _autoRanged(activity, sourceToken, singleTargetToken, mergedOptions);
	ac5eConfig.options ??= {};
	ac5eConfig.options.distance = mergedOptions.distance;
	if (config?.options && Object.isExtensible(config.options)) config.options.distance = mergedOptions.distance;
	if (nearbyFoe) ac5eConfig.subject.disadvantage.push(nearbyLabel);
	if (!outOfRangeFail && !inRange && outOfRangeFailSourceLabel) {
		ac5eConfig.subject.rangeNotes.push(`${failLabel} fail suppressed: ${outOfRangeFailSourceLabel}`);
	}
	if (outOfRangeFail && !config?.workflow?.AoO && !inRange) ac5eConfig.subject.fail.push(failLabel);
	if (range === 'long' && longDisadvantage) ac5eConfig.subject.disadvantage.push(longLabel);
	if (ac5eConfig?.tooltipObj?.attack) delete ac5eConfig.tooltipObj.attack;
}

function getOptinExtraDiceAdjustments(ac5eConfig, selectedTypes, optins, rollIndex, rollType) {
	const entries = getDamageEntriesByMode(ac5eConfig, selectedTypes, 'extraDice').filter(
		(entry) => Boolean(entry?.optin || entry?.forceOptin) && shouldApplyExtraDiceToRoll(entry, rollIndex, rollType),
	);
	if (!entries.length) return { additive: 0, multiplier: 1 };
	const selectedIds = new Set(Object.keys(optins ?? {}).filter((key) => optins[key]));
	let additive = 0;
	let multiplier = 1;
	for (const entry of entries) {
		if (!entry.forceOptin && !selectedIds.has(entry.id)) continue;
		const values = Array.isArray(entry.values) ? entry.values : [];
		for (const value of values) {
			const parsed = _parseExtraDiceValue(value);
			additive += parsed.additive;
			multiplier *= parsed.multiplier;
		}
	}
	return { additive, multiplier };
}

function _parseExtraDiceValue(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return { additive: 0, multiplier: 1 };

	const multiplierMatch = raw.match(/^\+?\s*(?:x|\^)\s*(-?\d+)\s*$/i);
	if (multiplierMatch) {
		const parsedMultiplier = Number(multiplierMatch[1]);
		if (!Number.isNaN(parsedMultiplier) && Number.isInteger(parsedMultiplier)) {
			return { additive: 0, multiplier: parsedMultiplier };
		}
		return { additive: 0, multiplier: 1 };
	}

	const parsedAdditive = Number(raw.replace('+', '').trim());
	if (Number.isNaN(parsedAdditive)) return { additive: 0, multiplier: 1 };
	return { additive: parsedAdditive, multiplier: 1 };
}

function _getDamageDiceStepFromEntry(entry, value) {
	const parsed = Number(
		String(value ?? '')
			.replace('+', '')
			.trim(),
	);
	if (Number.isNaN(parsed)) return 0;
	if (entry?.mode === 'diceDowngrade') return parsed > 0 ? -parsed : parsed;
	return parsed;
}

function _getDamageDiceStepProgression() {
	const dice = CONFIG?.Dice?.fulfillment?.dice ?? {};
	const sizes = Object.keys(dice)
		.map((key) => key.match(/^d(\d+)$/i)?.[1])
		.filter(Boolean)
		.map((n) => Number(n))
		.filter((n) => Number.isInteger(n) && n > 0)
		.sort((a, b) => a - b);
	return sizes.length ? sizes : [4, 6, 8, 10, 12, 20, 100];
}

function _shiftDamageDieSize(sides, steps, progression) {
	const current = Number(sides);
	if (!Number.isInteger(current) || !Number.isFinite(steps) || steps === 0) return current;
	const index = progression.indexOf(current);
	if (index < 0) return current;
	const nextIndex = Math.max(0, Math.min(progression.length - 1, index + steps));
	return progression[nextIndex] ?? current;
}

function applyOrResetFormulaChanges(elem, getConfigAC5E, mode = 'apply', baseFormulas, damageTypesByIndex = []) {
	const formulas =
		Array.isArray(baseFormulas) && baseFormulas.length ?
			baseFormulas
		:	Array.from(elem.querySelectorAll('.formula'))
				.map((el) => el.textContent?.trim())
				.filter(Boolean);

	const damageModifierEntries = normalizeDamageModifierEntries(getConfigAC5E);
	const modifierValues = damageModifierEntries.map((entry) => entry.value).filter((value) => typeof value === 'string');
	const suffixModifiers = damageModifierEntries
		.filter((entry) => entry.value !== 'adv' && entry.value !== 'dis')
		.filter((entry) => {
			if (!isFormulaOperatorDamageModifier(entry.value)) return true;
			const addTo = resolveDamageModifierAddTo(entry);
			return addTo.mode === 'base';
		})
		.map((entry) => entry.value);
	const formulaOperatorEntries = damageModifierEntries.filter((entry) => {
		if (!isFormulaOperatorDamageModifier(entry.value)) return false;
		const addTo = resolveDamageModifierAddTo(entry);
		return addTo.mode !== 'base';
	});
	const suffix = suffixModifiers.join('');
	const allTypes = new Set(damageTypesByIndex.filter(Boolean).map((type) => String(type).toLowerCase()));
	const selectedOptinIds = new Set(Object.keys(getConfigAC5E.optinSelected ?? {}).filter((key) => getConfigAC5E.optinSelected[key]));
	const isOptinEntrySelected = (entry) => Boolean(entry?.forceOptin || (entry?.id && selectedOptinIds.has(entry.id)));
	const optinBonusEntries = getDamageEntriesByMode(getConfigAC5E, allTypes, 'bonus').filter((entry) => Boolean(entry?.optin || entry?.forceOptin) && isOptinEntrySelected(entry));
	const subjectAdvantage = _filterOptinEntries(getConfigAC5E.subject.advantage, getConfigAC5E.optinSelected);
	const opponentAdvantage = _filterOptinEntries(getConfigAC5E.opponent.advantage, getConfigAC5E.optinSelected);
	const subjectDisadvantage = _filterOptinEntries(getConfigAC5E.subject.disadvantage, getConfigAC5E.optinSelected);
	const opponentDisadvantage = _filterOptinEntries(getConfigAC5E.opponent.disadvantage, getConfigAC5E.optinSelected);
	const hasAdv = modifierValues.includes('adv') || subjectAdvantage.length || opponentAdvantage.length; // adds support for flags.ac5e.damage.advantage which is recommended going forward.
	const hasDis = modifierValues.includes('dis') || subjectDisadvantage.length || opponentDisadvantage.length;
	const optinBonusPartsByRoll = formulas.map((_, index) => {
		if (!optinBonusEntries.length) return [];
		const rollType = damageTypesByIndex?.[index] ? String(damageTypesByIndex[index]).toLowerCase() : undefined;
		const selectedParts = [];
		for (const entry of optinBonusEntries) {
			if (!shouldApplyBonusToRoll(entry, index, rollType, allTypes)) continue;
			const values = Array.isArray(entry.values) ? entry.values : [];
			for (const value of values) {
				const part = String(value ?? '').trim();
				if (part) selectedParts.push(part);
			}
		}
		return [...new Set(selectedParts)];
	});

	// const isCritical = getConfigAC5E.preAC5eConfig?.wasCritical ?? false;
	// const extraDiceTotal = (getConfigAC5E.extraDice ?? []).reduce((a, b) => a + b, 0) * (isCritical ? 2 : 1);
	const extraDiceAdjustments = formulas.map((_, index) => {
		const rollType = damageTypesByIndex?.[index] ? String(damageTypesByIndex[index]).toLowerCase() : undefined;
		const entries = getDamageEntriesByMode(getConfigAC5E, allTypes, 'extraDice');
		let baseAdditive = 0;
		let baseMultiplier = 1;
		for (const entry of entries) {
			if (entry.optin) continue;
			if (!shouldApplyExtraDiceToRoll(entry, index, rollType)) continue;
			const values = Array.isArray(entry.values) ? entry.values : [];
			for (const value of values) {
				const parsed = _parseExtraDiceValue(value);
				baseAdditive += parsed.additive;
				baseMultiplier *= parsed.multiplier;
			}
		}
		const optinAdjustments = getOptinExtraDiceAdjustments(getConfigAC5E, allTypes, getConfigAC5E.optinSelected, index, rollType);
		return {
			additive: baseAdditive + optinAdjustments.additive,
			multiplier: baseMultiplier * optinAdjustments.multiplier,
		};
	});
	const diceStepTotals = formulas.map((_, index) => {
		const rollType = damageTypesByIndex?.[index] ? String(damageTypesByIndex[index]).toLowerCase() : undefined;
		const entries = [...getDamageEntriesByMode(getConfigAC5E, allTypes, 'diceUpgrade'), ...getDamageEntriesByMode(getConfigAC5E, allTypes, 'diceDowngrade')];
		let total = 0;
		for (const entry of entries) {
			if ((entry.optin || entry.forceOptin) && !isOptinEntrySelected(entry)) continue;
			if (!shouldApplyExtraDiceToRoll(entry, index, rollType)) continue;
			const values = Array.isArray(entry.values) ? entry.values : [];
			for (const value of values) {
				total += _getDamageDiceStepFromEntry(entry, value);
			}
		}
		return total;
	});
	const formulaOperatorTokensByRoll = formulas.map((_, index) => {
		const rollType = damageTypesByIndex?.[index] ? String(damageTypesByIndex[index]).toLowerCase() : undefined;
		const tokens = [];
		for (const entry of formulaOperatorEntries) {
			if (!shouldApplyDamageModifierToRoll(entry, index, rollType, allTypes)) continue;
			const token = normalizeFormulaOperatorDamageModifier(entry.value);
			if (token) tokens.push(token);
		}
		return tokens;
	});

	if (!getConfigAC5E.preservedInitialData) {
		getConfigAC5E.preservedInitialData = {
			formulas: [...formulas],
			modified: [...formulas],
			activeModifiers: '',
			activeExtraDice: formulas.map(() => 0),
			activeExtraDiceMultipliers: formulas.map(() => 1),
			activeDiceSteps: formulas.map(() => 0),
			activeFormulaOperators: formulas.map(() => []),
			activeOptinBonusParts: formulas.map(() => []),
			activeAdvDis: '',
		};
	}

	const {
		formulas: originals,
		activeModifiers,
		activeExtraDice,
		activeExtraDiceMultipliers,
		activeDiceSteps,
		activeFormulaOperators,
		activeOptinBonusParts,
		activeAdvDis,
	} =
		getConfigAC5E.preservedInitialData;
	const activeExtraDiceArray = Array.isArray(activeExtraDice) ? activeExtraDice : originals.map(() => activeExtraDice ?? 0);
	const activeExtraDiceMultiplierArray = Array.isArray(activeExtraDiceMultipliers) ? activeExtraDiceMultipliers : originals.map(() => activeExtraDiceMultipliers ?? 1);
	const activeDiceStepsArray = Array.isArray(activeDiceSteps) ? activeDiceSteps : originals.map(() => activeDiceSteps ?? 0);
	const activeFormulaOperatorsArray =
		Array.isArray(activeFormulaOperators) ?
			activeFormulaOperators.map((ops) => (Array.isArray(ops) ? [...ops] : []))
		:	originals.map(() => []);
	const activeOptinBonusPartsArray =
		Array.isArray(activeOptinBonusParts) ?
			activeOptinBonusParts.map((parts) => (Array.isArray(parts) ? [...parts] : []))
		:	originals.map(() => []);
	const formulaReplacementData = getDamageFormulaReplacementData(getConfigAC5E);

	const diceRegex = /(\d+)d(\d+)([a-z0-9]*)?/gi;
	const suffixChanged = activeModifiers !== suffix;
	const additiveChanged = extraDiceAdjustments.some((adj, index) => activeExtraDiceArray[index] !== adj.additive);
	const multiplierChanged = extraDiceAdjustments.some((adj, index) => activeExtraDiceMultiplierArray[index] !== adj.multiplier);
	const diceStepChanged = diceStepTotals.some((total, index) => activeDiceStepsArray[index] !== total);
	const formulaOperatorChanged = !areStringMatrixEqual(activeFormulaOperatorsArray, formulaOperatorTokensByRoll);
	const optinBonusChanged = !areStringMatrixEqual(activeOptinBonusPartsArray, optinBonusPartsByRoll);
	const advDis =
		hasAdv ? 'adv'
		: hasDis ? 'dis'
		: '';
	const advDisChanged = advDis !== activeAdvDis;

	if (mode === 'apply' && !suffixChanged && !additiveChanged && !multiplierChanged && !diceStepChanged && !formulaOperatorChanged && !optinBonusChanged && !advDisChanged)
		return false; // no changes

	if (
		mode === 'reset' ||
		(!suffixModifiers.length &&
			extraDiceAdjustments.every((adj) => adj.additive === 0 && adj.multiplier === 1) &&
			diceStepTotals.every((total) => total === 0) &&
			formulaOperatorTokensByRoll.every((tokens) => !tokens.length) &&
			optinBonusPartsByRoll.every((parts) => !parts.length) &&
			!advDis)
	) {
		getConfigAC5E.preservedInitialData.modified = [...originals];
		getConfigAC5E.preservedInitialData.activeModifiers = '';
		getConfigAC5E.preservedInitialData.activeExtraDice = originals.map(() => 0);
		getConfigAC5E.preservedInitialData.activeExtraDiceMultipliers = originals.map(() => 1);
		getConfigAC5E.preservedInitialData.activeDiceSteps = originals.map(() => 0);
		getConfigAC5E.preservedInitialData.activeFormulaOperators = originals.map(() => []);
		getConfigAC5E.preservedInitialData.activeOptinBonusParts = originals.map(() => []);
		getConfigAC5E.preservedInitialData.activeAdvDis = '';
		return true;
	}

	const diceProgression = _getDamageDiceStepProgression();
	getConfigAC5E.preservedInitialData.modified = originals.map((formula, index) => {
		const optinBonusParts = optinBonusPartsByRoll[index] ?? [];
		let formulaWithOptins = formula;
		if (optinBonusParts.length) {
			formulaWithOptins =
				typeof formulaWithOptins === 'string' && formulaWithOptins.trim().length ?
					`${formulaWithOptins} + ${optinBonusParts.join(' + ')}`
				:	optinBonusParts.join(' + ');
		}
		const resolvedFormula = resolveDamageFormulaDataReferences(formulaWithOptins, formulaReplacementData);
		const extraDiceAdditive = extraDiceAdjustments[index]?.additive ?? 0;
		const extraDiceMultiplier = extraDiceAdjustments[index]?.multiplier ?? 1;
		const diceStepTotal = diceStepTotals[index] ?? 0;
		let nextFormula = resolvedFormula.replace(diceRegex, (match, count, sides, existing = '') => {
			const baseCount = parseInt(count, 10);
			const newCount = baseCount * extraDiceMultiplier + extraDiceAdditive;
			if (newCount <= 0) return `0d${sides}${existing}`;
			const shiftedSides = _shiftDamageDieSize(sides, diceStepTotal, diceProgression);

			// Dice base with suffix (applied inside the roll)
			const diceTerm = `${newCount}d${shiftedSides}${suffix}`;

			let term;
			if (advDis === 'adv') term = `{${diceTerm},${diceTerm}}kh`;
			else if (advDis === 'dis') term = `{${diceTerm},${diceTerm}}kl`;
			else term = diceTerm;

			// Preserve any existing [tag]
			return `${term}${existing}`;
		});
		const formulaOperators = formulaOperatorTokensByRoll[index] ?? [];
		for (const op of formulaOperators) {
			nextFormula = applyFormulaOperatorToAllTerms(nextFormula, op);
		}
		return nextFormula;
	});

	getConfigAC5E.preservedInitialData.activeModifiers = suffix;
	getConfigAC5E.preservedInitialData.activeExtraDice = extraDiceAdjustments.map((adj) => adj.additive);
	getConfigAC5E.preservedInitialData.activeExtraDiceMultipliers = extraDiceAdjustments.map((adj) => adj.multiplier);
	getConfigAC5E.preservedInitialData.activeDiceSteps = [...diceStepTotals];
	getConfigAC5E.preservedInitialData.activeFormulaOperators = formulaOperatorTokensByRoll.map((tokens) => [...tokens]);
	getConfigAC5E.preservedInitialData.activeOptinBonusParts = optinBonusPartsByRoll.map((parts) => [...parts]);
	getConfigAC5E.preservedInitialData.activeAdvDis = advDis;
	return true;
}

function doDialogSkillOrToolRender(dialog, elem, getConfigAC5E, selectedAbility) {
	if (!selectedAbility) return;
	const newConfig = dialog.config;
	newConfig.ability = selectedAbility;
	newConfig.advantage = undefined;
	newConfig.disadvantage = undefined;
	const roll0 = getExistingRoll(newConfig, 0);
	const roll0Options = getExistingRollOptions(newConfig, 0);
	if (roll0Options) roll0Options.advantageMode = 0;
	if (roll0) roll0.parts = [];
	if (roll0Options) roll0Options.maximum = null;
	if (roll0Options) roll0Options.minimum = null;

	const newDialog = { options: { window: { title: dialog.message.flavor }, advantageMode: 0, defaultButton: 'normal' } };
	const newMessage = dialog.message;
	const reEval = getConfigAC5E.reEval ?? {};

	getConfigAC5E = _preRollAbilityCheck(newConfig, newDialog, newMessage, 'check', reEval);
	dialog.rebuild();
	dialog.render();
}

function compareArrays(a, b) {
	const safeA = Array.isArray(a) ? a : [];
	const safeB = Array.isArray(b) ? b : [];
	const len = Math.max(safeA.length, safeB.length);
	for (let i = 0; i < len; i++) {
		if (safeA[i] !== safeB[i]) {
			return { equal: false, index: i, initialValue: safeA[i], selectedValue: safeB[i] };
		}
	}
	return { equal: true };
}
