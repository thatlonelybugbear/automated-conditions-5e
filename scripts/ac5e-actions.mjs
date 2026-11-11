/** These scopes require outcomes or a canvas selection that the roll handoff cannot capture. */
export function getAa5eActionUnavailableReason(spec) {
	for (const action of spec?.actions ?? (spec ? [spec] : [])) {
		const scope = typeof action.targets === 'string' ? action.targets : action.targets?.scope;
		if (['hitTargets', 'nonHitTargets', 'damagedTargets'].includes(scope)) return 'Hit and applied-damage target scopes are unavailable on AC5E roll offers.';
		if (['allies', 'nonAllies', 'partyMembers', 'nonPartyMembers'].includes(scope)) return 'Nearby group scopes are unavailable on AC5E roll offers; use captured targets instead.';
		for (const branch of ['onSuccess', 'onFailure', 'onCancel']) {
			const reason = getAa5eActionUnavailableReason({ actions: action[branch] ?? [] });
			if (reason) return reason;
		}
	}
	return null;
}

/** Edit an effect-local action without creating a shared registry entry. */
export async function editInlineAa5eAction(currentValue = '') {
	const module = game.modules.get('aa5e');
	if (!module?.active || !module.api?.capabilities?.inlineActions) throw new Error('Enable AA5E with custom action support first.');
	const spec = module.api.decodeInlineAction(currentValue) ?? { action: 'pull', targets: 'targets', distance: 2, distanceUnit: 'grid' };
	const edited = await module.api.openEditor(spec);
	const reason = getAa5eActionUnavailableReason(edited);
	if (reason) throw new Error(reason);
	return edited ? module.api.encodeInlineAction(edited) : currentValue;
}

/** Prepare offers only; never execute actions while building or rendering a roll. */
export function prepareAa5eOffers(entries, { ac5eConfig, config, message, rolls } = {}) {
	const module = game.modules.get('aa5e');
	if (!module?.active || !module.api?.capabilities?.ac5eOffers || !message || !rolls?.length || ac5eConfig?.hookType === 'use') return;
	const options = ac5eConfig?.options ?? {};
	const resolve = (id) => id ? fromUuidSync(id, { strict: false }) : null;
	const sourceToken = resolve(options.sourceTokenUuid);
	if (options.sourceTokenUuid && !sourceToken) return;
	const actor = sourceToken?.actor ?? resolve(options.sourceActorUuid) ?? (!options.sourceActorUuid ? config?.subject?.actor ?? (config?.subject?.documentName === 'Actor' ? config.subject : null) : null);
	if (!actor) return;
	const originalTargets = options.targets ?? [];
	const targetToken = resolve(options.targetTokenUuid);
	// AC5E currently evaluates shared roll conditions against one opponent. Offer only for that opponent.
	const targets = targetToken ? [targetToken] : originalTargets.length <= 1 ? originalTargets : [];
	const activityUuid = options.activity?.uuid ?? options.activityUuid ?? options.damageActivityUuid;
	const activity = resolve(activityUuid) ?? (options.activity?.documentName === 'Activity' ? options.activity : null) ?? (!activityUuid && config?.subject?.documentName === 'Activity' ? config.subject : null);
	if (activityUuid && !activity) return;
	const offers = module.api.prepareOffers(entries.filter((entry) =>
		entry?.evaluation && entry.mode === 'info' && entry.hook === ac5eConfig.hookType && entry.actionId &&
		!getAa5eActionUnavailableReason(module.api.decodeInlineAction?.(entry.actionId) ?? module.api.getAction?.(entry.actionId)?.spec)), {
		actor, sourceToken, targets, originalTargets, activity,
		item: activity?.item ?? resolve(options.item?.uuid), hookType: ac5eConfig.hookType,
		ammunition: options.ammunition ?? null,
	});
	message.data ??= {};
	message.data.flags ??= {};
	message.data.flags.aa5e ??= {};
	message.data.flags.aa5e.offers = offers;
}
