import Constants from '../ac5e-constants.mjs';
import { _buildStandardTooltipFromLines, _localize } from '../ac5e-helpers.mjs';
import { getAskPermissionSourceSuffix, getRollingActorIdForOptins, shouldAskPermissionForOptinEntry } from './ac5e-hooks-dialog-optins.mjs';
import { getResolvedUseDisplayState, getTargetADCOptinChoices } from './ac5e-hooks-use-activity.mjs';

export function renderActivityUsageDialogHijack(dialog, elem, deps = {}) {
	if (!dialog || !elem) return true;
	if (!isActivityUsageDialog(dialog)) return true;
	const usageConfig = dialog.config;
	const ac5eConfig = usageConfig?.[Constants.MODULE_ID];
	const activity = dialog.activity;
	if (!ac5eConfig || !activity) return true;

	const choices = [...getTargetADCOptinChoices(ac5eConfig, activity)];
	const root = elem instanceof HTMLElement ? elem : elem?.[0] ?? null;
	logUsageDialogRenderDebug('renderActivityUsageDialogHijack.entry', {
		dialogClass: dialog?.constructor?.name ?? null,
		activityType: activity?.type ?? null,
		choicesLength: choices.length,
		hasRoot: !!root,
		configure: usageConfig?.configure ?? dialog?.config?.configure ?? null,
		optinSelected: usageConfig?.[Constants.MODULE_ID]?.optinSelected ?? {},
	});
	if (!root) return true;
	if (!choices.length) {
		removeExistingFieldsets(root);
		applyUsageDialogButtonState(root, usageConfig, choices, ac5eConfig, deps);
		return true;
	}

	const groupedChoices = groupChoicesForDisplay(choices, ac5eConfig);
	renderChoiceFieldsets(root, groupedChoices, ac5eConfig, usageConfig, choices, deps);
	applyUsageDialogButtonState(root, usageConfig, choices, ac5eConfig, deps);
	return true;
}

function isActivityUsageDialog(dialog) {
	const className = String(dialog?.constructor?.name ?? '');
	return className.endsWith('UsageDialog') && dialog?.activity && dialog?.config;
}

function removeExistingFieldsets(root) {
	if (!(root instanceof HTMLElement)) return;
	root.querySelectorAll('.ac5e-usage-optins').forEach((node) => node.remove());
}

function ensureFieldset(root, className, legendText) {
	let fieldset = root.querySelector(`.${className}`);
	if (fieldset) return fieldset;
	fieldset = document.createElement('fieldset');
	fieldset.className = 'ac5e-usage-optins';
	fieldset.classList.add(className);
	fieldset.style.margin = '0 0 0.75rem 0';
	fieldset.style.padding = '0.5rem 0.75rem';

	const legend = document.createElement('legend');
	legend.textContent = legendText;
	fieldset.append(legend);

	const footer = root.querySelector('[data-application-part="footer"]');
	const form = root.querySelector('form');
	if (footer?.parentElement) footer.before(fieldset);
	else if (form) form.append(fieldset);
	else root.append(fieldset);
	return fieldset;
}

function renderChoiceFieldsets(root, groupedChoices, ac5eConfig, usageConfig, allChoices, deps = {}) {
	const optionalLegend = localizeWithFallback('AC5E.OptinLegend.Optional', 'AC5E');
	const askPermissionLegend = localizeWithFallback('AC5E.OptinLegend.FromOtherSources', 'AC5E From other sources (ask for permission)');
	const groups = [
		{ key: 'main', className: 'ac5e-usage-optins-main', legend: optionalLegend, choices: groupedChoices.main },
		{ key: 'permission', className: 'ac5e-usage-optins-permission', legend: askPermissionLegend, choices: groupedChoices.permission },
	];
	for (const group of groups) {
		const fieldset = ensureFieldset(root, group.className, group.legend);
		if (!group.choices.length) {
			fieldset.style.display = 'none';
			fieldset.setAttribute('aria-hidden', 'true');
			continue;
		}
		fieldset.style.removeProperty('display');
		fieldset.removeAttribute('aria-hidden');
		renderChoiceRows(fieldset, group.choices, ac5eConfig, { askPermission: group.key === 'permission' });
		syncSelectionsToUsageConfig(fieldset, usageConfig, root, allChoices, ac5eConfig, deps);
	}
}

