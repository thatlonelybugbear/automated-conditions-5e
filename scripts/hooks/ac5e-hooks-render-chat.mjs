export function renderChatMessageHijack(render, elem, initialConfig, deps) {
	let getConfigAC5E = initialConfig;
	const { hookType, roller } = getConfigAC5E || {};
	if (hookType === 'use') return true;
	if (!['both', 'chat'].includes(deps.settings.showTooltips)) return true;
	const messageFlags = render?.flags?.[deps.Constants.MODULE_ID];
	const visibilityContext = messageFlags && typeof messageFlags === 'object' ? messageFlags : getConfigAC5E;
	const resolvedHookType = hookType ?? messageFlags?.hookType;
	const resolvedRoller = roller ?? messageFlags?.roller;
	if (!game.user.isGM) {
		if (deps.settings.showChatTooltips === 'none') return true;
		else if (deps.settings.showChatTooltips === 'players' && !visibilityContext?.hasPlayerOwner) return true;
		else if (deps.settings.showChatTooltips === 'owned' && visibilityContext?.ownership?.[game.user.id] !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) return true;
	}
	let targetElement, tooltip;
	if (deps.activeModule('midi-qol')) {
		if (render?.rolls?.length > 1) {
			getConfigAC5E = [render?.rolls?.[0]?.options?.[deps.Constants.MODULE_ID], render?.rolls?.[1]?.options?.[deps.Constants.MODULE_ID], render?.rolls?.[2]?.options?.[deps.Constants.MODULE_ID]];
			if (!getConfigAC5E?.[0]?.hookType) return true;
		}
		if (!getConfigAC5E.length) getConfigAC5E = [getConfigAC5E];
		for (const ac5eElement of getConfigAC5E) {
			const hT = ac5eElement?.hookType;
			if (!hT) continue;
			const forceAc5eD20Tooltip = !!ac5eElement?.forceAc5eD20Tooltip || deps.getD20TooltipOwnership(ac5eElement).forceAc5eD20Tooltip;
			if (['attack', 'check', 'save'].includes(hT) && !forceAc5eD20Tooltip) continue;
			tooltip = ac5eElement?.chatTooltip || messageFlags?.tooltipObj?.[hT] || '';
			if (tooltip === '') continue;
			let thisTargetElement;
			if (['check', 'save'].includes(hT) && forceAc5eD20Tooltip) {
				thisTargetElement =
					elem.querySelector('.message-content .dice-roll .dice-result .dice-formula') ??
					elem.querySelector('.chat-message header .flavor-text') ??
					elem.querySelector('.flavor-text') ??
					elem.querySelector('.midi-qol-saves-display');
			} else if (game.user.targets.size <= 1 && ['check', 'save'].includes(hT)) thisTargetElement = elem.querySelector('.flavor-text') ?? elem.querySelector('.midi-qol-saves-display');
			else if (['attack'].includes(hT)) thisTargetElement = elem.querySelector('.midi-qol-attack-roll');
			else if (['damage'].includes(hT)) thisTargetElement = elem.querySelector('.midi-qol-damage-roll');
			if (thisTargetElement) thisTargetElement.setAttribute('data-tooltip', tooltip);
		}
		if (deps.hookDebugEnabled('renderHijackHook')) {
			console.warn('ac5e hijack getTooltip', tooltip);
			console.warn('ac5e hijack targetElement:', targetElement);
		}
		return true;
	}
	tooltip = getConfigAC5E?.chatTooltip || messageFlags?.tooltipObj?.[messageFlags.hookType] || '';
	if (resolvedRoller === 'Core') {
		if (tooltip === '') return true;
		if (['attack', 'damage'].includes(resolvedHookType)) {
			targetElement = elem.querySelector('.dice-formula');
		} else {
			targetElement = elem.querySelector('.message-content .dice-roll .dice-result .dice-formula') ?? elem.querySelector('.chat-message header .flavor-text');
		}
	} else if (resolvedRoller === 'RSR') {
		if (['check', 'save'].includes(resolvedHookType)) targetElement = elem.querySelector('.flavor-text');
		else if (['attack'].includes(resolvedHookType)) {
			targetElement = elem.querySelector('.rsr-section-attack > .rsr-header > .rsr-title') ?? elem.querySelector('.rsr-title');
		} else if (['damage'].includes(resolvedHookType)) {
			targetElement = elem.querySelector('.rsr-section-damage > .rsr-header > .rsr-title') ?? elem.querySelector('.rsr-title');
		}
	}
	if (deps.hookDebugEnabled('renderHijackHook')) {
		console.warn('ac5e hijack getTooltip', tooltip);
		console.warn('ac5e hijack targetElement:', targetElement);
	}
	if (targetElement) targetElement.setAttribute('data-tooltip', tooltip);
	return true;
}
