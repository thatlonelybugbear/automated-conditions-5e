import { _localize } from '../ac5e-helpers.mjs';
import { getAllOptinEntriesForHook, getRollNonBonusOptinEntries } from './ac5e-hooks-roll-selections.mjs';

export function renderOptionalBonusesRoll(dialog, elem, ac5eConfig, deps) {
	const entries = [...getAllOptinEntriesForHook(ac5eConfig, ac5eConfig.hookType), ...getRollNonBonusOptinEntries(ac5eConfig, ac5eConfig.hookType)].filter((entry) =>
		Boolean(entry?.optin || entry?.forceOptin),
	);
	renderOptionalBonusesFieldset(dialog, elem, ac5eConfig, entries, deps);
}

export function renderOptionalBonusesFieldset(dialog, elem, ac5eConfig, entries, deps) {
	const fieldsetExisting = elem.querySelector('.ac5e-optional-bonuses');
	const permissionFieldsetExisting = elem.querySelector('.ac5e-ask-permission-bonuses');
	const rollingActorId = getRollingActorIdForOptins(ac5eConfig);
	const visibleEntries = entries.filter((entry) => Boolean(entry?.optin || entry?.forceOptin));
	const mainEntries = [];
	const askPermissionEntries = [];
	for (const entry of visibleEntries) {
		if (shouldAskPermissionForOptinEntry(entry, ac5eConfig, rollingActorId)) askPermissionEntries.push(entry);
		else mainEntries.push(entry);
	}
	const fieldset = fieldsetExisting ?? document.createElement('fieldset');
	fieldset.className = 'ac5e-optional-bonuses';
	const permissionFieldset = permissionFieldsetExisting ?? document.createElement('fieldset');
	permissionFieldset.className = 'ac5e-ask-permission-bonuses';
	const optionalLegend = localizeWithFallback('AC5E.OptinLegend.Optional', 'AC5E');
	const askPermissionLegend = localizeWithFallback('AC5E.OptinLegend.FromOtherSources', 'AC5E From other sources (ask for permission)');
	prepareOptinFieldset(fieldset, dialog, elem, ac5eConfig, optionalLegend);
	prepareOptinFieldset(permissionFieldset, dialog, elem, ac5eConfig, askPermissionLegend);

	if (!fieldsetExisting) {
		attachOptinFieldsetChangeHandler(fieldset, dialog, elem, ac5eConfig, deps);
	}
	if (!permissionFieldsetExisting) {
		attachOptinFieldsetChangeHandler(permissionFieldset, dialog, elem, ac5eConfig, deps);
	}

	const configFieldset = elem.querySelector('fieldset[data-application-part="configuration"]');
	if (!fieldsetExisting) {
		if (configFieldset) configFieldset.before(fieldset);
		else elem.prepend(fieldset);
	}
	if (!permissionFieldsetExisting) {
		if (configFieldset) configFieldset.before(permissionFieldset);
		else elem.prepend(permissionFieldset);
	}

	if (!mainEntries.length) {
		fieldset.style.display = 'none';
		fieldset.setAttribute('aria-hidden', 'true');
	} else {
		fieldset.style.removeProperty('display');
		fieldset.removeAttribute('aria-hidden');
		renderOptinRows(fieldset, mainEntries, ac5eConfig, { askPermission: false });
	}

	if (!askPermissionEntries.length) {
		permissionFieldset.style.display = 'none';
		permissionFieldset.setAttribute('aria-hidden', 'true');
	} else {
		permissionFieldset.style.removeProperty('display');
		permissionFieldset.removeAttribute('aria-hidden');
		renderOptinRows(permissionFieldset, askPermissionEntries, ac5eConfig, { askPermission: true });
	}
}

export function readOptinSelections(elem, _ac5eConfig) {
	const selected = {};
	const inputs = elem.querySelectorAll('input[data-ac5e-optin="true"]');
	for (const input of inputs) {
		const id = input.dataset.ac5eOptinId;
		if (id) selected[id] = !!input.checked;
	}
	return selected;
}

