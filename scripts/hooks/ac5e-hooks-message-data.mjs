import { _activeModule, _cloneUseConfigShallow, _getMessageDnd5eFlags, _getMessageFlagScope, _resolveUseMessageContext, _safeFromUuidSync } from '../ac5e-helpers.mjs';
import { _mergeUseOptions } from '../ac5e-config-logic.mjs';
import Constants from '../ac5e-constants.mjs';
import { getAssociatedRollMessage } from './ac5e-hooks-message-association.mjs';

export function resolveMessageDataContext(config, hook, messageConfig, deps) {
	const { messageId: triggerMessageId, message, originatingMessageId } = resolveMessageFromConfig(config, messageConfig, hook, deps);
	const {
		message: resolvedMessage,
		registryMessages,
		originatingMessage,
		usageMessage,
		resolvedMessageId,
		useConfig,
	} = _resolveUseMessageContext({
		message,
		messageId: triggerMessageId,
		originatingMessageId,
	});
	const { item, activity, use, sourceMessage } = resolveActivityItemUse({ config, message: resolvedMessage, originatingMessage, usageMessage, registryMessages, useConfig }, deps);
	const primaryMessage = message ?? sourceMessage ?? resolvedMessage;
	const messageForTargets =
		hook === 'damage' ? (getAssociatedRollMessage({ hook, activity, originatingMessage, config, resolvedMessageId, triggerMessageId }) ?? originatingMessage ?? primaryMessage) : primaryMessage;
	const options = buildMessageOptions(
		{
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
		},
		deps,
	);
	const { attackingActor, attackingToken } = resolveAttackerContext(primaryMessage, item, deps);
	const messageTargets = _getMessageDnd5eFlags(messageForTargets)?.targets;
	return {
		messageId: primaryMessage?.id,
		message: primaryMessage,
		messageForTargets,
		activity,
		item,
		attackingActor,
		attackingToken,
		messageTargets,
		config,
		messageConfig: messageConfig ?? primaryMessage?.config,
		use,
		options,
	};
}

export function debugMessageData(hook, context, deps) {
	const { message, activity, item, attackingActor, attackingToken, messageTargets, config, messageConfig, use, options } = context;
	if (deps.hookDebugEnabled('getMessageDataHook'))
		console.warn('AC5E.getMessageData', {
			messageId: message?.id,
			activity,
			item,
			attackingActor,
			attackingToken,
			messageTargets,
			config,
			messageConfig,
			use,
			options,
		});
	if (ac5e?.debugOriginatingUseConfig || deps.hookDebugEnabled('originatingUseConfig'))
		console.warn('AC5E originatingUseConfig', {
			hook,
			messageId: message?.id,
			originatingMessageId: options.originatingMessageId,
			originatingUseConfig: options.originatingUseConfig,
		});
}

function resolveMessageFromConfig(config, messageConfig, hook, deps) {
	const originatingMessageId = messageConfig?.data?.['flags.dnd5e.originatingMessage'] ?? messageConfig?.data?.flags?.dnd5e?.originatingMessage;
	const eventMessageId = config?.event?.currentTarget?.dataset?.messageId ?? config?.event?.target?.closest?.('[data-message-id]')?.dataset?.messageId;
	const messageId = eventMessageId ?? originatingMessageId;
	const messageUuid = config?.midiOptions?.itemCardUuid ?? config?.workflow?.itemCardUuid;
	const registryHookMessage = messageId ? dnd5e?.registry?.messages?.get(messageId, hook)?.pop?.() : undefined;
	const registryAnyMessage = !registryHookMessage && messageId ? dnd5e?.registry?.messages?.get(messageId)?.pop?.() : undefined;
	const message = registryHookMessage ?? registryAnyMessage ?? (messageId ? game.messages.get(messageId) : undefined) ?? (messageUuid ? _safeFromUuidSync(messageUuid) : undefined) ?? messageConfig;
	return { messageId, message, originatingMessageId };
}

function resolveAttackerContext(message, item, deps) {
	const { scene: sceneId, actor: actorId, token: tokenId, alias: tokenName } = message?.speaker || {};
	const attackingToken = canvas.tokens.get(tokenId);
	const messageTargets = _getMessageDnd5eFlags(message)?.targets;
	const attackingActor = attackingToken?.actor ?? item?.actor;
	return { attackingActor, attackingToken, messageTargets, speaker: { sceneId, actorId, tokenId, tokenName } };
}

