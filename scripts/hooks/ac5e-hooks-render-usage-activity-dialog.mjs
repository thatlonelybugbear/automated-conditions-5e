import Constants from '../ac5e-constants.mjs';
import { _localize, getAlteredTargetValueOrThreshold } from '../ac5e-helpers.mjs';
import { getAskPermissionSourceSuffix, getRollingActorIdForOptins, shouldAskPermissionForOptinEntry } from './ac5e-hooks-dialog-optins.mjs';
import { getTargetADCOptinChoices } from './ac5e-hooks-use-activity.mjs';

export function renderActivityUsageDialogHijack(dialog, elem, deps = {}) {
	if (!dialog || !elem) return true;
	if (!isActivityUsageDialog(dialog)) return true;
	const usageConfig = dialog.config;
	const ac5eConfig = usageConfig?.[Constants.MODULE_ID];
	const activity = dialog.activity;
	if (!ac5eConfig || !activity) return true;

	const choices = getTargetADCOptinChoices(ac5eConfig, activity);
	const root = elem instanceof HTMLElement ? elem : elem?.[0] ?? null;
	if (!choices.length || !root) {
		removeExistingFieldsets(root);
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
		const labelText = String(choice?.displayLabel ?? choice?.label ?? '').trim() || `${localizeWithFallback('AC5E.ModifyDC', 'Modify DC')} ${choice.dc}`;
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
	const button =
		root.querySelector('button[type="submit"]') ??
		root.querySelector('button[data-action="use"]') ??
		root.querySelector('footer button') ??
		null;
	if (!(button instanceof HTMLButtonElement)) return;
	const tooltip = buildUsageDialogTooltip(usageConfig, choices, ac5eConfig, deps);
	if (deps?.settings?.buttonColorEnabled) {
		if (deps.settings.buttonColorBackground) button.style.backgroundColor = deps.settings.buttonColorBackground;
		if (deps.settings.buttonColorBorder) button.style.border = `1px solid ${deps.settings.buttonColorBorder}`;
		if (deps.settings.buttonColorText) button.style.color = deps.settings.buttonColorText;
	}
	button.classList.add('ac5e-button');
	if (tooltip) {
		button.setAttribute('data-tooltip', tooltip);
	} else {
		button.removeAttribute('data-tooltip');
	}
}

function buildUsageDialogTooltip(usageConfig, choices = [], ac5eConfig, deps = {}) {
	const selectedIds = new Set(
		Object.entries(usageConfig?.[Constants.MODULE_ID]?.optinSelected ?? {})
			.filter(([, selected]) => selected)
			.map(([id]) => id),
	);
	const selectedChoices = choices.filter((choice) => selectedIds.has(String(choice?.id ?? '')));
	let tooltip = '';
	if (deps?.settings?.showNameTooltips) tooltip += '<div style="text-align:center;"><strong>Automated Conditions 5e</strong></div><hr>';
	if (!selectedChoices.length) return `${tooltip}<div style="text-align:center;"><strong>${_localize('AC5E.NoChanges')}</strong></div>`;
	const labels = [...new Set(selectedChoices.map((choice) => String(choice?.displayLabel ?? choice?.label ?? '').trim()).filter(Boolean))];
	const entries = [
		...(Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC : []),
		...(Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC : []),
	].filter((entry) => entry && typeof entry === 'object');
	const getValues = (items = []) =>
		Array.isArray(items) ?
			items
				.filter((entry) => entry && typeof entry === 'object')
				.flatMap((entry) => (Array.isArray(entry.values) ? entry.values : []))
		:	[];
	const choice = selectedChoices[0];
	const baseDC = Number(ac5eConfig?.initialTargetADC ?? choice?.baseDC);
	const baseValues = getValues(entries.filter((entry) => !entry?.optin));
	const selectedOptinValues = getValues(entries.filter((entry) => entry?.optin && selectedIds.has(String(entry?.id ?? ''))));
	const alteredDC = Number(getAlteredTargetValueOrThreshold(baseDC, [...baseValues, ...selectedOptinValues], 'dcBonus'));
	let prefix = _localize('AC5E.ModifyDC');
	if (Number.isFinite(alteredDC) && Number.isFinite(baseDC)) prefix += ` ${alteredDC} (${baseDC})`;
	tooltip += `<span style="display: block; text-align: left;">${prefix}: ${labels.join(', ')}</span>`;
	return tooltip;
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