export function setOptinSelections(ac5eConfig, nextSelections) {
	const previous = ac5eConfig?.optinSelected ?? {};
	const prevKeys = Object.keys(previous);
	const nextKeys = Object.keys(nextSelections ?? {});
	const changed = prevKeys.length !== nextKeys.length || prevKeys.some((key) => previous[key] !== nextSelections[key]);
	if (changed) {
		if (ac5eConfig?.tooltipObj && ac5eConfig.hookType) delete ac5eConfig.tooltipObj[ac5eConfig.hookType];
		ac5eConfig.tooltipObj = ac5eConfig.tooltipObj ?? {};
		ac5eConfig.advantageMode = undefined;
		ac5eConfig.defaultButton = undefined;
	}
	ac5eConfig.optinSelected = nextSelections ?? {};
}

function getUsesCountLabelSuffix(entry) {
	const rawUsesCount = typeof entry?.usesCount === 'string' ? entry.usesCount.trim() : '';
	const parsed = parseUsesCountSpec(rawUsesCount);
	const rawAmount = parsed.consume || '1';
	const amount = String(rawAmount).trim();
	if (!amount) return '';
	const numericAmount = Number(amount);
	const isRestore = Number.isFinite(numericAmount) && numericAmount < 0;
	const displayAmount = isRestore ? String(Math.abs(numericAmount)) : amount;
	if (isItemUsesCountTarget(parsed.target || entry?.usesCountTarget)) {
		const unit = getUsesCountUnitLabel(displayAmount, 'use', 'uses');
		return isRestore ? `(restores ${displayAmount} ${unit})` : `(costs ${displayAmount} ${unit})`;
	}
	const target = formatUsesCountType(parsed.target || entry?.usesCountTarget);
	if (!target) return '';
	return isRestore ? `(restores ${displayAmount} ${target})` : `(costs ${displayAmount} ${target})`;
}

function parseUsesCountSpec(rawValue) {
	if (typeof rawValue !== 'string' || !rawValue.trim()) return { target: '', consume: '' };
	const parts = splitTopLevelCsv(rawValue);
	const [target = '', ...consumeParts] = parts;
	return {
		target: target.trim(),
		consume: consumeParts.join(',').trim(),
	};
}

