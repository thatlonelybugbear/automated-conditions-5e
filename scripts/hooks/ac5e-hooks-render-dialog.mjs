import { getDialogAc5eConfig, syncDialogAc5eState } from './ac5e-hooks-dialog-state.mjs';
import { doDialogAttackRender, refreshDialogAbilityState } from './ac5e-hooks-dialog-d20-state.mjs';
import { applyOptinCriticalToDamageConfig, doDialogDamageRender } from './ac5e-hooks-dialog-damage-state.mjs';
import { applyTargetADCStateToD20Config, rebuildOptinTargetADCState } from './ac5e-hooks-roll-target-adc.mjs';

function logInitialOptinFormulaDebug(stage, render, ac5eConfig) {
	if (!globalThis.ac5e?.debug?.initialOptinFormula) return;
	const selectedVisibilityOptins = Object.entries(ac5eConfig?.optinSelected ?? {})
		.filter(([id, selected]) => selected && String(id).startsWith('ac5e:visibility:'))
		.map(([id]) => id);
	if (!selectedVisibilityOptins.length) return;
	const payload = {
		stage,
		hookType: ac5eConfig?.hookType ?? null,
		selectedVisibilityOptins,
		optinSelected: ac5eConfig?.optinSelected ?? {},
		configRoll0Formula: render?.config?.rolls?.[0]?.formula ?? null,
		configRoll0Parts: Array.isArray(render?.config?.rolls?.[0]?.parts) ? render.config.rolls[0].parts : [],
		configAdvantageMode: render?.config?.options?.advantageMode ?? render?.config?.advantageMode ?? null,
		renderRoll0Formula: render?.rolls?.[0]?.formula ?? null,
		renderRoll0Terms: Array.isArray(render?.rolls?.[0]?.terms) ? render.rolls[0].terms.map((term) => term?.formula ?? String(term)) : [],
		defaultButton: ac5eConfig?.defaultButton ?? null,
	};
	try {
		console.warn(`AC5E INITIAL OPTIN FORMULA DEBUG ${JSON.stringify(payload)}`);
	} catch {
		console.warn('AC5E INITIAL OPTIN FORMULA DEBUG', payload);
	}
}

export function renderRollConfigDialogHijack(hook, render, elem, initialConfig, deps) {
	let getConfigAC5E = initialConfig;
	getConfigAC5E = bindDialogAbilityRefresh(hook, render, elem, getConfigAC5E, deps);
	getConfigAC5E = hook === 'damageDialog' ? syncDamageDialogState(render, elem, getConfigAC5E, deps) : syncD20DialogState(hook, render, elem, getConfigAC5E, deps);
	const { hookType } = getConfigAC5E || {};
	if (!hookType) return true;
	const { title, newTitle } = applyDialogTitleOverrides(render, elem, getConfigAC5E);
	if (newTitle && title) title.textContent = newTitle;
	if (!['both', 'dialog'].includes(deps.settings.showTooltips)) return true;
	const tooltip = deps.getTooltip(getConfigAC5E);
	if (tooltip === '') return true;
	return applyRenderHijackDialogButtonState(render, elem, getConfigAC5E, tooltip, deps);
}

function bindDialogAbilityRefresh(hook, render, elem, initialConfig, deps) {
	let getConfigAC5E = initialConfig;
	const abilitySelect = render?.form?.querySelector?.('select[name="ability"]');
	if (hook === 'd20Dialog' && ['check', 'save'].includes(getConfigAC5E?.hookType) && abilitySelect && !abilitySelect.dataset.ac5eAbilityReevalBound) {
		abilitySelect.dataset.ac5eAbilityReevalBound = 'true';
		abilitySelect.addEventListener('change', (event) => {
			const nextAbility = event?.currentTarget?.value;
			const activeConfig = getDialogAc5eConfig(render, getConfigAC5E);
			const refreshed = refreshDialogAbilityState(render, activeConfig, nextAbility, deps);
			if (refreshed) {
				getConfigAC5E = refreshed;
				queueMicrotask(() => deps.rerenderHijack('d20Dialog', render, elem));
			}
		});
	}
	const selectedAbility = abilitySelect?.value;
	if (hook === 'd20Dialog' && ['check', 'save'].includes(getConfigAC5E?.hookType) && selectedAbility) {
		const refreshed = refreshDialogAbilityState(render, getConfigAC5E, selectedAbility, deps);
		if (refreshed) getConfigAC5E = refreshed;
	}
	return getConfigAC5E;
}

