import { _buildStandardTooltipFromLines } from '../ac5e-helpers.mjs';

export function renderChatMessageHijack(render, elem, initialConfig, deps) {
	const hasDomApi = typeof elem?.querySelector === 'function';
	const hasJqueryApi = typeof elem?.find === 'function';
	if (!hasDomApi && !hasJqueryApi) return true;
	let getConfigAC5E = initialConfig;
	const { hookType, roller } = getConfigAC5E || {};
	const messageFlags = render?.flags?.[deps.Constants.MODULE_ID];
	applyPreferredDisplayFormulas(render, elem, deps);
	if (!['both', 'chat'].includes(deps.settings.showTooltips)) return true;
	const visibilityContext = messageFlags && typeof messageFlags === 'object' ? messageFlags : getConfigAC5E;
	const resolvedHookType = hookType ?? messageFlags?.hookType;
	const resolvedRoller = roller ?? messageFlags?.roller;
	const useJquery = resolvedRoller === 'RSR' && hasJqueryApi;
	const queryOne = (selector) => (useJquery ? elem.find(selector)?.[0] ?? null : elem.querySelector(selector));
	const queryAll = (selector) => (useJquery ? Array.from(elem.find(selector) ?? []) : Array.from(elem.querySelectorAll(selector)));
	const setTooltip = (node, value) => {
		if (!node) return;
		node.setAttribute('data-tooltip', value);
		node.removeAttribute('title');
	};
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
					queryOne('.message-content .dice-roll .dice-result .dice-formula') ??
					queryOne('.chat-message header .flavor-text') ??
					queryOne('.flavor-text') ??
					queryOne('.midi-qol-saves-display');
			} else if (game.user.targets.size <= 1 && ['check', 'save'].includes(hT)) thisTargetElement = queryOne('.flavor-text') ?? queryOne('.midi-qol-saves-display');
			else if (['attack'].includes(hT)) thisTargetElement = queryOne('.midi-qol-attack-roll');
			else if (['damage'].includes(hT)) thisTargetElement = queryOne('.midi-qol-damage-roll');
			if (thisTargetElement) setTooltip(thisTargetElement, tooltip);
		}
		if (deps.hookDebugEnabled('renderHijackHook')) {
			console.warn('ac5e hijack getTooltip', tooltip);
			console.warn('ac5e hijack targetElement:', targetElement);
		}
		bindUseMessageTargetADCTooltip(elem, messageFlags, deps, queryAll, setTooltip);
		return true;
	}
	tooltip = getConfigAC5E?.chatTooltip || messageFlags?.tooltipObj?.[messageFlags.hookType] || '';
	if (resolvedRoller === 'Core') {
		if (tooltip === '') return true;
		if (['attack', 'damage'].includes(resolvedHookType)) {
			targetElement = queryOne('.dice-formula');
		} else {
			targetElement = queryOne('.message-content .dice-roll .dice-result .dice-formula') ?? queryOne('.chat-message header .flavor-text');
		}
	} else if (resolvedRoller === 'RSR') {
		if (['check', 'save'].includes(resolvedHookType)) {
			if (useJquery) elem.find('button[data-action="rollSave"], button[data-action="rollCheck"], a[data-action="rollSave"], a[data-action="rollCheck"]').attr('data-tooltip', tooltip).removeAttr('title');
			targetElement = queryOne('.flavor-text');
		} else if (['attack'].includes(resolvedHookType)) {
			targetElement = queryOne('.rsr-section-attack > .rsr-header > .rsr-title') ?? queryOne('.rsr-title');
		} else if (['damage'].includes(resolvedHookType)) {
			targetElement = queryOne('.rsr-section-damage > .rsr-header > .rsr-title') ?? queryOne('.rsr-title');
		}
	}
	if (deps.hookDebugEnabled('renderHijackHook')) {
		console.warn('ac5e hijack getTooltip', tooltip);
		console.warn('ac5e hijack targetElement:', targetElement);
	}
	if (targetElement) setTooltip(targetElement, tooltip);
	bindUseMessageTargetADCTooltip(elem, messageFlags, deps, queryAll, setTooltip);
	return true;
}

function applyPreferredDisplayFormulas(render, elem, deps) {
	const formulaElements = typeof elem?.querySelectorAll === 'function' ? Array.from(elem.querySelectorAll('.dice-formula')) : [];
	if (!formulaElements.length) return;
	const displayFormulas = (Array.isArray(render?.rolls) ? render.rolls : []).map((roll) => String(roll?.options?.[deps.Constants.MODULE_ID]?.displayFormula ?? '').trim());
	if (!displayFormulas.some(Boolean)) return;
	if (formulaElements.length === 1) {
		const single = displayFormulas.find(Boolean);
		if (single) formulaElements[0].textContent = single;
		return;
	}
	for (let index = 0; index < formulaElements.length; index++) {
		const displayFormula = displayFormulas[index];
		if (!displayFormula) continue;
		formulaElements[index].textContent = displayFormula;
	}
}

function bindUseMessageTargetADCTooltip(elem, messageFlags, deps = {}, queryAll = () => [], setTooltip = () => {}) {
	const resolvedTargetADC = messageFlags?.resolvedTargetADC;
	const hoverLines = Array.isArray(resolvedTargetADC?.hoverLines) ? resolvedTargetADC.hoverLines.filter(Boolean) : [];
	if (!hoverLines.length) return true;
	const tooltip = _buildStandardTooltipFromLines(hoverLines, { showNameTooltips: !!deps?.settings?.showNameTooltips, noChangesKey: 'AC5E.NoChanges' });
	const targetButtons = queryAll('button[data-action="rollSave"], button[data-action="rollCheck"], a[data-action="rollSave"], a[data-action="rollCheck"]');
	if (!targetButtons?.length) return true;
	for (const button of targetButtons) {
		setTooltip(button, tooltip);
	}
	return true;
}
