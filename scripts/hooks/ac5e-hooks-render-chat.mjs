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
		void syncMidiRenderedSaveDC({ render, elem, getConfigAC5E, messageFlags });
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

async function syncMidiRenderedSaveDC({ render, elem, getConfigAC5E, messageFlags } = {}) {
	try {
		const ac5eEntries = Array.isArray(getConfigAC5E) ? getConfigAC5E : [getConfigAC5E];
		const saveConfig =
			ac5eEntries.find((entry) => ['check', 'save'].includes(entry?.hookType) && hasAlteredTargetADC(entry)) ??
			(['check', 'save'].includes(messageFlags?.hookType) && hasAlteredTargetADC(messageFlags) ? messageFlags : undefined);
		const resolvedTargetADC = resolveMidiRenderedTargetADC({ render, elem, saveConfig, messageFlags });
		if (!resolvedTargetADC) return;
		const { initialTargetADC, alteredTargetADC } = resolvedTargetADC;
		if (!Number.isFinite(initialTargetADC) || !Number.isFinite(alteredTargetADC) || initialTargetADC === alteredTargetADC) return;
		const saveDisplay = elem?.querySelector('.midi-qol-saves-display');
		if (!saveDisplay) return;
		const resolvedTargetCount = saveDisplay.querySelectorAll('.midi-qol-save-class').length;
		const useWildcardMarker = resolvedTargetCount !== 1;
		const domWasUpdated = patchMidiRenderedSaveDC(saveDisplay, initialTargetADC, alteredTargetADC, useWildcardMarker);
		if (!domWasUpdated) return;
		const messageContent = String(render?.content ?? '');
		if (!messageContent.includes('midi-qol-saveDC')) return;
		const nextContent =
			useWildcardMarker ?
				markMidiSaveDCLabelsModified(messageContent, initialTargetADC)
			:	replaceMidiSaveDCContent(messageContent, initialTargetADC, alteredTargetADC);
		if (!nextContent || nextContent === messageContent || typeof render?.update !== 'function') return;
		await render.update({ content: nextContent });
	} catch (err) {
		console.warn('AC5E failed to sync rendered Midi save DC content', err);
	}
}

function hasAlteredTargetADC(ac5eConfig) {
	const initialTargetADC = Number(ac5eConfig?.initialTargetADC);
	const alteredTargetADC = Number(ac5eConfig?.alteredTargetADC);
	return Number.isFinite(initialTargetADC) && Number.isFinite(alteredTargetADC) && initialTargetADC !== alteredTargetADC;
}

function resolveMidiRenderedTargetADC({ render, elem, saveConfig, messageFlags } = {}) {
	if (hasAlteredTargetADC(saveConfig)) {
		return {
			initialTargetADC: Number(saveConfig.initialTargetADC),
			alteredTargetADC: Number(saveConfig.alteredTargetADC),
		};
	}
	if (hasAlteredTargetADC(messageFlags)) {
		return {
			initialTargetADC: Number(messageFlags.initialTargetADC),
			alteredTargetADC: Number(messageFlags.alteredTargetADC),
		};
	}
	const content = String(render?.content ?? '');
	const domHints = Array.from(elem?.querySelectorAll?.('[data-tooltip-html]') ?? [])
		.map((node) => String(node?.getAttribute?.('data-tooltip-html') ?? ''))
		.filter(Boolean);
	const regex = buildModifiedDCPattern();
	for (const source of [...domHints, content]) {
		const match = regex.exec(source);
		if (!match) continue;
		const alteredTargetADC = Number(match[1]);
		const initialTargetADC = Number(match[2]);
		if (!Number.isFinite(initialTargetADC) || !Number.isFinite(alteredTargetADC) || initialTargetADC === alteredTargetADC) continue;
		return { initialTargetADC, alteredTargetADC };
	}
	return null;
}

function buildModifiedDCPattern() {
	const label = String(game?.i18n?.localize?.('AC5E.ModifyDC') ?? 'Modified DC').trim();
	const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
	return new RegExp(`${escaped}\\s+(\\d+)\\s*\\((\\d+)\\)`, 'i');
}

function patchMidiRenderedSaveDC(saveDisplay, initialTargetADC, alteredTargetADC, useWildcardMarker) {
	if (!saveDisplay) return false;
	const baseLabel = `DC ${initialTargetADC}`;
	const nextLabel = useWildcardMarker ? `DC ${initialTargetADC} (*)` : `DC ${alteredTargetADC}`;
	let didChange = false;
	for (const label of saveDisplay.querySelectorAll('.midi-qol-saveDC')) {
		if (label?.textContent?.trim() !== baseLabel) continue;
		label.textContent = nextLabel;
		didChange = true;
	}
	if (useWildcardMarker) return didChange;
	for (const total of saveDisplay.querySelectorAll('.midi-qol-save-total[data-tooltip]')) {
		const tooltip = String(total.getAttribute('data-tooltip') ?? '');
		const nextTooltip = tooltip.replaceAll(`vs ${baseLabel}`, `vs DC ${alteredTargetADC}`);
		if (nextTooltip === tooltip) continue;
		total.setAttribute('data-tooltip', nextTooltip);
		didChange = true;
	}
	return didChange;
}

function replaceMidiSaveDCContent(content, initialTargetADC, alteredTargetADC) {
	const baseLabel = `DC ${initialTargetADC}`;
	const nextLabel = `DC ${alteredTargetADC}`;
	return String(content ?? '')
		.replaceAll(`>${baseLabel}<`, `>${nextLabel}<`)
		.replaceAll(`vs ${baseLabel}`, `vs ${nextLabel}`);
}

function markMidiSaveDCLabelsModified(content, initialTargetADC) {
	const baseLabel = `DC ${initialTargetADC}`;
	const markedLabel = `DC ${initialTargetADC} (*)`;
	return String(content ?? '').replaceAll(`>${baseLabel}<`, `>${markedLabel}<`);
}