function resolveActivityItemUse({ config, message, originatingMessage, usageMessage, registryMessages, useConfig } = {}, deps) {
	const candidates = [message, usageMessage, originatingMessage, ...(Array.isArray(registryMessages) ? registryMessages : [])].filter(Boolean);
	const sourceMessage =
		candidates.find((msg) => {
			const flags = _getMessageDnd5eFlags(msg);
			return flags?.activity !== undefined || flags?.item !== undefined || flags?.use !== undefined;
		}) ??
		message ??
		usageMessage ??
		originatingMessage;
	const configOptions = config?.options ?? {};
	const originatingUseConfig = config?.originatingUseConfig ?? configOptions?.originatingUseConfig ?? {};
	const originatingUseOptions = originatingUseConfig?.options ?? {};
	const useConfigOptions = useConfig?.options ?? {};
	const flagItemRef = firstDnd5eFlagValue(candidates, 'item', deps);
	const flagActivityRef = firstDnd5eFlagValue(candidates, 'activity', deps);
	const flagUse = firstDnd5eFlagValue(candidates, 'use', deps);
	const use = firstDefined(flagUse, configOptions?.use, config?.use, originatingUseConfig?.use, useConfig?.use);
	const itemRef = firstDefined(flagItemRef, configOptions?.item, config?.item, originatingUseOptions?.item, useConfigOptions?.item, use?.item);
	const activityRef = firstDefined(flagActivityRef, configOptions?.activity, config?.activity, originatingUseOptions?.activity, useConfigOptions?.activity, use?.activity);
	let item = resolveDocumentFromRef(itemRef);
	let activity = resolveDocumentFromRef(activityRef);
	if (!activity && item) activity = resolveActivityFromItem(item, activityRef);
	if (!item && activity?.item) item = activity.item;
	return { item, activity, use, sourceMessage };
}

