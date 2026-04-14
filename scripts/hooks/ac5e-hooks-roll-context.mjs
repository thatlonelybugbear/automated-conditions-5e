import { debugMessageData, resolveMessageDataContext } from './ac5e-hooks-message-data.mjs';
import { _safeFromUuidSync } from '../ac5e-helpers.mjs';

export function getHookMessageData(config, hook, fallbackMessage, deps) {
	const context = resolveMessageDataContext(config, hook, fallbackMessage, deps) ?? {};
	debugMessageData(hook, context, deps);
	return {
		...context,
		options: context.options ?? {},
		messageForTargets: context.messageForTargets ?? context.message ?? fallbackMessage,
	};
}

export function prepareHookTargetsAndDamage({ options, hook, activity, messageForTargets, messageTargets, rolls, damageSource = 'activity' } = {}, deps) {
	if (!options || typeof options !== 'object') return;
	options.hook = hook;
	options.activity = activity;
	options.targets = deps.resolveTargets(messageForTargets, messageTargets, { hook, activity }, deps);
	if (damageSource === 'roll') deps.collectRollDamageTypes(rolls, options);
	else deps.collectActivityDamageTypes(activity, options);
}

export function logResolvedTargets(label, subjectToken, opponentToken, options) {
	if (!ac5e?.debugTargets) return;
	console.warn(`AC5E targets ${label}`, {
		subjectTokenId: subjectToken?.id,
		opponentTokenId: opponentToken?.id,
		distance: options?.distance,
		targetCount: options?.targets?.length ?? 0,
		targetTokenUuids: (options?.targets ?? []).map((target) => target?.tokenUuid).filter(Boolean),
	});
}

export function getSubjectTokenForHook(hook, message, actor, deps) {
	if (hook === 'save' || hook === 'check') {
		if (actor) return deps.getTokenFromActor(actor) ?? actor.getActiveTokens?.()?.[0];
	}
	const speakerTokenId = message?.speaker?.token;
	if (speakerTokenId) return canvas.tokens.get(speakerTokenId);
	if (actor) return deps.getTokenFromActor(actor) ?? actor.getActiveTokens?.()?.[0];
	return undefined;
}

export function getOpponentTokenForSave(options, activity, subjectToken, deps) {
	const useTokenId = options?.originatingSpeakerTokenId ?? options?.originatingUseConfig?.tokenId;
	if (useTokenId) {
		const token = canvas.tokens.get(useTokenId);
		if (token && token !== subjectToken) return token;
	}
	const activityActor = activity?.actor ?? activity?.item?.actor;
	const activityToken = activityActor ? (deps.getTokenFromActor(activityActor) ?? activityActor.getActiveTokens?.()?.[0]) : undefined;
	if (activityToken && activityToken !== subjectToken) return activityToken;
	const targetActorUuid = options?.targets?.[0]?.uuid;
	const targetActor = targetActorUuid ? _safeFromUuidSync(targetActorUuid) : undefined;
	const targetToken = getSingleTargetToken(options?.targets) ?? targetActor?.getActiveTokens?.()?.[0];
	if (targetToken && targetToken !== subjectToken) return targetToken;
	return undefined;
}

export function getSingleTargetToken(messageTargets) {
	if (!Array.isArray(messageTargets) || !messageTargets.length) return undefined;
	const tokenUuid = messageTargets[0]?.tokenUuid;
	if (!tokenUuid) return undefined;
	const tokenDoc = _safeFromUuidSync(tokenUuid);
	return tokenDoc?.object ?? canvas.tokens?.get(tokenDoc?.id);
}