function syncD20DialogState(hook, render, elem, initialConfig, deps) {
	let getConfigAC5E = initialConfig;
	getConfigAC5E = syncAttackDialogState(render, elem, getConfigAC5E, deps);
	getConfigAC5E = syncNonInitiativeD20DialogState(hook, render, elem, getConfigAC5E, deps);
	return getConfigAC5E;
}

function syncAttackDialogState(render, elem, initialConfig, deps) {
	let getConfigAC5E = initialConfig;
	if (getConfigAC5E?.hookType === 'attack') {
		const refreshed = doDialogAttackRender(render, elem, getConfigAC5E, deps);
		if (refreshed) getConfigAC5E = refreshed;
	}
	return getConfigAC5E;
}

function syncNonInitiativeD20DialogState(hook, render, elem, initialConfig, deps) {
	const getConfigAC5E = initialConfig;
	if (hook !== 'd20Dialog' || !['attack', 'save', 'check'].includes(getConfigAC5E?.hookType) || getConfigAC5E?.options?.isInitiative) return getConfigAC5E;
	deps.renderOptionalBonusesRoll(render, elem, getConfigAC5E, deps);
	const optinSelections = deps.readOptinSelections(elem, getConfigAC5E);
	deps.setOptinSelections(getConfigAC5E, optinSelections);
	const selectedVisibilityOptins = Object.entries(getConfigAC5E?.optinSelected ?? {})
		.filter(([id, selected]) => selected && String(id).startsWith('ac5e:visibility:'))
		.map(([id]) => id);
	if (render?.config) {
		deps.restoreD20ConfigFromFrozenBaseline(getConfigAC5E, render.config);
		render.config.advantage = undefined;
		render.config.disadvantage = undefined;
		deps.calcAdvantageMode(getConfigAC5E, render.config, undefined, undefined, { skipSetProperties: true });
		deps.applyExplicitModeOverride(getConfigAC5E, render.config);
		const { targetADCEntries } = rebuildOptinTargetADCState(getConfigAC5E, render.config);
		if (globalThis.ac5e?.debugTargetADC) console.warn('AC5E targetADC: render entries', { hook: getConfigAC5E.hookType, targetADCEntries, optinSelected: getConfigAC5E.optinSelected });
		applyTargetADCStateToD20Config(getConfigAC5E, render.config, { syncAttackTargets: true });
		syncDialogAc5eState(render, getConfigAC5E);
	}
	if (selectedVisibilityOptins.length && !elem.dataset.ac5eInitialOptinSyncApplied) {
		elem.dataset.ac5eInitialOptinSyncApplied = 'true';
		logInitialOptinFormulaDebug('beforeRebuild', render, getConfigAC5E);
		requestAnimationFrame(() => {
			render?.rebuild?.();
			logInitialOptinFormulaDebug('afterRebuildCall', render, getDialogAc5eConfig(render, getConfigAC5E) ?? getConfigAC5E);
			queueMicrotask(() => logInitialOptinFormulaDebug('afterRebuildMicrotask', render, getDialogAc5eConfig(render, getConfigAC5E) ?? getConfigAC5E));
		});
	}
	return getConfigAC5E;
}

function syncDamageDialogState(render, elem, initialConfig, deps) {
	const getConfigAC5E = initialConfig;
	doDialogDamageRender(render, elem, getConfigAC5E, deps);
	const currentSelections = deps.readOptinSelections(elem, getConfigAC5E);
	deps.setOptinSelections(getConfigAC5E, currentSelections);
	applyOptinCriticalToDamageConfig(getConfigAC5E, render.config);
	const isCritical = render?.config?.isCritical ?? getConfigAC5E?.isCritical;
	const hasCriticalAction = !!elem.querySelector('button[data-action="critical"]');
	getConfigAC5E.defaultButton = isCritical && hasCriticalAction ? 'critical' : 'normal';
	return getConfigAC5E;
}

