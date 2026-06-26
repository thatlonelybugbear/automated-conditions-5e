import Constants from '../ac5e-constants.mjs';
import { _buildStandardTooltipFromLines, _getOptinSelectionScale, _isOptinSelectionActive, _localize } from '../ac5e-helpers.mjs';
import { getAskPermissionSourceSuffix, getOptinScaling, getRollingActorIdForOptins, shouldAskPermissionForOptinEntry } from './ac5e-hooks-dialog-optins.mjs';
import { getAbilityOverrideOptinChoices, getResolvedUseDisplayState, getTargetADCOptinChoices, getTemplateSizeOptinChoices } from './ac5e-hooks-use-activity.mjs';

export function renderActivityUsageDialogHijack(dialog, elem, deps = {}) {
	if (!dialog || !elem) return true;
	if (!isActivityUsageDialog(dialog)) return true;
	const usageConfig = dialog.config;
	const ac5eConfig = usageConfig?.[Constants.MODULE_ID];
	const activity = dialog.activity;
	if (!ac5eConfig || !activity) return true;

	const choices = [...getTargetADCOptinChoices(ac5eConfig, activity), ...getAbilityOverrideOptinChoices(ac5eConfig, activity), ...getTemplateSizeOptinChoices(ac5eConfig, activity)];
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
		applyUsageDialogButtonState(root, usageConfig, choices, ac5eConfig, deps, activity);
		return true;
	}

	const groupedChoices = groupChoicesForDisplay(choices, ac5eConfig);
	renderChoiceFieldsets(root, groupedChoices, ac5eConfig, usageConfig, choices, deps, activity);
	applyUsageDialogButtonState(root, usageConfig, choices, ac5eConfig, deps, activity);
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

function renderChoiceFieldsets(root, groupedChoices, ac5eConfig, usageConfig, allChoices, deps = {}, activity = null) {
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
		syncSelectionsToUsageConfig(fieldset, usageConfig, root, allChoices, ac5eConfig, deps, activity);
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
			row.append(descriptionPill);
		}

		const input = document.createElement('input');
		input.type = 'checkbox';
		input.name = `ac5eOptins.${choice.id}`;
		input.checked = _isOptinSelectionActive(selected?.[choice.id]);
		input.dataset.ac5eUsageOptin = 'true';
		input.dataset.ac5eOptinId = String(choice.id ?? '');
		input.style.marginLeft = 'auto';
		input.style.flex = '0 0 auto';
		input.style.alignSelf = 'center';
		const scaling = getOptinScaling(choice?.entry, null, ac5eConfig);
		if (scaling) {
			const selectedScale = _getOptinSelectionScale(selected?.[choice.id]);
			const initialScale = Number.isFinite(selectedScale) ? selectedScale : scaling.min;
			const slider = document.createElement('input');
			slider.type = 'range';
			slider.name = `ac5eOptinScale.${choice.id}`;
			slider.dataset.ac5eUsageOptinScale = 'true';
			slider.dataset.ac5eOptinId = String(choice.id ?? '');
			slider.min = scaling.min;
			slider.max = scaling.max;
			slider.step = scaling.step;
			slider.value = String(initialScale);
			slider.disabled = !input.checked;
			slider.style.flex = '0 0 7.5rem';
			const valueLabel = document.createElement('span');
			valueLabel.className = 'ac5e-optin-scale-value';
			valueLabel.textContent = slider.value;
			valueLabel.style.flex = '0 0 auto';
			input.dataset.ac5eOptinScaleMin = String(scaling.min);
			input.addEventListener('change', () => {
				slider.disabled = !input.checked;
			});
			slider.addEventListener('input', () => {
				valueLabel.textContent = slider.value;
			});
			row.append(slider, valueLabel, input);
		} else row.append(input);

		fieldset.append(row);
	}
}