function buildMessageOptions({ config, hook, message, triggerMessageId, resolvedMessageId, useConfig, originatingMessage, activity, item, use }, deps) {
	const options = {};
	if (!activity && message) foundry.utils.mergeObject(options, _getMessageFlagScope(message, Constants.MODULE_ID) ?? {});

	options.d20 = {};
	if (hook === 'damage') {
		if (_activeModule('midi-qol')) {
			options.d20.d20Total = config?.workflow?.attackTotal;
			options.d20.d20Result = config?.workflow?.d20AttackRoll;
			options.d20.attackRollTotal = options.d20.d20Total;
			options.d20.attackRollD20 = options.d20.d20Result;
			options.d20.advantageMode = config?.workflow?.attackRoll?.options?.advantageMode ?? config?.workflow?.advantageMode;
			options.d20.hasAdvantage = config?.workflow?.advantage;
			options.d20.hasDisadvantage = config?.workflow?.disadvantage;
			options.d20.hasTransitAdvantage = config?.workflow?.attackRoll?.options?.[Constants.MODULE_ID]?.hasTransitAdvantage;
			options.d20.hasTransitDisadvantage = config?.workflow?.attackRoll?.options?.[Constants.MODULE_ID]?.hasTransitDisadvantage;
			options.d20.isCritical = config?.midiOptions?.isCritical ?? config?.workflow?.isCritical;
			options.d20.isFumble = config?.midiOptions?.isFumble ?? config?.workflow?.isFumble;
		} else {
			const attackMessage = getAssociatedRollMessage({ hook, activity, originatingMessage, config, resolvedMessageId, triggerMessageId });
			const findRoll0 = attackMessage?.rolls?.[0];
			const ac5eAttackFlags = _getMessageFlagScope(attackMessage, Constants.MODULE_ID) ?? {};
			const ac5eAttackRollFlags = findRoll0?.options?.[Constants.MODULE_ID] ?? {};
			const resolvedAdvantageMode = findRoll0?.options?.advantageMode ?? ac5eAttackRollFlags?.advantageMode ?? ac5eAttackFlags?.advantageMode ?? null;
			const resolvedHasAdvantage =
				typeof findRoll0?.options?.advantage === 'boolean' ? findRoll0.options.advantage
				: typeof ac5eAttackRollFlags?.advantage === 'boolean' ? ac5eAttackRollFlags.advantage
				: typeof ac5eAttackFlags?.advantage === 'boolean' ? ac5eAttackFlags.advantage
				: typeof ac5eAttackRollFlags?.preAC5eConfig?.adv === 'boolean' ? ac5eAttackRollFlags.preAC5eConfig.adv
				: typeof ac5eAttackFlags?.preAC5eConfig?.adv === 'boolean' ? ac5eAttackFlags.preAC5eConfig.adv
				: typeof resolvedAdvantageMode === 'number' ? resolvedAdvantageMode > 0
				: false;
			const resolvedHasDisadvantage =
				typeof findRoll0?.options?.disadvantage === 'boolean' ? findRoll0.options.disadvantage
				: typeof ac5eAttackRollFlags?.disadvantage === 'boolean' ? ac5eAttackRollFlags.disadvantage
				: typeof ac5eAttackFlags?.disadvantage === 'boolean' ? ac5eAttackFlags.disadvantage
				: typeof ac5eAttackRollFlags?.preAC5eConfig?.dis === 'boolean' ? ac5eAttackRollFlags.preAC5eConfig.dis
				: typeof ac5eAttackFlags?.preAC5eConfig?.dis === 'boolean' ? ac5eAttackFlags.preAC5eConfig.dis
				: typeof resolvedAdvantageMode === 'number' ? resolvedAdvantageMode < 0
				: false;
			options.d20.d20Total = findRoll0?.total;
			options.d20.d20Result = findRoll0?.d20?.total;
			options.d20.attackRollTotal = options.d20.d20Total;
			options.d20.attackRollD20 = options.d20.d20Result;
			options.d20.advantageMode = resolvedAdvantageMode;
			options.d20.hasAdvantage = resolvedHasAdvantage;
			options.d20.hasDisadvantage = resolvedHasDisadvantage;
			options.d20.hasTransitAdvantage = ac5eAttackRollFlags?.hasTransitAdvantage ?? ac5eAttackFlags?.hasTransitAdvantage;
			options.d20.hasTransitDisadvantage = ac5eAttackRollFlags?.hasTransitDisadvantage ?? ac5eAttackFlags?.hasTransitDisadvantage;
			options.d20.isCritical = findRoll0?.isCritical ?? findRoll0?.options?.isCritical ?? config?.isCritical;
			options.d20.isFumble = findRoll0?.isFumble ?? findRoll0?.options?.isFumble ?? config?.isFumble;
		}
	}
	if (originatingMessage?.id) options.originatingMessageId = originatingMessage.id;
	if (originatingMessage?.speaker?.token) options.originatingSpeakerTokenId = originatingMessage.speaker.token;
	const originatingUseConfig = useConfig ? _cloneUseConfigShallow(useConfig) : null;
	if (originatingUseConfig) {
		originatingUseConfig.options ??= {};
		_mergeUseOptions(options, originatingUseConfig.options);
		if (!originatingUseConfig.options.activity && activity) {
			originatingUseConfig.options.activity = { id: activity.id, type: activity.type, uuid: activity.uuid };
		}
		const resolvedItem = item ?? activity?.item;
		if (!originatingUseConfig.options.item && resolvedItem) {
			originatingUseConfig.options.item = { id: resolvedItem.id, type: resolvedItem.type, uuid: resolvedItem.uuid };
		}
	}
	if (originatingUseConfig) options.originatingUseConfig = originatingUseConfig;
	options.messageId = resolvedMessageId ?? triggerMessageId ?? message?.id;
	options.spellLevel = hook !== 'use' && activity?.isSpell ? use?.spellLevel || item?.system.level : undefined;
	return options;
}

function firstDnd5eFlagValue(messages, key, deps) {
	for (const msg of messages) {
		const flags = _getMessageDnd5eFlags(msg);
		const value = flags?.[key];
		if (value !== undefined && value !== null) return value;
	}
	return undefined;
}

function resolveDocumentFromRef(ref) {
	if (!ref) return null;
	const documentCls = foundry?.abstract?.Document;
	if (documentCls && ref instanceof documentCls) return ref;
	const uuid = typeof ref === 'string' ? ref : ref?.uuid;
	if (typeof uuid === 'string' && uuid.includes('.')) return _safeFromUuidSync(uuid);
	return null;
}

function resolveActivityFromItem(item, activityRef) {
	if (!item || !activityRef) return null;
	const activities = item?.system?.activities;
	if (!activities) return null;
	const activityId = typeof activityRef === 'string' ? activityRef : activityRef?.id;
	const activityUuid = typeof activityRef === 'object' ? activityRef?.uuid : undefined;
	if (activityUuid) {
		const direct = _safeFromUuidSync(activityUuid);
		if (direct) return direct;
	}
	if (!activityId) return null;
	return activities.get?.(activityId) ?? activities.find?.((entry) => entry?.id === activityId || entry?.identifier === activityId || entry?.name === activityId) ?? null;
}

function firstDefined(...values) {
	for (const value of values) {
		if (value !== undefined && value !== null) return value;
	}
	return undefined;
}
