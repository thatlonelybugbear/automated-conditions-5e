import { _getOptinSelectionScale, _isOptinSelectionActive, _localize } from '../ac5e-helpers.mjs';
import { getAllOptinEntriesForHook, getRollNonBonusOptinEntries } from './ac5e-hooks-roll-selections.mjs';

export function renderOptionalBonusesRoll(dialog, elem, ac5eConfig, deps) {
	const entries = [...getAllOptinEntriesForHook(ac5eConfig, ac5eConfig.hookType), ...getRollNonBonusOptinEntries(ac5eConfig, ac5eConfig.hookType)]
		.filter((entry) => Boolean(entry?.optin || entry?.forceOptin))
		.filter((entry) => shouldIncludeAbilityOverrideEntry(entry, ac5eConfig));
	renderOptionalBonusesFieldset(dialog, elem, ac5eConfig, entries, deps);
}

function shouldIncludeAbilityOverrideEntry(entry, ac5eConfig) {
	if (!entry || ac5eConfig?.hookType !== 'attack') return true;
	if (entry?.mode !== 'abilityOverride') return true;
	const isSelected = _isOptinSelectionActive(ac5eConfig?.optinSelected?.[entry?.id]);
	if (isSelected) return true;
	const overrideAbility = String(entry?.set ?? '').trim().toLowerCase();
	if (!overrideAbility) return true;
	const baselineAbility = String(
		ac5eConfig?.options?._ac5eBaselineAttackAbility ??
		ac5eConfig?.preAC5eConfig?._ac5eBaselineAttackAbility ??
		ac5eConfig?.subject?.attack?.ability ??
		ac5eConfig?.options?.activity?.attack?.ability ??
		'',
	)
		.trim()
		.toLowerCase();
	if (!baselineAbility) return true;
	return overrideAbility !== baselineAbility;
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
		if (id) selected[id] = input.checked;
	}
	const sliders = elem.querySelectorAll('input[data-ac5e-optin-scale="true"]');
	for (const slider of sliders) {
		const id = slider.dataset.ac5eOptinId;
		if (!id || !selected[id]) continue;
		const scale = Number(slider.value);
		if (!Number.isFinite(scale)) continue;
		selected[id] = { enabled: true, scale };
	}
	return selected;
}

export function setOptinSelections(ac5eConfig, nextSelections) {
	const previous = ac5eConfig?.optinSelected ?? {};
	const prevKeys = Object.keys(previous);
	const nextKeys = Object.keys(nextSelections ?? {});
	const changed = prevKeys.length !== nextKeys.length || prevKeys.some((key) => {
		const prevValue = previous[key];
		const nextValue = nextSelections?.[key];
		if (prevValue === nextValue) return false;
		const prevEnabled = _isOptinSelectionActive(prevValue);
		const nextEnabled = _isOptinSelectionActive(nextValue);
		if (prevEnabled !== nextEnabled) return true;
		const prevScale = _getOptinSelectionScale(prevValue);
		const nextScale = _getOptinSelectionScale(nextValue);
		return prevScale !== nextScale;
	});
	if (changed) {
		if (ac5eConfig?.tooltipObj && ac5eConfig.hookType) delete ac5eConfig.tooltipObj[ac5eConfig.hookType];
		ac5eConfig.tooltipObj = ac5eConfig.tooltipObj ?? {};
		ac5eConfig.advantageMode = undefined;
		ac5eConfig.defaultButton = undefined;
	}
	ac5eConfig.optinSelected = nextSelections ?? {};
}

function updateSingleOptinSelection(ac5eConfig, optinId, checked, { scaleMin = null } = {}) {
	if (!ac5eConfig || !optinId) return;
	const previous = ac5eConfig.optinSelected ?? {};
	const priorSelection = previous[optinId];
	const priorScale = _getOptinSelectionScale(priorSelection);
	const nextScale = Number.isFinite(priorScale) ? priorScale : Number(scaleMin);
	const nextSelections = {
		...previous,
		[optinId]: checked ? (Number.isFinite(nextScale) ? { enabled: true, scale: nextScale } : true) : false,
	};
	setOptinSelections(ac5eConfig, nextSelections);
}

