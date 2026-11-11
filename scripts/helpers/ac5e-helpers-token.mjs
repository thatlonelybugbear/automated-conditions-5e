// Document identity must remain usable without a rendered scene or Level.
export function getTokenDocument(value) {
	if (typeof value === 'string') {
		try { value = fromUuidSync(value, { strict: false }); }
		catch { return null; }
	}
	return value?.documentName === 'Token' ? value : value?.document?.documentName === 'Token' ? value.document : null;
}

export function getTokenPlaceable(value) {
	const document = getTokenDocument(value);
	if (!document) return null;
	if (document.parent !== globalThis.canvas?.scene || document.viewed === false || document.rendered === false) return null;
	const token = document.object;
	return token && !token.destroyed ? token : null;
}

export function getSpeakerTokenDocument(speaker) {
	return speaker?.scene && speaker?.token ? getTokenDocument(`Scene.${speaker.scene}.Token.${speaker.token}`) : null;
}

export function getActorTokenDocument(actor, speaker) {
	if (!actor) return null;
	if (actor.token) return getTokenDocument(actor.token);
	const spoken = getSpeakerTokenDocument(speaker);
	if (spoken?.actor === actor) return spoken;
	const tokens = actor.getActiveTokens?.(false, true) ?? [];
	return tokens.find((document) => getTokenPlaceable(document)) ?? tokens[0] ?? null;
}

export function captureRollTokenDocuments(options, actor, { speaker, subjectToken, opponentToken } = {}) {
	const source = getTokenDocument(options.sourceTokenUuid) ?? getTokenDocument(subjectToken) ?? getActorTokenDocument(actor, speaker);
	const explicitTarget = options.targets?.[0];
	const activityActor = options.activity?.actor ?? options.activity?.item?.actor;
	const isResponse = ['save', 'check'].includes(options.hook);
	const selectedTarget = [getTokenDocument(opponentToken), getTokenDocument(options.targetTokenUuid)].find((document) => document?.uuid && options.targets?.some((target) => {
		const tokenUuid = target?.tokenUuid ?? target?.token?.uuid ?? target?.token;
		return tokenUuid ? tokenUuid === document.uuid : document.actor?.uuid && (target?.uuid ?? target?.actor) === document.actor.uuid;
	})) ?? getTokenDocument(explicitTarget?.tokenUuid ?? explicitTarget?.token);
	let target = options._ac5eSourceOnly ? null : (isResponse
		? getTokenDocument(options.originatingSpeakerTokenUuid) ?? (activityActor !== actor ? getActorTokenDocument(activityActor) : null) ?? getTokenDocument(opponentToken) ?? selectedTarget
		: selectedTarget ?? (!explicitTarget ? getTokenDocument(opponentToken) : null)
			?? (options.activity?.target?.affects?.type === 'self' ? source : null))
		?? (!explicitTarget ? getTokenDocument(options.targetTokenUuid) : null);
	if (isResponse && source?.uuid && target?.uuid === source.uuid) {
		target = null;
		delete options.targetActorUuid;
	}
	if (source) options.sourceTokenUuid = source.uuid;
	if (source?.actor) options.sourceActorUuid = source.actor.uuid;
	if (target) options.targetTokenUuid = target.uuid;
	else delete options.targetTokenUuid;
	if (target?.actor) options.targetActorUuid = target.actor.uuid;
	else if (explicitTarget || options._ac5eSourceOnly) delete options.targetActorUuid;
	return { source, target };
}
