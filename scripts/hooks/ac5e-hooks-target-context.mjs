export function getMessageTargetsFromFlags(messageLike, deps) {
	return normalizeTargets(deps.getMessageDnd5eFlags(messageLike)?.targets ?? []);
}

export function logTargetState(label, payload = {}) {
	if (!globalThis.ac5e?.debug?.getTargets) return;
	try {
		console.warn(`AC5E ${label} ${JSON.stringify(stringifyTargetPayload(payload))}`);
	} catch {
		console.warn(`AC5E ${label}`, stringifyTargetPayload(payload));
	}
}

export function getTargets({ message } = {}, deps) {
	const explicitMessage = message?.document ?? message;
	const preTargets = getMessageTargetsFromFlags(explicitMessage, deps);
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
	if (Array.isArray(freshTargets) && freshTargets.length) {
		return hydrateTargetACs(freshTargets, { allowLiveFallback: false });
	}
	if (Array.isArray(messageTargets) && messageTargets.length) {
		return hydrateTargetACs(messageTargets, { allowLiveFallback: false });
	}
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
	const nextTargets = foundry.utils.duplicate(normalizeTargets(targets));
	try {
		foundry.utils.setProperty(message, 'data.flags.dnd5e.targets', nextTargets);
	} catch (_err) {
		// ignore immutable message-like payloads
	}
}

export function getAssociatedRollTargets(originatingMessageId, activityType, messageLike, deps) {
	const explicitMessage = messageLike?.document ?? messageLike;
	const directTargets = explicitMessage ? getMessageTargetsFromFlags(explicitMessage, deps) : undefined;
	if (Array.isArray(directTargets) && directTargets.length) return directTargets;
	return undefined;
}

export function getPersistedTargetsForHook(ac5eConfig, config, message, deps) {
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
		const nextTargets = foundry.utils.duplicate(resolvedTargets);
		if (Object.isExtensible(ac5eConfig.options)) ac5eConfig.options.targets = foundry.utils.duplicate(nextTargets);
		ac5eConfig.currentTargets = nextTargets;
	}
	syncResolvedTargetsToMessage(message, resolvedTargets, deps);
}

function normalizeTargets(targets = []) {
	if (!Array.isArray(targets)) return [];
	return targets
		.map((target) => normalizeTarget(target))
		.filter(Boolean);
}

function stringifyTargetPayload(payload = {}) {
	const next = { ...payload };
	if ('messageTargets' in next) next.messageTargets = summarizeTargets(next.messageTargets);
	if ('optionTargets' in next) next.optionTargets = summarizeTargets(next.optionTargets);
	if ('liveTargets' in next) next.liveTargets = summarizeTargets(next.liveTargets);
	return next;
}

function summarizeTargets(targets = []) {
	if (!Array.isArray(targets)) return [];
	return targets.map((target) => {
		if (!target || typeof target !== 'object') return target;
		return {
			name: target.name ?? null,
			tokenUuid: target.tokenUuid ?? target.token?.uuid ?? target.document?.uuid ?? null,
			uuid: target.uuid ?? null,
			ac: Number.isFinite(Number(target.ac)) ? Number(target.ac) : target.ac ?? null,
		};
	});
}

function normalizeTarget(target) {
	if (!target || typeof target !== 'object') return target;
	const normalized = foundry.utils.duplicate(target);
	const explicitTokenUuid = normalized.tokenUuid ?? normalized.token?.uuid ?? normalized.document?.uuid;
	if (explicitTokenUuid) normalized.tokenUuid = explicitTokenUuid;
	const resolvedDocument = resolveTargetDocument(normalized);
	const resolvedTokenUuid =
		normalized.tokenUuid ??
		(resolvedDocument instanceof TokenDocument ? resolvedDocument.uuid : resolvedDocument?.document instanceof TokenDocument ? resolvedDocument.document.uuid : null);
	if (resolvedTokenUuid) normalized.tokenUuid = resolvedTokenUuid;
	const resolvedActor =
		resolvedDocument instanceof Actor ? resolvedDocument
		: resolvedDocument?.actor ?? resolvedDocument?.object?.actor ?? null;
	if (!normalized.uuid && resolvedActor?.uuid) normalized.uuid = resolvedActor.uuid;
	if (!normalized.name) normalized.name = resolvedDocument?.name ?? resolvedDocument?.object?.name ?? resolvedActor?.name ?? normalized.name;
	if (!normalized.img) normalized.img = resolvedDocument?.texture?.src ?? resolvedDocument?.object?.document?.texture?.src ?? resolvedActor?.img ?? normalized.img;
	return normalized;
}

function resolveTargetDocument(target = {}) {
	const tokenUuid = target?.tokenUuid;
	if (tokenUuid) return fromUuidSync(tokenUuid);
	const uuid = target?.uuid;
	if (uuid) return fromUuidSync(uuid);
	return null;
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
