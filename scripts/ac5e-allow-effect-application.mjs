import Constants from './ac5e-constants.mjs';

const ROLL_RESULT_INFLIGHT_TTL_MS = 120000;
const rollResultInflightCache = new Map();

function pruneRollResultInflightCache(now = Date.now()) {
	for (const [key, entry] of rollResultInflightCache.entries()) {
		if (!entry?.expiresAt || entry.expiresAt <= now) rollResultInflightCache.delete(key);
	}
}

function rollResultCacheKey({ messageId, actorUuid, tokenUuid, activityUuid } = {}) {
	return [messageId, tokenUuid ?? actorUuid, activityUuid].filter(Boolean).join('|');
}

function getRollSpeakerTokenUuid(roll) {
	const speaker = roll?.parent?.speaker;
	return speaker?.scene && speaker?.token ? game.scenes?.get?.(speaker.scene)?.tokens?.get?.(speaker.token)?.uuid : undefined;
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

function getMessageTargets(message) {
	return (
		message?.getFlag?.(Constants.MODULE_ID, 'optionsSnapshot')?.targets ??
		message?.flags?.[Constants.MODULE_ID]?.optionsSnapshot?.targets ??
		message?.getFlag?.('dnd5e', 'targets') ??
		message?.flags?.dnd5e?.targets ??
		[]
	);
}

function resolveTargetActor(target) {
	const actorRef = target?.actor ?? target?.actorUuid ?? target?.uuid;
	const actor = resolveDocumentFromRef(actorRef);
	if (actor?.documentName === 'Actor') return actor;
	const tokenRef = target?.token ?? target?.tokenUuid;
	const token = resolveDocumentFromRef(tokenRef);
	return token?.actor ?? token?.object?.actor ?? null;
}

function getTargetAC(target) {
	const targetAC = Number(target?.ac);
	if (Number.isFinite(targetAC)) return targetAC;
	const actorAC = Number(resolveTargetActor(target)?.system?.attributes?.ac?.value);
	return Number.isFinite(actorAC) ? actorAC : undefined;
}

function resolveAttackTargets(options, originatingMessage) {
	const candidates = [
		options?.targets,
		options?.[Constants.MODULE_ID]?.options?.targets,
		options?.[Constants.MODULE_ID]?.preAC5eConfig?.options?.targets,
		getMessageTargets(originatingMessage),
	];
	for (const candidate of candidates) {
		if (Array.isArray(candidate) && candidate.length) return candidate;
	}
	return [];
}

function setRollResultInflightCache({ messageId, actorUuid, tokenUuid, activityUuid, rollResult } = {}) {
	if (!actorUuid || !rollResult) return;
	const expiresAt = Date.now() + ROLL_RESULT_INFLIGHT_TTL_MS;
	const keys = [
		tokenUuid ? rollResultCacheKey({ messageId, tokenUuid, activityUuid }) : null,
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

function resolveRollSubject(options, hook) {
	if (hook === 'attack') return options?.subject?.actor;
	return options?.subject;
}

function resolveRollActivity(options, originatingMessage) {
	return options?.activity ?? (options?.subject?.documentName === 'Activity' ? options.subject : resolveActivityFromMessage(originatingMessage));
}

function captureAllowEffectApplicationRollResult({ roll, actor, activity, messageId, hook = 'save', targetValue } = {}) {
	if (!roll || !actor?.uuid) return;
	const originatingMessageId = messageId ?? roll.parent?.getFlag?.('dnd5e', 'originatingMessage') ?? roll.parent?.flags?.dnd5e?.originatingMessage;
	const originatingMessage = getOriginatingMessage(originatingMessageId);
	const resolvedActivity = activity ?? resolveActivityFromMessage(originatingMessage);
	const resolvedTargetValue = targetValue ?? getRollTargetValue(roll);
	const isNumericRollValue = (value) => (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
	const d20Total = isNumericRollValue(roll.total) ? Number(roll.total) : undefined;
	const numericTargetValue = Number(resolvedTargetValue);
	const hasTargetValue = isNumericRollValue(resolvedTargetValue);
	const d20TotalOverTarget = Number.isFinite(d20Total) && hasTargetValue ? d20Total - numericTargetValue : undefined;
	setRollResultInflightCache({
		messageId: originatingMessageId,
		actorUuid: actor.uuid,
		tokenUuid: hook === 'attack' ? undefined : getRollSpeakerTokenUuid(roll),
		activityUuid: resolvedActivity?.uuid,
		rollResult: {
			d20Total: Number.isFinite(d20Total) ? d20Total : roll.total,
			d20Result: roll.d20?.total,
			targetValue: Number.isFinite(numericTargetValue) ? numericTargetValue : resolvedTargetValue,
			d20TotalOverTarget,
			d20ResultOverTarget: d20TotalOverTarget,
			attackRollTotal: hook === 'attack' ? (Number.isFinite(d20Total) ? d20Total : roll.total) : undefined,
			attackRollD20: hook === 'attack' ? roll.d20?.total : undefined,
			attackRollOverAC: hook === 'attack' ? d20TotalOverTarget : undefined,
			isCritical: roll.isCritical,
			isFumble: roll.isFumble,
			isSuccess: roll.isSuccess,
			hook,
		},
	});
}

export function captureAllowEffectApplicationD20Result(rolls, options, hook = 'save') {
	const roll = Array.isArray(rolls) ? rolls[0] : null;
	const actor = resolveRollSubject(options, hook);
	if (!roll || !actor?.uuid) return;
	const originatingMessageId = options?.originatingMessageId ?? roll.options?.[Constants.MODULE_ID]?.options?.originatingMessageId ?? roll.parent?.getFlag?.('dnd5e', 'originatingMessage') ?? roll.parent?.flags?.dnd5e?.originatingMessage;
	const originatingMessage = getOriginatingMessage(originatingMessageId);
	const activity = resolveRollActivity(options, originatingMessage);
	if (hook === 'attack') {
		const targets = resolveAttackTargets(options, originatingMessage);
		let capturedTarget = false;
		for (const target of targets) {
			const targetActor = resolveTargetActor(target);
			if (!targetActor?.uuid) continue;
			capturedTarget = true;
			captureAllowEffectApplicationRollResult({ roll, actor: targetActor, activity, messageId: originatingMessageId, hook, targetValue: getTargetAC(target) });
		}
		if (capturedTarget) return;
	}
	captureAllowEffectApplicationRollResult({ roll, actor, activity, messageId: originatingMessageId, hook });
}

export function hydrateDamageSaveRollResult(options, { targetToken, targetActor, originActivity } = {}) {
	if (!options || originActivity?.type !== 'save' || !options.originatingMessageId || !targetActor?.uuid) return;
	pruneRollResultInflightCache();
	const tokenKey = rollResultCacheKey({ messageId: options.originatingMessageId, tokenUuid: targetToken?.document?.uuid, activityUuid: originActivity.uuid });
	const actorKey = rollResultCacheKey({ messageId: options.originatingMessageId, actorUuid: targetActor.uuid, activityUuid: originActivity.uuid });
	const rollResult = rollResultInflightCache.get(tokenKey)?.rollResult ?? rollResultInflightCache.get(actorKey)?.rollResult;
	if (!rollResult || rollResult.hook !== 'save') return;
	options.d20 = { ...(options.d20 ?? {}), ...foundry.utils.duplicate(rollResult) };
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
	sandbox.d20TotalOverTarget = rollResult.d20TotalOverTarget ?? rollResult.d20ResultOverTarget;
	sandbox.d20ResultOverTarget = sandbox.d20TotalOverTarget;
	if (rollResult.attackRollTotal !== undefined) sandbox.attackRollTotal = rollResult.attackRollTotal;
	if (rollResult.attackRollD20 !== undefined) sandbox.attackRollD20 = rollResult.attackRollD20;
	if (rollResult.attackRollOverAC !== undefined) sandbox.attackRollOverAC = rollResult.attackRollOverAC;
	sandbox.isCritical = rollResult.isCritical;
	sandbox.isFumble = rollResult.isFumble;
	sandbox.isSuccess = rollResult.isSuccess;
	if (typeof sandbox.isSuccess !== 'boolean' && sandbox.d20TotalOverTarget !== undefined) {
		if (rollResult.hook === 'attack' && sandbox.d20Result === 1) sandbox.isSuccess = false;
		else if (rollResult.hook === 'attack' && sandbox.d20Result === 20) sandbox.isSuccess = true;
		else sandbox.isSuccess = sandbox.d20TotalOverTarget >= 0;
	}
	sandbox.isFail = typeof sandbox.isSuccess === 'boolean' ? !sandbox.isSuccess : undefined;
}