function updateSingleOptinScale(ac5eConfig, optinId, scale) {
	if (!ac5eConfig || !optinId) return;
	const numericScale = Number(scale);
	if (!Number.isFinite(numericScale)) return;
	const previous = ac5eConfig.optinSelected ?? {};
	const enabled = _isOptinSelectionActive(previous[optinId]);
	const nextSelections = { ...previous, [optinId]: { enabled, scale: numericScale } };
	setOptinSelections(ac5eConfig, nextSelections);
}

function getUsesCountLabelSuffix(entry) {
	const statusUpdateLabel = getStatusUpdateText(entry, { detailed: false });
	if (statusUpdateLabel) return '(Info)';
	const counterDisplay = getCounterDisplaySpec(entry);
	const parsed = counterDisplay.parsed;
	const hasRecover = !!entry?.recover;
	if (parsed.scaling) {
		const target = formatUsesCountType(counterDisplay.target);
		if (!target) return '';
		const selectedScale = Number(entry?.selectedScale);
		const displayScale = Number.isFinite(selectedScale) ? Math.abs(selectedScale) : selectedScale;
		const consumeText = Number.isFinite(displayScale) ? ` ${displayScale}` : '';
		const isRestore = parsed.scalingSign < 0 || hasRecover;
		return isRestore ? `(restores${consumeText} ${target})` : `(consumes${consumeText} ${target})`;
	}
	const rawAmount = counterDisplay.amount;
	if (typeof rawAmount !== 'string') return '';
	const amount = rawAmount.trim();
	if (!amount) return '';
	const numericAmount = Number(amount);
	const isRestore = hasRecover || (Number.isFinite(numericAmount) && numericAmount < 0);
	const displayAmount = isRestore ? `${Math.abs(numericAmount)}` : amount;
	if (isItemUsesCountTarget(counterDisplay.target)) {
		const unit = getUsesCountUnitLabel(displayAmount, 'use', 'uses');
		return isRestore ? `(restores ${displayAmount} ${unit})` : `(costs ${displayAmount} ${unit})`;
	}
	const target = formatUsesCountType(counterDisplay.target);
	if (!target) return '';
	return isRestore ? `(restores ${displayAmount} ${target})` : `(costs ${displayAmount} ${target})`;
}

function parseUsesCountSpec(rawValue) {
	if (typeof rawValue !== 'string' || !rawValue.trim()) return { target: '', consume: '', scaling: null, scalingSign: 1 };
	const parts = splitTopLevelCsv(rawValue);
	const [target = '', ...consumeParts] = parts;
	const consumeRaw = consumeParts.join(',').trim();
	const scalingData = parseScalingSpecFromUsesCountConsume(consumeRaw);
	if (scalingData?.scaling) {
		return {
			target: target.trim(),
			consume: '',
			scaling: scalingData.scaling,
			scalingSign: scalingData.scalingSign,
		};
	}
	return {
		target: target.trim(),
		consume: consumeRaw,
		scaling: null,
		scalingSign: 1,
	};
}

