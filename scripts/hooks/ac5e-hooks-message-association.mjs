export function getLatestAssociatedMessage(messageId, hook) {
	if (!messageId) return undefined;
	const preferredHooks = Array.isArray(hook) ? hook : [hook];
	for (const preferredHook of preferredHooks.filter(Boolean)) {
		const associated = dnd5e?.registry?.messages?.get(messageId, preferredHook)?.pop?.();
		if (associated) return associated;
	}
	return undefined;
}

export function getPreferredAssociatedHooks({ hook, activity } = {}) {
	if (hook !== 'damage') return [hook];
	const activityType = String(activity?.type ?? activity?.activity?.type ?? '')
		.trim()
		.toLowerCase();
	if (['attack', 'save', 'check'].includes(activityType)) return [activityType];
	return [];
}

export function getResolvedHookActivity(config, activity) {
	return activity ?? config?.subject ?? config?.activity ?? config?.options?.activity ?? config?.originatingUseConfig?.options?.activity;
}

export function getAssociatedRollMessage({ hook, activity, originatingMessage, config, resolvedMessageId, triggerMessageId } = {}) {
	const resolvedActivity = getResolvedHookActivity(config, activity);
	const relatedHooks = getPreferredAssociatedHooks({ hook, activity: resolvedActivity });
	if (!relatedHooks.length) return undefined;
	const anchoredOriginatingMessageId = originatingMessage?.id ?? config?.options?.originatingMessageId ?? resolvedMessageId ?? triggerMessageId;
	return getLatestAssociatedMessage(anchoredOriginatingMessageId, relatedHooks);
}