function renderChoiceRows(fieldset, choices, ac5eConfig, { askPermission = false } = {}) {
	const selected = ac5eConfig?.optinSelected ?? {};
	fieldset.querySelectorAll('.ac5e-usage-optin-row').forEach((row) => row.remove());
	for (const choice of choices) {
		const row = document.createElement('div');
		row.className = 'form-group ac5e-usage-optin-row';
		row.style.display = 'flex';
		row.style.alignItems = 'center';
		row.style.gap = '0.35rem';

		const label = document.createElement('label');
		label.style.flex = '1 1 auto';
		label.style.margin = '0';
		const labelText = getChoiceDisplayLabel(choice);
		const suffix = getAskPermissionSourceSuffix(choice?.entry, askPermission);
		label.textContent = suffix ? `${labelText} (${suffix})` : labelText;
		row.append(label);

		const description = String(choice?.description ?? '').trim();
		if (description) {
			const descriptionPill = document.createElement('i');
			descriptionPill.className = 'ac5e-optin-description-pill';
			descriptionPill.classList.add('fa-solid', 'fa-circle-info');
			descriptionPill.title = description;
			descriptionPill.setAttribute('role', 'note');
			descriptionPill.style.display = 'inline-flex';
			descriptionPill.style.alignItems = 'center';
			descriptionPill.style.justifyContent = 'center';
			descriptionPill.style.width = '1em';
			descriptionPill.style.height = '1em';
			descriptionPill.style.minWidth = '1em';
			descriptionPill.style.maxWidth = '1em';
			descriptionPill.style.marginInline = '0.35em';
			descriptionPill.style.padding = '0';
			descriptionPill.style.flex = '0 0 1em';
			descriptionPill.style.alignSelf = 'center';
			descriptionPill.style.color = 'currentColor';
			descriptionPill.style.border = 'none';
			descriptionPill.style.backgroundColor = 'transparent';
			descriptionPill.style.fontSize = '0.8em';
			descriptionPill.style.fontWeight = '600';
			descriptionPill.style.lineHeight = '1';
			descriptionPill.style.verticalAlign = 'middle';
			descriptionPill.style.transform = 'translateY(0.01em)';
			descriptionPill.style.cursor = 'help';
			descriptionPill.style.userSelect = 'none';
			descriptionPill.style.opacity = '0.95';
			descriptionPill.style.marginLeft = '0';
			descriptionPill.style.marginRight = '0.1rem';
			row.append(descriptionPill);
		}

		const input = document.createElement('input');
		input.type = 'checkbox';
		input.name = `ac5eOptins.${choice.id}`;
		input.checked = !!selected?.[choice.id];
		input.dataset.ac5eUsageOptin = 'true';
		input.dataset.ac5eOptinId = String(choice.id ?? '');
		input.style.marginLeft = 'auto';
		input.style.flex = '0 0 auto';
		input.style.alignSelf = 'center';
		row.append(input);

		fieldset.append(row);
	}
}

function syncSelectionsToUsageConfig(fieldset, usageConfig, root, choices, ac5eConfig, deps = {}) {
	usageConfig[Constants.MODULE_ID] ??= {};
	usageConfig[Constants.MODULE_ID].optinSelected ??= {};
	for (const input of fieldset.querySelectorAll('input[data-ac5e-usage-optin="true"]')) {
		const optinId = String(input.dataset.ac5eOptinId ?? '').trim();
		if (!optinId) continue;
		usageConfig[Constants.MODULE_ID].optinSelected[optinId] = !!input.checked;
	}
	fieldset.onchange = (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement) || target.dataset.ac5eUsageOptin !== 'true') return;
		const optinId = String(target.dataset.ac5eOptinId ?? '').trim();
		if (!optinId) return;
		usageConfig[Constants.MODULE_ID] ??= {};
		usageConfig[Constants.MODULE_ID].optinSelected ??= {};
		usageConfig[Constants.MODULE_ID].optinSelected[optinId] = !!target.checked;
		applyUsageDialogButtonState(root, usageConfig, choices, ac5eConfig, deps);
	};
}

function applyUsageDialogButtonState(root, usageConfig, choices, ac5eConfig, deps = {}) {
	if (!(root instanceof HTMLElement)) return;
	const allButtons = root.querySelectorAll('button');
	for (const button of allButtons) {
		button.classList.remove('ac5e-button');
		button.style.backgroundColor = '';
		button.style.border = '';
		button.style.color = '';
		button.removeAttribute('data-tooltip');
	}
	const button =
		root.querySelector('button[data-action="use"]') ??
		root.querySelector('button[type="submit"]') ??
		root.querySelector('footer button') ??
		null;
	logUsageDialogRenderDebug('applyUsageDialogButtonState.buttonLookup', {
		buttonFound: !!button,
		buttonAction: button?.dataset?.action ?? null,
		buttonText: button?.textContent?.trim?.() ?? null,
		totalButtons: allButtons?.length ?? 0,
	});
	if (!(button instanceof HTMLButtonElement)) return;
	const tooltip = buildUsageDialogTooltip(usageConfig, choices, ac5eConfig, deps);
	if (deps?.enforceDefaultButtonFocus) deps.enforceDefaultButtonFocus(root, button);
	if (tooltip) button.classList.add('ac5e-button');
	if (deps?.settings?.buttonColorEnabled && tooltip) {
		if (deps.settings.buttonColorBackground) button.style.backgroundColor = deps.settings.buttonColorBackground;
		if (deps.settings.buttonColorBorder) button.style.border = `1px solid ${deps.settings.buttonColorBorder}`;
		if (deps.settings.buttonColorText) button.style.color = deps.settings.buttonColorText;
	}
	if (tooltip) {
		button.setAttribute('data-tooltip', tooltip);
		if (deps?.hookDebugEnabled?.('renderHijackHook')) {
			console.warn('ac5e usage getTooltip', tooltip);
			console.warn('ac5e usage targetElement:', button);
		}
	}
	logUsageDialogRenderDebug('applyUsageDialogButtonState.after', {
		tooltipLength: typeof tooltip === 'string' ? tooltip.length : 0,
		hasTooltip: !!tooltip,
		buttonClassList: Array.from(button.classList ?? []),
		buttonHasDataTooltip: button.hasAttribute('data-tooltip'),
		buttonDataTooltipLength: String(button.getAttribute('data-tooltip') ?? '').length,
	});
}