function parseScalingSpecFromUsesCountConsume(consumeRaw) {
	if (typeof consumeRaw !== 'string') return null;
	const trimmed = consumeRaw.trim();
	const match = trimmed.match(/^([+-])?\s*(\{[\s\S]*\})$/);
	if (!match) return null;
	const scaling = normalizeScalingConfig(match[2]);
	if (!scaling) return null;
	return {
		scaling,
		scalingSign: match[1] === '-' ? -1 : 1,
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
	if (typeof target !== 'string') return false;
	const rawTarget = target.trim();
	if (!rawTarget) return false;
	if (/^item\./i.test(rawTarget)) return true;
	if (rawTarget.toLowerCase() === 'origin') return true;
	const parsed = foundry?.utils?.parseUuid?.(rawTarget);
	if (!parsed) return false;
	if (parsed.type === 'Item') return true;
	if (parsed.type !== 'Activity') return false;
	return Array.isArray(parsed.embedded) && parsed.embedded.includes('Item');
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
	const statusUpdateDescription = getStatusUpdateText(entry, { detailed: false });
	if (statusUpdateDescription) return `(${statusUpdateDescription})`;
	const counterDisplay = getCounterDisplaySpec(entry);
	const parsed = counterDisplay.parsed;
	const hasRecover = !!entry?.recover;
	if (parsed.scaling) {
		const target = formatUsesCountType(counterDisplay.target);
		if (!target) return '';
		const selectedScale = Number(entry?.selectedScale);
		const displayScale = Number.isFinite(selectedScale) ? Math.abs(selectedScale) : selectedScale;
		const consumeText = Number.isFinite(displayScale) ? ` ${displayScale}` : '';
		const availableValue = Number(entry?.usesCountAvailable);
		const missingValue = Number(entry?.usesCountMissing);
		const isRestore = parsed.scalingSign < 0 || hasRecover;
		const stateText =
			isRestore ?
				Number.isFinite(missingValue) ? ` - missing: ${missingValue}` : ''
			:	Number.isFinite(availableValue) ? ` - available: ${availableValue}` : '';
		return isRestore ? `(restores: ${consumeText.trim()} ${target}${stateText})` : `(cost: ${consumeText.trim()} ${target}${stateText})`;
	}
	const rawAmount = counterDisplay.amount;
	if (typeof rawAmount !== 'string') return '';
	const amount = rawAmount.trim();
	if (!amount) return '';
	const numericAmount = Number(amount);
	const isRestore = hasRecover || (Number.isFinite(numericAmount) && numericAmount < 0);
	const displayAmount = isRestore ? `${Math.abs(numericAmount)}` : amount;
	const rawTarget = typeof counterDisplay.target === 'string' ? counterDisplay.target.trim() : '';
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

function getCounterDisplaySpec(entry) {
	const rawUsesCount = typeof entry?.usesCount === 'string' ? entry.usesCount.trim() : '';
	const parsedUsesCount = parseUsesCountSpec(rawUsesCount);
	const usesCountTarget =
		typeof parsedUsesCount.target === 'string' && parsedUsesCount.target.trim() ? parsedUsesCount.target.trim()
		: typeof entry?.usesCountTarget === 'string' ? entry.usesCountTarget.trim()
		: '';
	if (parsedUsesCount.scaling || rawUsesCount || usesCountTarget) {
		return {
			parsed: parsedUsesCount,
			target: usesCountTarget,
			amount: parsedUsesCount.consume || '1',
		};
	}

	const rawUpdateTarget =
		typeof entry?.updateTarget === 'string' && entry.updateTarget.trim() ? entry.updateTarget.trim()
		: typeof entry?.usesCountTarget === 'string' ? entry.usesCountTarget.trim()
		: '';
	const rawUpdateValue = typeof entry?.updateValue === 'string' ? entry.updateValue.trim() : '';
	const updateNumeric = Number(rawUpdateValue);
	const normalizedUpdateValue =
		entry?.updateOp === 'set' || !Number.isFinite(updateNumeric) ? rawUpdateValue
		: `${-updateNumeric}`;
	return {
		parsed: { target: rawUpdateTarget, consume: normalizedUpdateValue, scaling: null, scalingSign: 1 },
		target: rawUpdateTarget,
		amount: normalizedUpdateValue,
	};
}

function getStatusUpdateText(entry, { detailed = false } = {}) {
	const rawTarget = typeof entry?.updateTarget === 'string' ? entry.updateTarget.trim() : '';
	if (!rawTarget) return '';
	const statusMatch = rawTarget.match(/^(rollingactor|opponentactor)(?:\.[^.]+)*\.statuses\.([^.]+)$/i);
	if (!statusMatch) return '';
	const actorKey = statusMatch[1]?.toLowerCase();
	const statusId = `${statusMatch[2] ?? ''}`.trim();
	if (!statusId) return '';
	const rawUpdateValue = typeof entry?.updateValue === 'string' ? entry.updateValue.trim() : '';
	const numericValue = Number(rawUpdateValue);
	const active = Number.isFinite(numericValue) ? numericValue > 0 : rawUpdateValue !== '-1';
	const actorLabel = actorKey === 'opponentactor' ? 'opponent actor' : 'rolling actor';
	const statusLabel = getStatusEffectLabel(statusId);
	if (!detailed) return active ? `Apply ${statusLabel} to ${actorLabel}` : `Remove ${statusLabel} from ${actorLabel}`;
	return active ? `Apply ${statusLabel} (${statusId}) to ${actorLabel}` : `Remove ${statusLabel} (${statusId}) from ${actorLabel}`;
}

function getStatusEffectLabel(statusId) {
	const normalizedId = `${statusId ?? ''}`.trim();
	if (!normalizedId) return 'status';
	const entries = Array.from(CONFIG?.statusEffects ?? []);
	const match = entries.find((entry) => `${entry?.id ?? ''}`.trim().toLowerCase() === normalizedId.toLowerCase());
	return `${match?.name ?? normalizedId}`.trim();
}

function resolveOptinScaleDescription(description, entry, ac5eConfig) {
	if (typeof description !== 'string' || !/(?:\(optinScale\)|\boptinScale\b)/i.test(description)) return description;
	const selection = ac5eConfig?.optinSelected?.[entry?.id];
	const selectedScale = _getOptinSelectionScale(selection);
	if (!Number.isFinite(selectedScale)) return description;
	return description
		.replace(/\(optinScale\)/gi, selectedScale)
		.replace(/\boptinScale\b/gi, selectedScale);
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

function hasEmbeddedDocumentReference(text) {
	return /@Embed\[[^\]]+\]/i.test(String(text ?? ''));
}

function stripHtmlToPlainText(html) {
	if (typeof html !== 'string' || !html.trim()) return '';
	const container = document.createElement('div');
	container.innerHTML = html;
	return String(container.textContent ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

async function resolveDescriptionTooltipText(description) {
	const raw = typeof description === 'string' ? description.trim() : '';
	if (!raw) return '';
	if (!hasEmbeddedDocumentReference(raw)) return raw;
	const enrichHTML = foundry?.applications?.ux?.TextEditor?.implementation?.enrichHTML;
	if (typeof enrichHTML !== 'function') return raw;
	try {
		const enriched = await enrichHTML(raw);
		return stripHtmlToPlainText(enriched) || raw;
	} catch {
		return raw;
	}
}

function applyDescriptionPillTooltip(descriptionPill, description) {
	if (!descriptionPill) return;
	void resolveDescriptionTooltipText(description).then((tooltipText) => {
		if (!tooltipText) return;
		descriptionPill.title = tooltipText;
		descriptionPill.setAttribute('aria-label', tooltipText);
	});
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
		if (event.target?.dataset?.ac5eOptin !== 'true' && event.target?.dataset?.ac5eOptinScale !== 'true') return;
		const activeFieldset = event.currentTarget;
		const activeDialog = activeFieldset?._ac5eDialog ?? dialog;
		const activeConfig = activeFieldset?._ac5eConfig ?? ac5eConfig;
		const input = event.target;
		if (input?.dataset?.ac5eOptinScale === 'true') updateSingleOptinScale(activeConfig, input?.dataset?.ac5eOptinId, input?.value);
		else updateSingleOptinSelection(activeConfig, input?.dataset?.ac5eOptinId, input?.checked, { scaleMin: Number(input?.dataset?.ac5eOptinScaleMin) });
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
		const parsedUsesCount = parseUsesCountSpec(entry?.usesCount);
		const scaling = getOptinScaling(entry, parsedUsesCount);
		const selectedScale = _getOptinSelectionScale(ac5eConfig?.optinSelected?.[entry.id]);
		if (scaling) entry.selectedScale = Number.isFinite(selectedScale) ? selectedScale : scaling.min;
		else delete entry.selectedScale;
		const row = document.createElement('div');
		row.className = 'form-group ac5e-optin-row';
		const label = document.createElement('label');
		label.className = 'ac5e-optin-label';
		label.style.flex = '1 1 0';
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
		label.title = label.textContent;
		const baseDescription =
			typeof entry.description === 'string' ? entry.description.trim()
			: typeof entry.autoDescription === 'string' ? entry.autoDescription.trim()
			: '';
		const hasStatusUpdateDescription = Boolean(getStatusUpdateText(entry, { detailed: false }));
		const usesCountDescription = isOptinEntry ? getUsesCountDescriptionSuffix(entry) : '';
		const scaledBaseDescription = resolveOptinScaleDescription(baseDescription, entry, ac5eConfig);
		const description =
			hasStatusUpdateDescription ? usesCountDescription
			: [scaledBaseDescription, usesCountDescription].filter(Boolean).join(scaledBaseDescription && usesCountDescription ? ' ' : '');
		let descriptionPill = null;
		if (description) {
			descriptionPill = document.createElement('i');
			descriptionPill.className = 'ac5e-optin-description-pill';
			descriptionPill.classList.add('fa-solid', 'fa-circle-info');
			descriptionPill.title = description;
			descriptionPill.setAttribute('role', 'note');
			applyDescriptionPillTooltip(descriptionPill, description);
		}
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.style.flex = '0 0 auto';
		checkbox.style.marginInlineStart = 'auto';
		checkbox.name = `ac5eOptins.${entry.id}`;
		checkbox.dataset.ac5eOptinId = entry.id;
		checkbox.dataset.ac5eOptin = 'true';
		checkbox.checked = _isOptinSelectionActive(ac5eConfig?.optinSelected?.[entry.id]);
		if (scaling) {
			checkbox.dataset.ac5eOptinScaleMin = String(scaling.min);
			const slider = document.createElement('input');
			slider.type = 'range';
			slider.name = `ac5eOptinScale.${entry.id}`;
			slider.dataset.ac5eOptinId = entry.id;
			slider.dataset.ac5eOptinScale = 'true';
			slider.min = scaling.min;
			slider.max = scaling.max;
			slider.step = scaling.step;
			const initialScale = Number.isFinite(selectedScale) ? selectedScale : scaling.min;
			entry.selectedScale = initialScale;
			slider.value = String(initialScale);
			slider.disabled = !checkbox.checked;
			slider.style.marginInlineStart = 'auto';
			slider.style.flex = '0 0 7.5rem';
			checkbox.addEventListener('change', () => {
				slider.disabled = !checkbox.checked;
			});
			const valueLabel = document.createElement('span');
			valueLabel.className = 'ac5e-optin-scale-value';
			valueLabel.textContent = slider.value;
			valueLabel.style.flex = '0 0 auto';
			slider.addEventListener('input', () => {
				valueLabel.textContent = slider.value;
			});
			if (descriptionPill) row.append(label, slider, valueLabel, checkbox, descriptionPill);
			else row.append(label, slider, valueLabel, checkbox);
		} else if (descriptionPill) row.append(label, checkbox, descriptionPill);
		else row.append(label, checkbox);
		fieldset.append(row);
	});
}

function normalizeScalingConfig(scaling) {
	if (!scaling) return null;
	let source = scaling;
	if (typeof scaling === 'string') {
		const trimmed = scaling.trim();
		if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
		source = Object.fromEntries(
			trimmed
				.slice(1, -1)
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean)
				.map((part) => {
					const [key, value] = part.split(/[:=]/).map((v) => v?.trim());
					return [key?.toLowerCase(), Number(value)];
				}),
		);
	}
	if (typeof source !== 'object') return null;
	const min = Number(source.min);
	const max = Number(source.max);
	const step = Number(source.step);
	if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step)) return null;
	if (max < min || step <= 0) return null;
	return { min, max, step };
}

function getOptinScaling(entry, parsedUsesCount) {
	const mode = entry?.mode;
	const modeSupportsScaling =
		mode === 'bonus' ||
		mode === 'update' ||
		mode === 'extraDice' ||
		mode === 'targetADC' ||
		mode === 'criticalThreshold' ||
		mode === 'fumbleThreshold';
	if (!modeSupportsScaling) return null;
	return parsedUsesCount?.scaling ?? null;
}

export function getRollingActorIdForOptins(ac5eConfig) {
	const tokenId = ac5eConfig?.tokenId;
	if (!tokenId) return null;
	const token = canvas?.tokens?.get(tokenId);
	return token?.actor?.id ?? null;
}

export function shouldAskPermissionForOptinEntry(entry, ac5eConfig, rollingActorId) {
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

export function getAskPermissionSourceSuffix(entry, askPermission) {
	if (!askPermission) return '';
	const permissionSourceName = typeof entry?.permissionSourceActorName === 'string' ? entry.permissionSourceActorName.trim() : '';
	if (permissionSourceName) return permissionSourceName;
	if (entry?.isAura) return '';
	const sourceName = typeof entry?.sourceActorName === 'string' ? entry.sourceActorName.trim() : '';
	return sourceName || '';
}