function splitTopLevelCsv(value) {
	const text = String(value ?? '');
	const parts = [];
	let depth = 0;
	let current = '';
	for (const char of text) {
		if (char === ',' && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += char;
		if (char === '(' || char === '[' || char === '{') depth += 1;
		else if ((char === ')' || char === ']' || char === '}') && depth > 0) depth -= 1;
	}
	parts.push(current);
	return parts;
}

function isItemUsesCountTarget(target) {
	const rawTarget = String(target ?? '').trim();
	return /^item\./i.test(rawTarget);
}

function getUsesCountUnitLabel(amount, singular, plural) {
	const numericAmount = Number(amount);
	return Number.isFinite(numericAmount) && Math.abs(numericAmount) === 1 ? singular : plural;
}

function formatUsesCountType(target) {
	const rawTarget = String(target ?? '').trim();
	if (!rawTarget) return '';
	const normalized = rawTarget.toLowerCase();
	if (normalized === 'hp' || normalized.endsWith('.hp') || normalized.endsWith('attributes.hp.value') || normalized.endsWith('system.attributes.hp.value')) return 'HP';
	if (['deathsuccess', 'death.success', 'death_success', 'attributes.death.success'].includes(normalized)) return 'death success';
	if (['deathfail', 'deathfailure', 'death.failure', 'death_fail', 'attributes.death.failure'].includes(normalized)) return 'death fail';
	if (normalized === 'hd' || normalized === 'hitdice' || normalized === 'hit-dice' || normalized.endsWith('.hd')) return 'HD';
	return rawTarget.replace(/system\./gi, '').replace(/attributes\./gi, '').replace(/[._]+/g, ' ');
}

function getUsesCountDescriptionSuffix(entry) {
	const rawUsesCount = typeof entry?.usesCount === 'string' ? entry.usesCount.trim() : '';
	const parsed = parseUsesCountSpec(rawUsesCount);
	const rawAmount = parsed.consume || '1';
	const amount = String(rawAmount).trim();
	if (!amount) return '';
	const numericAmount = Number(amount);
	const isRestore = Number.isFinite(numericAmount) && numericAmount < 0;
	const displayAmount = isRestore ? String(Math.abs(numericAmount)) : amount;
	const rawTarget = String(parsed.target || entry?.usesCountTarget || '').trim();
	if (!rawTarget) return '';
	const targetLabel = isItemUsesCountTarget(rawTarget)
		? getUsesCountUnitLabel(displayAmount, 'use', 'uses')
		: formatUsesCountType(rawTarget);
	if (!targetLabel) return '';
	const availableValue = Number(entry?.usesCountAvailable);
	const missingValue = Number(entry?.usesCountMissing);
	const stateText =
		isRestore && Number.isFinite(missingValue) ? ` - missing: ${missingValue}`
		: !isRestore && Number.isFinite(availableValue) ? ` - available: ${availableValue}`
		: '';
	return isRestore ? `(restores: ${displayAmount} ${targetLabel}${stateText})` : `(cost: ${displayAmount} ${targetLabel}${stateText})`;
}
function getCadenceLabelSuffix(cadence) {
	const keyMap = {
		oncePerTurn: 'AC5E.OptinCadence.OncePerTurn',
		oncePerRound: 'AC5E.OptinCadence.OncePerRound',
		oncePerCombat: 'AC5E.OptinCadence.OncePerCombat',
	};
	const key = keyMap[cadence];
	if (!key) return '';
	const localized = _localize(key);
	if (localized && localized !== key) return localized;
	const fallback = {
		oncePerTurn: '(1/turn)',
		oncePerRound: '(1/round)',
		oncePerCombat: '(1/combat)',
	};
	return fallback[cadence] ?? '';
}

function localizeWithFallback(key, fallback) {
	const localized = _localize(key);
	return localized && localized !== key ? localized : fallback;
}

function prepareOptinFieldset(fieldset, dialog, elem, ac5eConfig, legendText) {
	fieldset._ac5eDialog = dialog;
	fieldset._ac5eConfig = ac5eConfig;
	fieldset._ac5eRootElement = elem;
	fieldset.innerHTML = '';
	const legend = document.createElement('legend');
	legend.textContent = legendText;
	fieldset.append(legend);
}

function attachOptinFieldsetChangeHandler(fieldset, dialog, elem, ac5eConfig, deps) {
	fieldset.addEventListener('change', (event) => {
		if (event.target?.dataset?.ac5eOptin !== 'true') return;
		const activeFieldset = event.currentTarget;
		const activeDialog = activeFieldset?._ac5eDialog ?? dialog;
		const activeConfig = activeFieldset?._ac5eConfig ?? ac5eConfig;
		const activeElem = activeFieldset?._ac5eRootElement ?? elem;
		const nextSelections = readOptinSelections(activeElem, activeConfig);
		setOptinSelections(activeConfig, nextSelections);
		const hookType = activeConfig?.hookType;
		if (['attack', 'save', 'check'].includes(hookType)) {
			deps.handleD20OptinSelectionsChanged?.(activeDialog, activeConfig, deps);
			return;
		}
		if (hookType === 'damage') {
			deps.handleDamageOptinSelectionsChanged?.(activeDialog, activeConfig, deps);
			return;
		}
	});
}

function renderOptinRows(fieldset, visibleEntries, ac5eConfig, { askPermission = false } = {}) {
	for (const row of fieldset.querySelectorAll('.form-group')) row.remove();
	const shouldSuffixUnnamedOptins = visibleEntries.length > 1;
	visibleEntries.forEach((entry, index) => {
		const isOptinEntry = Boolean(entry?.optin || entry?.forceOptin);
		if (!isOptinEntry) return;
		const row = document.createElement('div');
		row.className = 'form-group';
		const label = document.createElement('label');
		const rawLabel = typeof entry?.label === 'string' ? entry.label.trim() : '';
		const rawName = typeof entry?.name === 'string' ? entry.name.trim() : '';
		const isUnnamedOptin = isOptinEntry && !rawLabel && !rawName;
		const baseLabel = rawLabel || rawName || String(entry?.id ?? '');
		const indexedLabel = isUnnamedOptin && shouldSuffixUnnamedOptins ? `${baseLabel} #${index + 1}` : baseLabel;
		const usesCountSuffix = isOptinEntry ? getUsesCountLabelSuffix(entry) : '';
		const cadenceSuffix = isOptinEntry ? getCadenceLabelSuffix(entry?.cadence) : '';
		const permissionSuffix = getAskPermissionSourceSuffix(entry, askPermission);
		const detailSuffixes = [usesCountSuffix, permissionSuffix ? `(${permissionSuffix})` : '', cadenceSuffix].filter(Boolean);
		label.textContent = detailSuffixes.length ? `${indexedLabel} ${detailSuffixes.join(' ')}` : indexedLabel;
		const baseDescription =
			typeof entry.description === 'string' ? entry.description.trim()
			: typeof entry.autoDescription === 'string' ? entry.autoDescription.trim()
			: '';
		const usesCountDescription = isOptinEntry ? getUsesCountDescriptionSuffix(entry) : '';
		const description = [baseDescription, usesCountDescription].filter(Boolean).join(baseDescription && usesCountDescription ? ' ' : '');
		let descriptionPill = null;
		if (description) {
			descriptionPill = document.createElement('i');
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
		}
		const input = document.createElement('input');
		input.type = 'checkbox';
		input.name = `ac5eOptins.${entry.id}`;
		input.dataset.ac5eOptinId = entry.id;
		input.dataset.ac5eOptin = 'true';
		input.checked = !!ac5eConfig?.optinSelected?.[entry.id];
		if (descriptionPill) row.append(label, descriptionPill, input);
		else row.append(label, input);
		fieldset.append(row);
	});
}

function getRollingActorIdForOptins(ac5eConfig) {
	const tokenId = ac5eConfig?.tokenId;
	if (!tokenId) return null;
	const token = canvas?.tokens?.get(tokenId);
	return token?.actor?.id ?? null;
}

function shouldAskPermissionForOptinEntry(entry, ac5eConfig, rollingActorId) {
	if (!(entry?.optin || entry?.forceOptin)) return false;
	const sourceActorId = typeof entry?.sourceActorId === 'string' && entry.sourceActorId ? entry.sourceActorId : null;
	const permissionSourceActorId = typeof entry?.permissionSourceActorId === 'string' && entry.permissionSourceActorId ? entry.permissionSourceActorId : null;
	const key = String(entry?.changeKey ?? '').toLowerCase();
	const hookType = String(ac5eConfig?.hookType ?? '').toLowerCase();
	const isModifyAC = key.includes('.modifyac');
	const isGrants = key.includes('.grants.');
	const isAura = key.includes('.aura.') || Boolean(entry?.isAura);
	if (permissionSourceActorId !== null && permissionSourceActorId !== rollingActorId) return true;

	if (hookType === 'attack' && isModifyAC) {
		if (isGrants) return false;
		if (isAura) return sourceActorId !== null && sourceActorId !== rollingActorId;
		return true;
	}

	return sourceActorId !== null && sourceActorId !== rollingActorId;
}

function getAskPermissionSourceSuffix(entry, askPermission) {
	if (!askPermission) return '';
	const permissionSourceName = typeof entry?.permissionSourceActorName === 'string' ? entry.permissionSourceActorName.trim() : '';
	if (permissionSourceName) return permissionSourceName;
	if (entry?.isAura) return '';
	const sourceName = typeof entry?.sourceActorName === 'string' ? entry.sourceActorName.trim() : '';
	return sourceName || '';
}