function applyDialogTitleOverrides(render, elem, getConfigAC5E) {
	const { hookType, tokenId, options } = getConfigAC5E || {};
	const title = elem.querySelector('header.window-header h1.window-title') ?? elem.querySelector('dialog.application.dnd5e2.roll-configuration .window-header .window-title');
	let newTitle;
	if (tokenId && (hookType === 'save' || hookType === 'check')) {
		const subtitleElement = elem.querySelector('.window-subtitle');
		const tokenName = canvas.tokens.get(tokenId)?.name;
		if (subtitleElement) subtitleElement.textContent = `${tokenName}`;
	}
	if (render.config?.isConcentration) {
		newTitle = `${game.i18n.translations.DND5E.AbbreviationDC} ${render.config.target} ${game.i18n.translations.DND5E.Concentration}`;
		if (render.config.ability !== 'con') newTitle += ` (${render.config.ability.toLocaleUpperCase()})`;
	}
	if (options?.isInitiative) {
		newTitle = game.i18n.translations.DND5E.InitiativeRoll;
		const actorUuid = render.rolls?.[0]?.data?.actorUuid ?? render.config?.subject?.uuid;
		const actor = fromUuidSync(actorUuid);
		const tokenName = actor?.token?.name ?? actor?.getActiveTokens()?.[0]?.name;
		const subtitleElement = elem.querySelector('.window-subtitle');
		if (subtitleElement) {
			subtitleElement.textContent = `${tokenName}`;
			subtitleElement.style.display = 'block';
		}
	}
	return { title, newTitle };
}

function applyRenderHijackDialogButtonState(render, elem, getConfigAC5E, tooltip, deps) {
	if (render?.message) deps.setMessageFlagScope(render.message, deps.Constants.MODULE_ID, { tooltipObj: getConfigAC5E.tooltipObj, hookType: getConfigAC5E.hookType }, { merge: true });
	const ac5eForButton = getDialogAc5eConfig(render, getConfigAC5E);
	let defaultButton = ac5eForButton?.defaultButton ?? 'normal';
	const hasRequestedButton = !!elem.querySelector(`button[data-action="${defaultButton}"]`);
	if (!hasRequestedButton) {
		const fallbackButton = elem.querySelector('button[data-action="normal"]') ?? elem.querySelector('button[data-action]');
		defaultButton = fallbackButton?.dataset?.action ?? 'normal';
		if (ac5eForButton && typeof ac5eForButton === 'object') ac5eForButton.defaultButton = defaultButton;
	}
	const allButtons = elem.querySelectorAll('button[data-action]');
	for (const button of allButtons) {
		if (!button.dataset.ac5eOverrideBound) {
			button.dataset.ac5eOverrideBound = 'true';
			button.addEventListener('click', (event) => {
				const action = String(event.currentTarget?.dataset?.action ?? '')
					.trim()
					.toLowerCase();
				const liveConfig = getDialogAc5eConfig(render, getConfigAC5E);
				if (!liveConfig || typeof liveConfig !== 'object') return;
				const allowedActions = liveConfig?.hookType === 'damage' ? ['critical', 'normal'] : ['advantage', 'disadvantage', 'normal'];
				if (!allowedActions.includes(action)) return;
				deps.setExplicitModeOverride(liveConfig, { action, source: 'dialog' });
			});
		}
		button.classList.remove('ac5e-button');
		button.style.backgroundColor = '';
		button.style.border = '';
		button.style.color = '';
	}
	const targetElement = elem.querySelector(`button[data-action="${defaultButton}"]`);
	if (!targetElement) return true;
	deps.enforceDefaultButtonFocus(elem, targetElement);
	if (deps.settings.buttonColorEnabled) {
		if (deps.settings.buttonColorBackground) targetElement.style.backgroundColor = deps.settings.buttonColorBackground;
		if (deps.settings.buttonColorBorder) targetElement.style.border = `1px solid ${deps.settings.buttonColorBorder}`;
		if (deps.settings.buttonColorText) targetElement.style.color = deps.settings.buttonColorText;
	}
	targetElement.classList.add('ac5e-button');
	targetElement.setAttribute('data-tooltip', tooltip);
	if (deps.hookDebugEnabled('renderHijackHook')) {
		console.warn('ac5e hijack getTooltip', tooltip);
		console.warn('ac5e hijack targetElement:', targetElement);
	}
	return true;
}