function buildUsageDialogTooltip(usageConfig, choices = [], ac5eConfig, deps = {}) {
	const activityLike = ac5eConfig?.options?.activity;
	const resolvedState = getResolvedUseDisplayState(ac5eConfig, activityLike, {
		optinSelected: usageConfig?.[Constants.MODULE_ID]?.optinSelected ?? {},
	});
	let hoverLines = Array.isArray(resolvedState?.hoverLines) ? resolvedState.hoverLines.filter(Boolean) : [];
	const selectedOptinTooltipLines = Array.isArray(choices)
		? choices
				.filter((choice) => !!usageConfig?.[Constants.MODULE_ID]?.optinSelected?.[choice?.id])
				.map((choice) => {
					const label = String(choice?.displayLabel ?? choice?.label ?? choice?.entry?.label ?? choice?.entry?.name ?? choice?.entry?.id ?? '').trim();
					const modifiedDC = Number(choice?.dc);
					const baseDC = Number(choice?.baseDC ?? resolvedState?.resolvedTargetADC?.baseDC ?? ac5eConfig?.initialTargetADC);
					if (!label) return '';
					if (!Number.isFinite(modifiedDC) || !Number.isFinite(baseDC)) return label;
					return `${_localize('AC5E.ModifyDC')} ${modifiedDC} (${baseDC}): ${label}`;
				})
				.filter(Boolean)
		: [];
	for (const line of selectedOptinTooltipLines) {
		const normalized = String(line).toLowerCase();
		if (!hoverLines.some((existing) => String(existing).toLowerCase() === normalized)) hoverLines.push(line);
	}
	if (!hoverLines.length) {
		const fallbackState =
			usageConfig?.[Constants.MODULE_ID]?.resolvedUseButtonState ??
			ac5eConfig?.resolvedUseButtonState ??
			activityLike?._ac5eResolvedUseButtonState;
		hoverLines = [String(fallbackState?.resolvedTargetADC?.hoverText ?? '').trim()].filter(Boolean);
		logUsageDialogRenderDebug('buildUsageDialogTooltip.fallbackState', {
			fallbackState,
			hoverLines,
		});
	}
	logUsageDialogRenderDebug('buildUsageDialogTooltip.resolvedState', {
		optinSelected: usageConfig?.[Constants.MODULE_ID]?.optinSelected ?? {},
		resolvedState,
		hoverLines,
	});
	return _buildStandardTooltipFromLines(hoverLines, { showNameTooltips: !!deps?.settings?.showNameTooltips, noChangesKey: 'AC5E.NoChanges' });
}

function localizeWithFallback(key, fallback) {
	const localized = _localize(key);
	return localized && localized !== key ? localized : fallback;
}

function groupChoicesForDisplay(choices, ac5eConfig) {
	const rollingActorId = getRollingActorIdForOptins(ac5eConfig);
	const grouped = { main: [], permission: [] };
	for (const choice of choices) {
		const askPermission = shouldAskPermissionForOptinEntry(choice?.entry, ac5eConfig, rollingActorId);
		grouped[askPermission ? 'permission' : 'main'].push(choice);
	}
	return grouped;
}

function getChoiceDisplayLabel(choice = {}) {
	const explicit = String(choice?.displayLabel ?? choice?.label ?? '').trim();
	if (explicit) return explicit;
	return `${localizeWithFallback('AC5E.ModifyDC', 'Modify DC')} ${choice?.dc ?? ''}`.trim();
}

function logUsageDialogRenderDebug(stage, payload) {
	if (!globalThis?.ac5e?.debugUsageDialogTooltip) return;
	try {
		console.warn(`AC5E USAGE DIALOG RENDER DEBUG ${stage} ${JSON.stringify(payload)}`);
	} catch (_error) {
		console.warn(`AC5E USAGE DIALOG RENDER DEBUG ${stage}`, payload);
	}
}
