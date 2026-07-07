const ROLL_RESULT_INFLIGHT_TTL_MS = 120000;
const rollResultInflightCache = new Map();

function pruneRollResultInflightCache(now = Date.now()) {
	for (const [key, entry] of rollResultInflightCache.entries()) {
		if (!entry?.expiresAt || entry.expiresAt <= now) rollResultInflightCache.delete(key);
	}
}

function rollResultCacheKey({ messageId, actorUuid, activityUuid } = {}) {
	return [messageId, actorUuid, activityUuid].filter(Boolean).join('|');
}

function resolveDocumentFromRef(ref) {
	if (!ref) return null;
	const documentCls = foundry?.abstract?.Document;
	if (documentCls && ref instanceof documentCls) return ref;
	const uuid = typeof ref === 'string' ? ref : ref?.uuid;
	if (typeof uuid === 'string' && uuid.includes('.')) return fromUuidSync(uuid);
	return null;
}

function resolveActivityFromMessage(message) {
	const activityRef = message?.getFlag?.('dnd5e', 'activity') ?? message?.flags?.dnd5e?.activity;
	const direct = resolveDocumentFromRef(activityRef);
	if (direct?.documentName === 'Activity') return direct;
	const itemRef = message?.getFlag?.('dnd5e', 'item') ?? message?.flags?.dnd5e?.item;
	const item = resolveDocumentFromRef(itemRef);
	const activityId = typeof activityRef === 'string' ? activityRef : activityRef?.id;
	if (!item || !activityId) return null;
	return item.system?.activities?.get?.(activityId) ?? item.system?.activities?.find?.((activity) => activity?.id === activityId || activity?.identifier === activityId || activity?.name === activityId) ?? null;
}

function getOriginatingMessage(messageId) {
	if (!messageId) return null;
	return game.messages?.get?.(messageId) ?? dnd5e?.registry?.messages?.get?.(messageId)?.[0] ?? null;
}

function getRollTargetValue(roll) {
	return roll?.options?.target ?? roll?.d20?.options?.target ?? roll?.dice?.[0]?.options?.target;
}

function setRollResultInflightCache({ messageId, actorUuid, activityUuid, rollResult } = {}) {
	if (!actorUuid || !rollResult) return;
	const expiresAt = Date.now() + ROLL_RESULT_INFLIGHT_TTL_MS;
	const keys = [
		rollResultCacheKey({ messageId, actorUuid, activityUuid }),
		rollResultCacheKey({ messageId, actorUuid }),
		rollResultCacheKey({ actorUuid, activityUuid }),
	].filter(Boolean);
	for (const key of keys) rollResultInflightCache.set(key, { rollResult: foundry.utils.duplicate(rollResult), expiresAt });
}

function getRollResultInflightCacheEntry({ messageId, actorUuid, activityUuid } = {}) {
	pruneRollResultInflightCache();
	for (const key of [
		rollResultCacheKey({ messageId, actorUuid, activityUuid }),
		rollResultCacheKey({ messageId, actorUuid }),
		rollResultCacheKey({ actorUuid, activityUuid }),
	]) {
		if (!key) continue;
		const entry = rollResultInflightCache.get(key);
		if (entry?.rollResult) return entry;
	}
	return null;
}

export function captureAllowEffectApplicationSaveResult(rolls, options) {
	const roll = Array.isArray(rolls) ? rolls[0] : null;
	const actor = options?.subject;
	if (!roll || !actor?.uuid) return;
	const originatingMessageId = roll.parent?.getFlag?.('dnd5e', 'originatingMessage') ?? roll.parent?.flags?.dnd5e?.originatingMessage;
	const originatingMessage = getOriginatingMessage(originatingMessageId);
	const activity = resolveActivityFromMessage(originatingMessage);
	const targetValue = getRollTargetValue(roll);
	const d20Total = Number(roll.total);
	const numericTargetValue = Number(targetValue);
	setRollResultInflightCache({
		messageId: originatingMessageId,
		actorUuid: actor.uuid,
		activityUuid: activity?.uuid,
		rollResult: {
			d20Total: Number.isFinite(d20Total) ? d20Total : roll.total,
			d20Result: roll.d20?.total,
			targetValue: Number.isFinite(numericTargetValue) ? numericTargetValue : targetValue,
			d20ResultOverTarget: !isNaN(d20Total - numericTargetValue) ? d20Total - numericTargetValue : undefined,
			isCritical: roll.isCritical,
			isFumble: roll.isFumble,
			isSuccess: roll.isSuccess,
			hook: 'save',
		},
	});
}

export function hydrateAllowEffectApplicationRollResult(sandbox, { targetActor, originActivity } = {}) {
	if (!sandbox || !targetActor?.uuid) return;
	const rollResult = getRollResultInflightCacheEntry({
		actorUuid: targetActor.uuid,
		activityUuid: originActivity?.uuid,
	})?.rollResult;
	if (!rollResult) return;
	sandbox.d20Total = rollResult.d20Total;
	sandbox.d20Result = rollResult.d20Result;
	sandbox.targetValue = rollResult.targetValue;
	sandbox.d20ResultOverTarget = rollResult.d20ResultOverTarget;
	sandbox.isCritical = rollResult.isCritical;
	sandbox.isFumble = rollResult.isFumble;
	sandbox.isSuccess = rollResult.isSuccess;
}