function syncSelectionsToUsageConfig(fieldset, usageConfig, root, choices, ac5eConfig, deps = {}, activity = null) {
	usageConfig[Constants.MODULE_ID] ??= {};
	usageConfig[Constants.MODULE_ID].optinSelected ??= {};
	for (const input of fieldset.querySelectorAll('input[data-ac5e-usage-optin="true"]')) {
		const optinId = (input.dataset.ac5eOptinId ?? '').trim();
		if (!optinId) continue;
		const slider = fieldset.querySelector(`input[data-ac5e-usage-optin-scale="true"][data-ac5e-optin-id="${globalThis.CSS?.escape?.(optinId) ?? optinId}"]`);
		const scale = Number(slider?.value ?? input.dataset.ac5eOptinScaleMin);
		usageConfig[Constants.MODULE_ID].optinSelected[optinId] = input.checked && Number.isFinite(scale) ? { enabled: true, scale } : !!input.checked;
	}
	fieldset.onchange = (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement) || (target.dataset.ac5eUsageOptin !== 'true' && target.dataset.ac5eUsageOptinScale !== 'true')) return;
		const optinId = (target.dataset.ac5eOptinId ?? '').trim();
		if (!optinId) return;
		usageConfig[Constants.MODULE_ID] ??= {};
		usageConfig[Constants.MODULE_ID].optinSelected ??= {};
		const checkbox = fieldset.querySelector(`input[data-ac5e-usage-optin="true"][data-ac5e-optin-id="${globalThis.CSS?.escape?.(optinId) ?? optinId}"]`);
		const slider = fieldset.querySelector(`input[data-ac5e-usage-optin-scale="true"][data-ac5e-optin-id="${globalThis.CSS?.escape?.(optinId) ?? optinId}"]`);
		const checked = checkbox instanceof HTMLInputElement ? checkbox.checked : target.checked;
		const scale = Number(slider?.value ?? checkbox?.dataset?.ac5eOptinScaleMin);
		usageConfig[Constants.MODULE_ID].optinSelected[optinId] = checked && Number.isFinite(scale) ? { enabled: true, scale } : !!checked;
		const refreshedChoices =
			activity ?
				[...getTargetADCOptinChoices(ac5eConfig, activity), ...getAbilityOverrideOptinChoices(ac5eConfig, activity), ...getTemplateSizeOptinChoices(ac5eConfig, activity)]
			:	choices;
		if (activity) {
			const groupedChoices = groupChoicesForDisplay(refreshedChoices, ac5eConfig);
			renderChoiceFieldsets(root, groupedChoices, ac5eConfig, usageConfig, refreshedChoices, deps, activity);
		}
		applyUsageDialogButtonState(root, usageConfig, refreshedChoices, ac5eConfig, deps, activity);
	};
}

function applyUsageDialogButtonState(root, usageConfig, choices, ac5eConfig, deps = {}, activity = null) {
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
	const tooltip = buildUsageDialogTooltip(usageConfig, choices, ac5eConfig, deps, activity);
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
		buttonDataTooltipLength: (button.getAttribute('data-tooltip') ?? '').length,
	});
}

function buildUsageDialogTooltip(usageConfig, choices = [], ac5eConfig, deps = {}, activity = null) {
	const activityLike = activity ?? ac5eConfig?.options?.activity;
	const resolvedState = getResolvedUseDisplayState(ac5eConfig, activityLike, {
		optinSelected: usageConfig?.[Constants.MODULE_ID]?.optinSelected ?? {},
	});
	let hoverLines = Array.isArray(resolvedState?.hoverLines) ? resolvedState.hoverLines.filter(Boolean) : [];
	if (!hoverLines.length) {
		const fallbackState =
			usageConfig?.[Constants.MODULE_ID]?.resolvedUseButtonState ??
			ac5eConfig?.resolvedUseButtonState ??
			activityLike?._ac5eResolvedUseButtonState;
		hoverLines = [(fallbackState?.resolvedTargetADC?.hoverText ?? '').trim()].filter(Boolean);
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
	const explicit = (choice?.displayLabel ?? choice?.label ?? '').trim();
	if (explicit) return explicit;
	return `${localizeWithFallback('AC5E.ModifyDC', 'Modify DC')} ${choice?.dc ?? ''}`.trim();
}

function logUsageDialogRenderDebug(stage, payload) {
	if (!globalThis.ac5e?.debug?.abilityOverrideTrace) return;
	try {
		console.warn(`AC5E TRACE usageDialog.${stage} ${JSON.stringify(payload)}`);
	} catch {
		console.warn(`AC5E TRACE usageDialog.${stage}`, payload);
	}
}
