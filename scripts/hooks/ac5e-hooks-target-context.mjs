export function getMessageTargetsFromFlags(messageLike, deps) {
	return deps.getMessageDnd5eFlags(messageLike)?.targets ?? [];
}

export function getTargets({ message } = {}, deps) {
	const explicitMessage = message?.document ?? message;
	const preTargets = deps.getMessageFlagScope(explicitMessage, deps.Constants.MODULE_ID)?.optionsSnapshot?.targets ?? deps.getMessageDnd5eFlags(explicitMessage)?.targets;
	if (Array.isArray(preTargets) && preTargets.length) return preTargets;
	return [];
}

export function hydrateTargetACs(targets = [], { allowLiveFallback = true } = {}) {
	if (!Array.isArray(targets)) return [];
	return targets.map((target) => {
		if (!target || typeof target !== 'object') return target;
		if (isForcedSentinelAC(target.ac)) return { ...target, ac: null };
		const snapshotAC = Number(target.ac);
		if (Number.isFinite(snapshotAC)) return { ...target, ac: snapshotAC };
		if (!allowLiveFallback) return target;
		const liveAC = getLiveTargetAC(target);
		if (liveAC !== null) return { ...target, ac: liveAC };
		return target;
	});
}

export function resolveTargets(message, messageTargets, { hook, activity } = {}, deps) {
	const freshTargets = getTargets({ message }, deps);
	if (Array.isArray(freshTargets) && freshTargets.length) return hydrateTargetACs(freshTargets, { allowLiveFallback: false });
	if (Array.isArray(messageTargets) && messageTargets.length) return hydrateTargetACs(messageTargets, { allowLiveFallback: false });
	if (hook === 'save' && activity?.target?.affects?.type === 'self') {
		const explicitMessage = message?.document ?? message;
		const speakerToken = explicitMessage?.speaker?.token ? canvas.tokens.get(explicitMessage.speaker.token) : null;
		if (speakerToken?.actor) {
			return [
				{
					ac: speakerToken.actor.system?.attributes?.ac?.value ?? null,
					uuid: speakerToken.actor.uuid,
					tokenUuid: speakerToken.document?.uuid,
					name: speakerToken.name,
					img: speakerToken.document?.texture?.src,
				},
			];
		}
	}
	if (!game.user?.targets?.size) return [];
	const userTargets = [...game.user.targets].map((target) => ({
		ac: target.actor?.system?.attributes?.ac?.value ?? null,
		uuid: target.actor?.uuid,
		tokenUuid: target.document.uuid,
		name: target.name,
		img: target.document.texture.src,
	}));
	if (Array.isArray(userTargets) && userTargets.length) return hydrateTargetACs(userTargets, { allowLiveFallback: true });
	return [];
}

export function syncResolvedTargetsToMessage(message, targets, deps) {
	if (!message || !Array.isArray(targets)) return;
	const nextTargets = foundry.utils.duplicate(targets);
	const currentAc5eFlags = deps.getMessageFlagScope(message, deps.Constants.MODULE_ID);
	const nextAc5eFlags =
		currentAc5eFlags && typeof currentAc5eFlags === 'object' ?
			foundry.utils.mergeObject(foundry.utils.duplicate(currentAc5eFlags), { optionsSnapshot: { targets: foundry.utils.duplicate(nextTargets) } }, { inplace: false })
		:	{ optionsSnapshot: { targets: foundry.utils.duplicate(nextTargets) } };
	try {
		foundry.utils.setProperty(message, 'data.flags.dnd5e.targets', nextTargets);
		foundry.utils.setProperty(message, `data.flags.${deps.Constants.MODULE_ID}`, nextAc5eFlags);
	} catch (_err) {
		// ignore immutable message-like payloads
	}
}

export function getAssociatedRollTargets(originatingMessageId, activityType) {
	if (!originatingMessageId || !activityType) return undefined;
	return dnd5e.registry?.messages?.get(originatingMessageId, activityType)?.pop()?.flags?.dnd5e?.targets;
}

export function getPersistedTargetsForHook(ac5eConfig, config, message, deps) {
	const hookType = ac5eConfig?.hookType;
	if (hookType === 'damage') {
		const damageActivityType = ac5eConfig?.options?.activity?.type ?? config?.subject?.type;
		const originatingMessageId = ac5eConfig?.options?.originatingMessageId ?? config?.options?.originatingMessageId;
		const associatedTargets = getAssociatedRollTargets(originatingMessageId, damageActivityType);
		if (Array.isArray(associatedTargets) && associatedTargets.length) return associatedTargets;
	}
	const flaggedTargets = getMessageTargetsFromFlags(message, deps);
	if (Array.isArray(flaggedTargets) && flaggedTargets.length) return flaggedTargets;
	return Array.isArray(ac5eConfig?.options?.targets) ? ac5eConfig.options.targets : [];
}

export function syncTargetsToConfigAndMessage(ac5eConfig, targets, message, deps) {
	const resolvedTargets =
		Array.isArray(targets) ? targets
		: Array.isArray(ac5eConfig?.options?.targets) ? ac5eConfig.options.targets
		: null;
	if (!resolvedTargets) return;
	if (ac5eConfig && typeof ac5eConfig === 'object') {
		ac5eConfig.options ??= {};
		if (Object.isExtensible(ac5eConfig.options)) ac5eConfig.options.targets = foundry.utils.duplicate(resolvedTargets);
	}
	syncResolvedTargetsToMessage(message, resolvedTargets, deps);
}

function isForcedSentinelAC(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) && Math.abs(numeric) === 999;
}

function getLiveTargetAC(target = {}) {
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
