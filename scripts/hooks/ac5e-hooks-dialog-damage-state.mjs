import { _filterOptinEntries } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { _buildRollEvaluationData } from '../ac5e-runtimeLogic.mjs';

export function doDialogDamageRender(dialog, elem, getConfigAC5E, deps) {
	if (dialog._ac5eDamageRenderInProgress) return;
	dialog._ac5eDamageRenderInProgress = true;
	try {
		deps.restoreDamageConfigFromFrozenBaseline(getConfigAC5E, dialog.config);
		const frozenDamageBaseline = getConfigAC5E?.preAC5eConfig?.frozenDamageBaseline ?? getConfigAC5E?.frozenDamageBaseline;
		deps.setOptinSelections(getConfigAC5E, deps.readOptinSelections(elem, getConfigAC5E));
		renderOptionalBonusesDamage(dialog, elem, getConfigAC5E, deps);
		applyOptinCriticalToDamageConfig(getConfigAC5E, dialog.config);
		const currentCritical = getConfigAC5E.isCritical ?? dialog.config.isCritical ?? false;
		ensureDamagePreservedInitialData(getConfigAC5E, frozenDamageBaseline, dialog?.config?.rolls, currentCritical);
		captureBaseCriticalBonusDamage(getConfigAC5E, dialog?.config?.rolls);
		captureBaseDamageTypeData(getConfigAC5E, dialog?.config?.rolls, frozenDamageBaseline);
		if (ac5e?.debug?.damageTypeOverride) {
			console.warn(
				`AC5E damage.typeOverride initial state\n${JSON.stringify(
					{
						currentOptinSelections: getConfigAC5E?.optinSelected ?? {},
						frozenDamageBaseline:
							Array.isArray(frozenDamageBaseline?.rolls) ?
								frozenDamageBaseline.rolls.map((roll, index) => ({
									index,
									type: roll?.type ?? null,
									types: Array.isArray(roll?.types) ? [...roll.types] : [],
								}))
							: [],
					},
					null,
					2,
				)}\n${stringifyDamageTypeDebugState(dialog?.config?.rolls, getConfigAC5E?.preservedInitialData)}`,
			);
		}
		const previousCritical = getConfigAC5E._lastOptinCritical;
		getConfigAC5E._lastOptinCritical = currentCritical;
		if (previousCritical !== undefined && previousCritical !== currentCritical) {
			dialog.rebuild();
			dialog.render();
			return;
		}
		const currentRolls = Array.isArray(dialog?.config?.rolls) ? dialog.config.rolls : [];
		const baseRolls = getNonSyntheticDamageRolls(currentRolls);
		const rollsLength = baseRolls.length;
		const previousRollCount = getConfigAC5E._lastDamageRollCount ?? rollsLength;
		const baseFormulas = getConfigAC5E.preservedInitialData?.formulas ?? (getConfigAC5E.isCritical ? baseRolls.map((roll) => roll?.parts?.join(' + ') ?? roll?.formula).filter(Boolean) : undefined);
		const damageTypesByIndex = getDamageTypesByIndex(dialog, elem);
		const selectedDamageTypesByIndex = Array.fromRange(rollsLength).map((el) => {
			const selected =
				damageTypesByIndex?.[el] ??
				elem.querySelector(`select[name="roll.${el}.damageType"]`)?.value ??
				currentRolls?.[el]?.options?.type;
			return selected ? String(selected).toLowerCase() : undefined;
		});
		const selects = selectedDamageTypesByIndex.filter(Boolean);
		const domFormulas = Array.from(elem.querySelectorAll('.formula'))
			.map((el) => el.textContent?.trim())
			.filter(Boolean);
		const configFormulas = baseRolls
			.map((roll) => roll?.formula ?? (Array.isArray(roll?.parts) ? roll.parts.join(' + ') : undefined))
			.filter((formula) => typeof formula === 'string' && formula.trim().length)
			.map((formula) => formula.trim());
		const formulas = configFormulas.length >= rollsLength || configFormulas.length > domFormulas.length ? configFormulas : domFormulas;
		const rollCountChanged = rollsLength !== previousRollCount;
		getConfigAC5E._lastDamageRollCount = rollsLength;
		if (rollCountChanged) {
			getConfigAC5E.options.selectedDamageTypes = selects;
			getConfigAC5E.options.selectedDamageTypesByIndex = selectedDamageTypesByIndex;
			const currentFormulas = formulas;
			if (getConfigAC5E.preservedInitialData) {
				const preserved = getConfigAC5E.preservedInitialData;
				const preservedLength = preserved.formulas.length;
				if (currentFormulas.length > preservedLength) {
					const newFormulas = currentFormulas.slice(preservedLength);
					preserved.formulas = preserved.formulas.concat(newFormulas);
					preserved.modified = preserved.modified.concat(newFormulas);
					const newZeros = newFormulas.map(() => 0);
					const newOnes = newFormulas.map(() => 1);
					const newArrays = newFormulas.map(() => []);
					const newStrings = newFormulas.map(() => '');
					const newNulls = newFormulas.map(() => null);
					preserved.activeExtraDice = (Array.isArray(preserved.activeExtraDice) ? preserved.activeExtraDice : []).concat(newZeros);
					preserved.activeCriticalStaticExtraDice = (Array.isArray(preserved.activeCriticalStaticExtraDice) ? preserved.activeCriticalStaticExtraDice : []).concat(newZeros);
					preserved.activeCriticalStaticExtraDiceMultipliers = (Array.isArray(preserved.activeCriticalStaticExtraDiceMultipliers) ? preserved.activeCriticalStaticExtraDiceMultipliers : []).concat(
						newOnes,
					);
					preserved.activeExtraDiceMultipliers = (Array.isArray(preserved.activeExtraDiceMultipliers) ? preserved.activeExtraDiceMultipliers : []).concat(newOnes);
					preserved.activeDiceSteps = (Array.isArray(preserved.activeDiceSteps) ? preserved.activeDiceSteps : []).concat(newZeros);
					preserved.activeFormulaOperators = (Array.isArray(preserved.activeFormulaOperators) ? preserved.activeFormulaOperators : []).concat(newArrays);
					preserved.activeOptinBonusParts = (Array.isArray(preserved.activeOptinBonusParts) ? preserved.activeOptinBonusParts : []).concat(newArrays);
					preserved.activeCriticalBonusDamageByRoll = (Array.isArray(preserved.activeCriticalBonusDamageByRoll) ? preserved.activeCriticalBonusDamageByRoll : []).concat(newStrings);
					preserved.baseCriticalBonusDamageByRoll = (Array.isArray(preserved.baseCriticalBonusDamageByRoll) ? preserved.baseCriticalBonusDamageByRoll : []).concat(newNulls);
					preserved.baseDamageTypeByRoll = (Array.isArray(preserved.baseDamageTypeByRoll) ? preserved.baseDamageTypeByRoll : []).concat(newNulls);
					preserved.baseDamageTypesByRoll = (Array.isArray(preserved.baseDamageTypesByRoll) ? preserved.baseDamageTypesByRoll : []).concat(newArrays);
					preserved.activeDamageTypeByRoll = (Array.isArray(preserved.activeDamageTypeByRoll) ? preserved.activeDamageTypeByRoll : []).concat(newNulls);
					preserved.activeDamageTypesByRoll = (Array.isArray(preserved.activeDamageTypesByRoll) ? preserved.activeDamageTypesByRoll : []).concat(newArrays);
				} else if (currentFormulas.length < preservedLength) {
					const trim = (value) => (Array.isArray(value) ? value.slice(0, currentFormulas.length) : value);
					preserved.formulas = preserved.formulas.slice(0, currentFormulas.length);
					preserved.modified = preserved.modified.slice(0, currentFormulas.length);
					preserved.activeExtraDice = trim(preserved.activeExtraDice);
					preserved.activeCriticalStaticExtraDice = trim(preserved.activeCriticalStaticExtraDice);
					preserved.activeCriticalStaticExtraDiceMultipliers = trim(preserved.activeCriticalStaticExtraDiceMultipliers);
					preserved.activeExtraDiceMultipliers = trim(preserved.activeExtraDiceMultipliers);
					preserved.activeDiceSteps = trim(preserved.activeDiceSteps);
					preserved.activeFormulaOperators = trim(preserved.activeFormulaOperators);
					preserved.activeOptinBonusParts = trim(preserved.activeOptinBonusParts);
					preserved.activeCriticalBonusDamageByRoll = trim(preserved.activeCriticalBonusDamageByRoll);
					preserved.baseCriticalBonusDamageByRoll = trim(preserved.baseCriticalBonusDamageByRoll);
					preserved.baseDamageTypeByRoll = trim(preserved.baseDamageTypeByRoll);
					preserved.baseDamageTypesByRoll = trim(preserved.baseDamageTypesByRoll);
					preserved.activeDamageTypeByRoll = trim(preserved.activeDamageTypeByRoll);
					preserved.activeDamageTypesByRoll = trim(preserved.activeDamageTypesByRoll);
				}
			} else if (currentFormulas.length) {
				getConfigAC5E.preservedInitialData = buildDamagePreservedInitialData(currentFormulas);
			}
			syncDamageRollModifierOptions(getConfigAC5E, dialog?.config?.rolls);
			syncCriticalStaticBonusDamageRollOptions(getConfigAC5E, dialog?.config?.rolls);
			if (!dialog._ac5eDamageRollCountRefreshQueued) {
				dialog._ac5eDamageRollCountRefreshQueued = true;
				Promise.resolve().then(() => {
					dialog._ac5eDamageRollCountRefreshQueued = false;
					dialog.rebuild();
					dialog.render();
				});
			}
			return;
		}
		const changed = applyOrResetFormulaChanges(elem, getConfigAC5E, 'apply', baseFormulas, damageTypesByIndex);
		const effectiveFormulas = getConfigAC5E.preservedInitialData?.modified ?? formulas;
		syncAppendedBonusRolls(dialog, getConfigAC5E, effectiveFormulas);
		syncDamageRollTypeOverrideOptions(getConfigAC5E, dialog?.config?.rolls);
		syncDamageRollModifierOptions(getConfigAC5E, dialog?.config?.rolls);
		syncCriticalStaticBonusDamageRollOptions(getConfigAC5E, dialog?.config?.rolls);
		const effectiveBaseRolls = getNonSyntheticDamageRolls(dialog.config.rolls);
		const effectiveDamageTypesByIndex = effectiveBaseRolls.map((roll) => {
			const type = roll?.options?.type;
			return typeof type === 'string' && type.trim().length ? String(type).toLowerCase() : undefined;
		});
		const effectiveSelects = effectiveDamageTypesByIndex.filter(Boolean);
		const compared = compareArrays(getConfigAC5E.options.selectedDamageTypesByIndex, effectiveDamageTypesByIndex);
		const damageTypesChanged = !compared.equal;
		if (!damageTypesChanged && changed) {
			dialog.rebuild();
			dialog.render();
			return;
		}
		if (!damageTypesChanged && !changed) {
			dialog.config.rolls[0].options[deps.Constants.MODULE_ID].usedParts ??= dialog.config.rolls[0].options[deps.Constants.MODULE_ID].parts;
			return;
		}
		const newConfig = dialog.config;
		newConfig.rolls = [...baseRolls];
		const currentRollsSnapshot = baseRolls.map((roll) => ({
			parts: Array.isArray(roll?.parts) ? [...roll.parts] : [],
			formula: roll?.formula,
			options: { maximum: roll?.options?.maximum, minimum: roll?.options?.minimum, maximize: roll?.options?.maximize, minimize: roll?.options?.minimize },
		}));
		getConfigAC5E.options.defaultDamageType = undefined;
		getConfigAC5E.options.damageTypes = undefined;
		getConfigAC5E.options.selectedDamageTypes = undefined;
		getConfigAC5E.options.selectedDamageTypesByIndex = undefined;
		const currentOptinSelections = deps.readOptinSelections(elem, getConfigAC5E);
		deps.setOptinSelections(getConfigAC5E, currentOptinSelections);
		applyOptinCriticalToDamageConfig(getConfigAC5E, newConfig);
		const reEval = getConfigAC5E.reEval ?? {};
		reEval.initialDamages = getConfigAC5E.reEval?.initialDamages ?? selects;
		reEval.initialRolls =
			getConfigAC5E.reEval?.initialRolls ??
			baseRolls.map((roll) => ({
				parts: Array.isArray(roll?.parts) ? roll.parts : [],
				options: { maximum: roll?.options?.maximum, minimum: roll?.options?.minimum, maximize: roll?.options?.maximize, minimize: roll?.options?.minimize },
			}));
		reEval.initialFormulas = getConfigAC5E.reEval?.initialFormulas ?? formulas;
		if (newConfig.rolls?.[compared.index]?.options) newConfig.rolls[compared.index].options.type = compared.selectedValue;
		const effectiveCritical = newConfig.isCritical ?? getConfigAC5E.isCritical ?? getConfigAC5E.preAC5eConfig?.wasCritical ?? false;
		if (newConfig.midiOptions) newConfig.midiOptions.isCritical = effectiveCritical;
		const rollCriticalByIndex = Array.isArray(getConfigAC5E.damageRollCriticalByIndex) ? getConfigAC5E.damageRollCriticalByIndex : [];
		const preservedBaseFormulas = Array.isArray(getConfigAC5E.preservedInitialData?.formulas) ? getConfigAC5E.preservedInitialData.formulas : [];
		for (let i = 0; i < rollsLength; i++) {
			const roll = newConfig.rolls[i];
			if (!roll) continue;
			const baseFormula = preservedBaseFormulas?.[i] ?? reEval.initialFormulas?.[i] ?? currentRollsSnapshot?.[i]?.formula;
			if (typeof baseFormula === 'string' && baseFormula.trim().length) {
				roll.formula = baseFormula;
				roll.parts = baseFormula
					.split('+')
					.map((part) => part.trim())
					.filter(Boolean);
			} else {
				const initialParts = Array.isArray(reEval.initialRolls?.[i]?.parts) ? [...reEval.initialRolls[i].parts] : [];
				const currentParts = Array.isArray(currentRollsSnapshot?.[i]?.parts) ? [...currentRollsSnapshot[i].parts] : [];
				roll.parts = initialParts.length ? initialParts : currentParts;
				if (roll.parts.length) roll.formula = roll.parts.join(' + ');
			}
			if (roll.options) {
				roll.options.maximum = currentRollsSnapshot?.[i]?.options?.maximum ?? reEval.initialRolls?.[i]?.options?.maximum;
				roll.options.minimum = currentRollsSnapshot?.[i]?.options?.minimum ?? reEval.initialRolls?.[i]?.options?.minimum;
				roll.options.maximize = currentRollsSnapshot?.[i]?.options?.maximize ?? reEval.initialRolls?.[i]?.options?.maximize;
				roll.options.minimize = currentRollsSnapshot?.[i]?.options?.minimize ?? reEval.initialRolls?.[i]?.options?.minimize;
				roll.options.isCritical = rollCriticalByIndex[i] ?? effectiveCritical;
			}
		}
		const newDialog = { options: { window: { title: dialog.message.flavor }, isCritical: effectiveCritical, defaultButton: effectiveCritical ? 'critical' : 'normal' } };
		const preservedDamageBaselineState = snapshotDamageBaselineState(getConfigAC5E);
		deps.setOptinSelections(getConfigAC5E, {});
		getConfigAC5E = deps.preRollDamage(newConfig, newDialog, dialog.message, 'damage', reEval);
		restoreDamageBaselineState(getConfigAC5E, preservedDamageBaselineState);
		deps.setOptinSelections(getConfigAC5E, currentOptinSelections);
		applyOptinCriticalToDamageConfig(getConfigAC5E, dialog.config);
		const nextDamageTypesByIndex = [...effectiveDamageTypesByIndex];
		if (Number.isInteger(compared?.index) && compared?.selectedValue) nextDamageTypesByIndex[compared.index] = compared.selectedValue;
		getConfigAC5E.options.selectedDamageTypes = effectiveSelects;
		getConfigAC5E.options.selectedDamageTypesByIndex = nextDamageTypesByIndex;
		applyOrResetFormulaChanges(elem, getConfigAC5E, 'apply', baseFormulas, nextDamageTypesByIndex);
		syncDamageRollTypeOverrideOptions(getConfigAC5E, dialog?.config?.rolls);
		syncCriticalStaticBonusDamageRollOptions(getConfigAC5E, dialog?.config?.rolls);
		if (ac5e?.debug?.damageTypeOverride) {
			const activeTypeOverrideEntries = getCollectedDamageEntries(getConfigAC5E, 'typeOverride', { raw: true }).filter(
				(entry) => !(entry?.optin || entry?.forceOptin) || currentOptinSelections?.[entry?.id],
			);
			console.warn(
				`AC5E damage.typeOverride rebuild\n${JSON.stringify(
					{
						currentOptinSelections,
						effectiveDamageTypesByIndex,
						nextDamageTypesByIndex,
						activeTypeOverrideEntries: activeTypeOverrideEntries.map((entry) => ({
							id: entry?.id ?? null,
							label: entry?.label ?? entry?.name ?? null,
							set: entry?.set ?? null,
							addTo: entry?.addTo ?? null,
						})),
					},
					null,
					2,
				)}\n${stringifyDamageTypeDebugState(dialog?.config?.rolls, getConfigAC5E?.preservedInitialData)}`,
			);
		}
		dialog.rebuild();
		dialog.render();
	} finally {
		dialog._ac5eDamageRenderInProgress = false;
	}
}

export function handleDamageOptinSelectionsChanged(dialog, ac5eConfig) {
	if (ac5eConfig?.hookType !== 'damage') return false;
	dialog.rebuild();
	dialog.render();
	return true;
}

export function renderOptionalBonusesDamage(dialog, elem, ac5eConfig, deps) {
	const selectedTypes = getSelectedDamageTypesFromDialog(dialog, elem);
	const entries = [
		...getDamageEntriesByMode(ac5eConfig, selectedTypes, 'bonus'),
		...getDamageEntriesByMode(ac5eConfig, selectedTypes, 'extraDice'),
		...getDamageEntriesByMode(ac5eConfig, selectedTypes, 'typeOverride'),
		...getDamageEntriesByMode(ac5eConfig, selectedTypes, 'diceUpgrade'),
		...getDamageEntriesByMode(ac5eConfig, selectedTypes, 'diceDowngrade'),
		...getDamageNonBonusOptinEntries(ac5eConfig, selectedTypes),
	]
		.filter((entry) => Boolean(entry?.optin || entry?.forceOptin))
		.filter((entry, index, arr) => {
			const id = entry?.id;
			if (!id) return true;
			return arr.findIndex((candidate) => candidate?.id === id) === index;
		});
	if (ac5e?.debug?.auraCadenceOptins) {
		const auraEntries = entries.filter((entry) => entry?.isAura || String(entry?.id ?? '').includes(':aura:'));
		if (auraEntries.length) {
			console.warn('AC5E aura damage optins rendered', {
				selectedTypes,
				optinSelected: ac5eConfig?.optinSelected ?? {},
				entries: auraEntries.map((entry) => ({
					id: entry?.id,
					label: entry?.label ?? entry?.name,
					mode: entry?.mode,
					cadence: entry?.cadence,
					optin: entry?.optin,
					forceOptin: entry?.forceOptin,
					auraTokenUuid: entry?.auraTokenUuid,
					requiredDamageTypes: entry?.requiredDamageTypes,
				})),
			});
		}
	}
	deps.renderOptionalBonusesFieldset(dialog, elem, ac5eConfig, entries, deps);
}

function buildDamagePreservedInitialData(formulas) {
	return {
		formulas: [...formulas],
		modified: [...formulas],
		activeModifiers: formulas.map(() => ''),
		activeExtraDice: formulas.map(() => 0),
		activeCriticalStaticExtraDice: formulas.map(() => 0),
		activeCriticalStaticExtraDiceMultipliers: formulas.map(() => 1),
		activeExtraDiceMultipliers: formulas.map(() => 1),
		activeDiceSteps: formulas.map(() => 0),
		activeFormulaOperators: formulas.map(() => []),
		activeOptinBonusParts: formulas.map(() => []),
		activeAppendedBonusRolls: [],
		activeCriticalBonusDamageByRoll: formulas.map(() => ''),
		baseCriticalBonusDamageByRoll: formulas.map(() => null),
		activeMaximize: formulas.map(() => false),
		activeMinimize: formulas.map(() => false),
		activeAdvDis: formulas.map(() => ''),
		baseDamageTypeByRoll: formulas.map(() => undefined),
		baseDamageTypesByRoll: formulas.map(() => []),
		activeDamageTypeByRoll: formulas.map(() => undefined),
		activeDamageTypesByRoll: formulas.map(() => []),
	};
}

function isSyntheticBonusRoll(roll) {
	return Boolean(roll?.options?.[Constants.MODULE_ID]?.syntheticBonusRoll);
}

function getNonSyntheticDamageRolls(rolls = []) {
	return (Array.isArray(rolls) ? rolls : []).filter((roll) => !isSyntheticBonusRoll(roll));
}

function normalizeDamageTypeList(types) {
	const source =
		types instanceof Set ? [...types]
		: Array.isArray(types) ? types
		: typeof types === 'string' ? types.split(',')
		: [];
	const normalized = [];
	for (const value of source) {
		const token = String(value ?? '').trim().toLowerCase();
		if (!token || normalized.includes(token)) continue;
		normalized.push(token);
	}
	return normalized;
}

function captureBaseDamageTypeData(ac5eConfig, rolls, baseline) {
	const preserved = ac5eConfig?.preservedInitialData;
	if (!preserved || !Array.isArray(rolls)) return;
	const baseRolls = getNonSyntheticDamageRolls(rolls);
	const baselineRolls = Array.isArray(baseline?.rolls) ? baseline.rolls : [];
	const baseTypesByRoll = Array.isArray(preserved.baseDamageTypesByRoll) ? [...preserved.baseDamageTypesByRoll] : [];
	const baseTypeByRoll = Array.isArray(preserved.baseDamageTypeByRoll) ? [...preserved.baseDamageTypeByRoll] : [];
	const activeTypesByRoll = Array.isArray(preserved.activeDamageTypesByRoll) ? [...preserved.activeDamageTypesByRoll] : [];
	const activeTypeByRoll = Array.isArray(preserved.activeDamageTypeByRoll) ? [...preserved.activeDamageTypeByRoll] : [];
	for (let index = 0; index < baseRolls.length; index++) {
		const roll = baseRolls[index];
		const baselineRoll = baselineRolls[index];
		const baselineTypes = normalizeDamageTypeList(baselineRoll?.types);
		const liveTypes = normalizeDamageTypeList(roll?.options?.types);
		const normalizedTypes = baselineTypes.length ? baselineTypes : liveTypes;
		const normalizedType =
			typeof baselineRoll?.type === 'string' && baselineRoll.type.trim() ? String(baselineRoll.type).trim().toLowerCase()
			: typeof roll?.options?.type === 'string' && roll.options.type.trim() ? String(roll.options.type).trim().toLowerCase()
			: normalizedTypes[0];
		if (!baseTypesByRoll[index]?.length) baseTypesByRoll[index] = normalizedTypes;
		if (baseTypeByRoll[index] === undefined) baseTypeByRoll[index] = normalizedType;
		if (!activeTypesByRoll[index]?.length && baseTypesByRoll[index]?.length) activeTypesByRoll[index] = [...baseTypesByRoll[index]];
		if (activeTypeByRoll[index] === undefined && baseTypeByRoll[index] !== undefined) activeTypeByRoll[index] = baseTypeByRoll[index];
	}
	if (baseTypesByRoll.length > baseRolls.length) baseTypesByRoll.length = baseRolls.length;
	if (baseTypeByRoll.length > baseRolls.length) baseTypeByRoll.length = baseRolls.length;
	if (activeTypesByRoll.length > baseRolls.length) activeTypesByRoll.length = baseRolls.length;
	if (activeTypeByRoll.length > baseRolls.length) activeTypeByRoll.length = baseRolls.length;
	preserved.baseDamageTypesByRoll = baseTypesByRoll;
	preserved.baseDamageTypeByRoll = baseTypeByRoll;
	preserved.activeDamageTypesByRoll = activeTypesByRoll;
	preserved.activeDamageTypeByRoll = activeTypeByRoll;
}

function syncDamageRollTypeOverrideOptions(ac5eConfig, rolls) {
	if (!ac5eConfig?.preservedInitialData || !Array.isArray(rolls)) return;
	captureBaseDamageTypeData(ac5eConfig, rolls, ac5eConfig?.preAC5eConfig?.frozenDamageBaseline ?? ac5eConfig?.frozenDamageBaseline);
	const preserved = ac5eConfig.preservedInitialData;
	const baseRolls = getNonSyntheticDamageRolls(rolls);
	const activeTypesByRoll = Array.isArray(preserved.activeDamageTypesByRoll) ? preserved.activeDamageTypesByRoll : [];
	const activeTypeByRoll = Array.isArray(preserved.activeDamageTypeByRoll) ? preserved.activeDamageTypeByRoll : [];
	const baseTypesByRoll = Array.isArray(preserved.baseDamageTypesByRoll) ? preserved.baseDamageTypesByRoll : [];
	const baseTypeByRoll = Array.isArray(preserved.baseDamageTypeByRoll) ? preserved.baseDamageTypeByRoll : [];
	for (let index = 0; index < baseRolls.length; index++) {
		const roll = baseRolls[index];
		if (!roll || typeof roll !== 'object') continue;
		roll.options ??= {};
		const resolvedTypes = normalizeDamageTypeList(activeTypesByRoll[index]).length ? normalizeDamageTypeList(activeTypesByRoll[index]) : normalizeDamageTypeList(baseTypesByRoll[index]);
		const resolvedType =
			typeof activeTypeByRoll[index] === 'string' && activeTypeByRoll[index].trim() ? String(activeTypeByRoll[index]).trim().toLowerCase()
			: typeof baseTypeByRoll[index] === 'string' && baseTypeByRoll[index].trim() ? String(baseTypeByRoll[index]).trim().toLowerCase()
			: resolvedTypes[0];
		if (resolvedTypes.length) roll.options.types = [...resolvedTypes];
		else if (Object.hasOwn(roll.options, 'types')) delete roll.options.types;
		if (resolvedType) roll.options.type = resolvedType;
		else if (Object.hasOwn(roll.options, 'type')) delete roll.options.type;
	}
}

function parseDamageTypeOverrideSet(value) {
	const knownDamageTypes = new Set(Object.keys(CONFIG?.DND5E?.damageTypes ?? {}).map((key) => String(key).toLowerCase()));
	return String(value ?? '')
		.split(',')
		.map((part) => String(part ?? '').trim().toLowerCase())
		.filter((part) => part && knownDamageTypes.has(part))
		.filter((part, index, arr) => arr.indexOf(part) === index);
}

function stringifyDamageTypeDebugState(rolls = [], preserved = {}) {
	return JSON.stringify(
		{
			rolls: getNonSyntheticDamageRolls(rolls).map((roll, index) => ({
				index,
				type: roll?.options?.type ?? null,
				types:
					roll?.options?.types instanceof Set ? [...roll.options.types]
					: Array.isArray(roll?.options?.types) ? [...roll.options.types]
					: [],
			})),
			baseDamageTypeByRoll: Array.isArray(preserved?.baseDamageTypeByRoll) ? [...preserved.baseDamageTypeByRoll] : [],
			baseDamageTypesByRoll: Array.isArray(preserved?.baseDamageTypesByRoll) ? preserved.baseDamageTypesByRoll.map((types) => normalizeDamageTypeList(types)) : [],
			activeDamageTypeByRoll: Array.isArray(preserved?.activeDamageTypeByRoll) ? [...preserved.activeDamageTypeByRoll] : [],
			activeDamageTypesByRoll: Array.isArray(preserved?.activeDamageTypesByRoll) ? preserved.activeDamageTypesByRoll.map((types) => normalizeDamageTypeList(types)) : [],
		},
		null,
		2,
	);
}

function snapshotDamageBaselineState(ac5eConfig) {
	return {
		frozenDamageBaseline:
			ac5eConfig?.preAC5eConfig?.frozenDamageBaseline ? foundry.utils.duplicate(ac5eConfig.preAC5eConfig.frozenDamageBaseline)
			: ac5eConfig?.frozenDamageBaseline ? foundry.utils.duplicate(ac5eConfig.frozenDamageBaseline)
			: undefined,
		frozenDamageBaselineByProfile:
			ac5eConfig?.preAC5eConfig?.frozenDamageBaselineByProfile ? foundry.utils.duplicate(ac5eConfig.preAC5eConfig.frozenDamageBaselineByProfile) : undefined,
		activeDamageRollProfileKey: ac5eConfig?.preAC5eConfig?.activeDamageRollProfileKey,
		preservedInitialData: ac5eConfig?.preservedInitialData ? foundry.utils.duplicate(ac5eConfig.preservedInitialData) : undefined,
		preservedInitialDataProfileKey: ac5eConfig?._preservedInitialDataProfileKey,
	};
}

function restoreDamageBaselineState(ac5eConfig, snapshot) {
	if (!ac5eConfig || !snapshot) return;
	ac5eConfig.preAC5eConfig ??= {};
	if (snapshot.frozenDamageBaselineByProfile) ac5eConfig.preAC5eConfig.frozenDamageBaselineByProfile = foundry.utils.duplicate(snapshot.frozenDamageBaselineByProfile);
	if (snapshot.activeDamageRollProfileKey !== undefined) ac5eConfig.preAC5eConfig.activeDamageRollProfileKey = snapshot.activeDamageRollProfileKey;
	if (snapshot.frozenDamageBaseline) {
		ac5eConfig.preAC5eConfig.frozenDamageBaseline = foundry.utils.duplicate(snapshot.frozenDamageBaseline);
		ac5eConfig.frozenDamageBaseline = foundry.utils.duplicate(snapshot.frozenDamageBaseline);
	}
	if (snapshot.preservedInitialData) ac5eConfig.preservedInitialData = foundry.utils.duplicate(snapshot.preservedInitialData);
	if (snapshot.preservedInitialDataProfileKey !== undefined) ac5eConfig._preservedInitialDataProfileKey = snapshot.preservedInitialDataProfileKey;
}

function getDamageBaselineFormulas(baseline) {
	const rolls = Array.isArray(baseline?.rolls) ? baseline.rolls : [];
	return rolls
		.map((roll) =>
			typeof roll?.formula === 'string' ? roll.formula
			: Array.isArray(roll?.parts) && roll.parts.length ? roll.parts.join(' + ')
			: undefined,
		)
		.filter((formula) => typeof formula === 'string' && formula.trim().length);
}

function getDamageFormulasFromRolls(rolls = []) {
	return getNonSyntheticDamageRolls(rolls)
		.map((roll) =>
			typeof roll?.formula === 'string' ? roll.formula
			: Array.isArray(roll?.parts) && roll.parts.length ? roll.parts.join(' + ')
			: undefined,
		)
		.filter((formula) => typeof formula === 'string' && formula.trim().length);
}

export function ensureDamagePreservedInitialData(ac5eConfig, baseline, currentRolls = [], isCritical = false) {
	if (!ac5eConfig) return;
	const baselineFormulas = isCritical ? getDamageFormulasFromRolls(currentRolls) : getDamageBaselineFormulas(baseline);
	if (!baselineFormulas.length) return;
	const profileKey = `${baseline?.profileKey ?? '__default__'}:${isCritical ? 'critical' : 'normal'}`;
	const previousProfileKey = ac5eConfig._preservedInitialDataProfileKey ?? '__default__';
	const existingLength = Array.isArray(ac5eConfig?.preservedInitialData?.formulas) ? ac5eConfig.preservedInitialData.formulas.length : 0;
	if (ac5eConfig.preservedInitialData && previousProfileKey === profileKey && existingLength >= baselineFormulas.length) return;
	ac5eConfig.preservedInitialData = buildDamagePreservedInitialData(baselineFormulas);
	ac5eConfig._preservedInitialDataProfileKey = profileKey;
}

export function applyOptinCriticalToDamageConfig(ac5eConfig, config, formData) {
	if (!ac5eConfig || !config) return;
	ac5eConfig.preAC5eConfig ??= {};
	const optionBaseCritical = config?.options?.[Constants.MODULE_ID]?.baseCritical ?? config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.baseCritical;
	const selectedIds = new Set(Object.keys(ac5eConfig.optinSelected ?? {}).filter((key) => ac5eConfig.optinSelected[key]));
	const allCriticalEntries = (ac5eConfig.subject?.critical ?? [])
		.concat(ac5eConfig.opponent?.critical ?? [])
		.filter((entry) => entry && typeof entry === 'object')
		.filter((entry) => !entry.optin || selectedIds.has(entry.id));
	const globalCriticalEntries = allCriticalEntries.filter((entry) => resolveEntryAddTo(entry, 'global').mode !== 'types');
	const localizedCriticalEntries = allCriticalEntries.filter((entry) => resolveEntryAddTo(entry, 'global').mode === 'types');
	const hasGlobalCritical = globalCriticalEntries.length > 0;
	const wasOptinForced = !!ac5eConfig.optinForcedCritical;
	const currentCritical = config.isCritical ?? config.midiOptions?.isCritical ?? false;
	if (!hasGlobalCritical && !wasOptinForced) {
		ac5eConfig.optinBaseCritical = currentCritical;
	}
	const baseCritical = ac5eConfig.optinBaseCritical ?? optionBaseCritical ?? ac5eConfig.preAC5eConfig?.baseCritical ?? ac5eConfig.preAC5eConfig?.wasCritical ?? currentCritical ?? false;
	if (ac5eConfig.preAC5eConfig?.baseCritical === undefined) {
		ac5eConfig.preAC5eConfig.baseCritical = baseCritical;
	}
	if (optionBaseCritical === undefined) {
		const options = config?.options;
		if (options && Object.isExtensible(options)) {
			options[Constants.MODULE_ID] ??= {};
			options[Constants.MODULE_ID].baseCritical = baseCritical;
		}
		const roll0Options = config?.rolls?.[0]?.options;
		if (roll0Options && Object.isExtensible(roll0Options)) {
			roll0Options[Constants.MODULE_ID] ??= {};
			roll0Options[Constants.MODULE_ID].baseCritical = baseCritical;
		}
	}

	if (hasGlobalCritical) {
		if (!wasOptinForced && ac5eConfig.optinBaseCritical === undefined) {
			ac5eConfig.optinBaseCritical = baseCritical;
		}
		ac5eConfig.optinForcedCritical = true;
		ac5eConfig.isCritical = true;
		config.isCritical = true;
		if (config.midiOptions) config.midiOptions.isCritical = true;
	} else {
		ac5eConfig.isCritical = baseCritical;
		config.isCritical = baseCritical;
		if (config.midiOptions) config.midiOptions.isCritical = baseCritical;
		ac5eConfig.optinForcedCritical = false;
	}
	if (ac5eConfig.isCritical === undefined && config.isCritical !== undefined) {
		ac5eConfig.isCritical = config.isCritical;
	}

	if (Array.isArray(config.rolls)) {
		const rollCriticalByIndex = [];
		const allTypes = new Set(
			config.rolls
				.map((roll, index) => {
					const rollType =
						typeof roll?.options?.type === 'string' && roll.options.type.trim() ?
							String(roll.options.type).toLowerCase()
						:	(getRollDamageTypeFromForm(formData, config, index) ?? getDamageRollTypeAtIndex(ac5eConfig, undefined, index));
					return typeof rollType === 'string' && rollType.trim().length ? rollType : null;
				})
				.filter(Boolean),
		);
		for (let i = 0; i < config.rolls.length; i++) {
			const roll = config.rolls[i];
			if (!roll?.options) continue;
			const rollType =
				typeof roll?.options?.type === 'string' && roll.options.type.trim() ?
					String(roll.options.type).toLowerCase()
				:	(getRollDamageTypeFromForm(formData, config, i) ?? getDamageRollTypeAtIndex(ac5eConfig, undefined, i));
			const localizedCritical = localizedCriticalEntries.some((entry) => shouldApplyCriticalToRoll(entry, i, rollType, allTypes));
			const effectiveRollCritical = config.isCritical || localizedCritical;
			roll.options.isCritical = effectiveRollCritical;
			rollCriticalByIndex[i] = effectiveRollCritical;
		}
		ac5eConfig.damageRollCriticalByIndex = rollCriticalByIndex;
	}
}

export function getSelectedDamageTypesFromDialog(dialog, elem) {
	const types = new Set();
	const selects = elem?.querySelectorAll?.('select[name^="roll."][name$=".damageType"]') ?? [];
	selects.forEach((select, index) => {
		const value = select?.value ?? dialog?.config?.rolls?.[index]?.options?.type;
		if (value) types.add(String(value).toLowerCase());
	});
	if (dialog?.config?.rolls?.length) {
		for (const roll of dialog.config.rolls) {
			if (isSyntheticBonusRoll(roll)) continue;
			if (roll?.options?.type) types.add(String(roll.options.type).toLowerCase());
		}
	}
	return types;
}

export function getDamageTypesByIndex(dialog, elem) {
	const types = [];
	const selects = elem?.querySelectorAll?.('select[name^="roll."][name$=".damageType"]') ?? [];
	selects.forEach((select) => {
		const name = select?.getAttribute?.('name') ?? '';
		const match = name.match(/roll\.(\d+)\.damageType/);
		const index = match ? Number(match[1]) : undefined;
		if (Number.isInteger(index)) types[index] = select?.value ?? dialog?.config?.rolls?.[index]?.options?.type;
	});
	if (dialog?.config?.rolls?.length) {
		dialog.config.rolls.forEach((roll, index) => {
			if (types[index] === undefined && roll?.options?.type) types[index] = roll.options.type;
		});
	}
	return types;
}

export function getRollDamageTypeFromForm(formData, rollConfig, index) {
	const directKey = `roll.${index}.damageType`;
	const directValue = formData?.[directKey];
	if (typeof directValue === 'string' && directValue.trim()) return String(directValue).toLowerCase();
	const nestedValue = formData?.roll?.[index]?.damageType;
	if (typeof nestedValue === 'string' && nestedValue.trim()) return String(nestedValue).toLowerCase();
	const configValue = rollConfig?.rolls?.[index]?.options?.type;
	if (typeof configValue === 'string' && configValue.trim()) return String(configValue).toLowerCase();
	return undefined;
}

export function getDamageRollTypeAtIndex(ac5eConfig, damageTypesByIndex, index) {
	const directType = damageTypesByIndex?.[index];
	if (typeof directType === 'string' && directType.trim()) return String(directType).toLowerCase();
	const selectedByIndex = ac5eConfig?.options?.selectedDamageTypesByIndex?.[index];
	if (typeof selectedByIndex === 'string' && selectedByIndex.trim()) return String(selectedByIndex).toLowerCase();
	const selectedType = ac5eConfig?.options?.selectedDamageTypes?.[index];
	if (typeof selectedType === 'string' && selectedType.trim()) return String(selectedType).toLowerCase();
	return undefined;
}

export function resolveEntryAddTo(entry, defaultMode = 'base') {
	if (entry?.addTo?.mode === 'all') return { mode: 'all', types: [] };
	if (entry?.addTo?.mode === 'base') return { mode: 'base', types: [] };
	if (entry?.addTo?.mode === 'global') return { mode: 'global', types: [] };
	if (entry?.addTo?.mode === 'types' && Array.isArray(entry.addTo.types) && entry.addTo.types.length) return { mode: 'types', types: entry.addTo.types.map((t) => String(t).toLowerCase()) };
	return { mode: defaultMode, types: [] };
}

function hasRequiredDamageTypes(entry, selectedTypes) {
	if (!Array.isArray(entry?.requiredDamageTypes) || !entry.requiredDamageTypes.length) return true;
	if (!selectedTypes?.size) return false;
	return entry.requiredDamageTypes.every((t) => selectedTypes.has(String(t).toLowerCase()));
}

function shouldApplyAddToRoll(addTo, rollIndex, rollType, defaultMode = 'base') {
	if (addTo.mode === 'all') return true;
	if (addTo.mode === defaultMode) return rollIndex === 0;
	if (!rollType) return false;
	return addTo.types.some((t) => t === String(rollType).toLowerCase());
}

function isDamageEntryEligibleForSelectedTypes(entry, selectedTypes) {
	if (!hasRequiredDamageTypes(entry, selectedTypes)) return false;
	const addTo = resolveEntryAddTo(entry);
	if (addTo.mode !== 'types') return true;
	if (!selectedTypes?.size) return false;
	return addTo.types.some((type) => selectedTypes.has(String(type).toLowerCase()));
}

function shouldApplyDamageEntryToRoll(entry, rollIndex, rollType, { defaultMode = 'base', selectedTypes = undefined } = {}) {
	if (selectedTypes && !hasRequiredDamageTypes(entry, selectedTypes)) return false;
	const addTo = resolveEntryAddTo(entry, defaultMode);
	return shouldApplyAddToRoll(addTo, rollIndex, rollType, defaultMode);
}

function hasExplicitAddTo(entry) {
	return entry?.addTo !== undefined && entry?.addTo !== null;
}

export function shouldApplyCriticalToRoll(entry, rollIndex, rollType, selectedTypes) {
	return shouldApplyDamageEntryToRoll(entry, rollIndex, rollType, { defaultMode: 'global', selectedTypes });
}

function isCriticalStaticExtraDiceEntry(entry) {
	return Boolean(entry?.criticalStatic);
}

function isCriticalStaticBonusEntry(entry) {
	return entry?.mode === 'bonus' && Boolean(entry?.criticalStatic);
}

function isRollCriticalForExtraDice(ac5eConfig, rollIndex) {
	const byRoll = Array.isArray(ac5eConfig?.damageRollCriticalByIndex) ? ac5eConfig.damageRollCriticalByIndex : [];
	if (typeof byRoll?.[rollIndex] === 'boolean') return byRoll[rollIndex];
	return Boolean(ac5eConfig?.isCritical ?? ac5eConfig?.preAC5eConfig?.wasCritical ?? false);
}

function isFormulaOperatorDamageModifier(value) {
	return typeof value === 'string' && /^[*/]/.test(value.trim());
}

function isDiceTermSuffixDamageModifier(value) {
	if (typeof value !== 'string') return false;
	const normalized = value.trim().replace(/\s+/g, '');
	if (!normalized || /^(?:max|min|maximize|minimize)$/i.test(normalized)) return false;
	if (globalThis.dnd5e?.utils?.isValidDieModifier?.(normalized)) return true;
	return /^(?:min|max)\s*-?\d+$/i.test(normalized);
}

function normalizeDiceTermModifier(value) {
	if (!isDiceTermSuffixDamageModifier(value)) return '';
	return value.trim().replace(/\s+/g, '');
}

function getDamageRollOptionModifierState(values = []) {
	const normalized = values
		.filter((value) => typeof value === 'string')
		.map((value) => value.trim().toLowerCase().replace(/\s+/g, ''));
	return {
		maximize: normalized.includes('max') || normalized.includes('maximize'),
		minimize: normalized.includes('min') || normalized.includes('minimize'),
	};
}

function getDamageExtremeDieModifier(rollOptionModifierState, sides) {
	if (!rollOptionModifierState || !Number.isFinite(Number(sides))) return '';
	if (rollOptionModifierState.maximize) return `min${Number(sides)}`;
	if (rollOptionModifierState.minimize) return 'max1';
	return '';
}

function getDamageAdvantageModifierToken(hasAdvantage, hasDisadvantage) {
	if (hasAdvantage && hasDisadvantage) return '';
	if (hasAdvantage) return 'adv';
	if (hasDisadvantage) return 'dis';
	return '';
}

function stripDamageAdvantageModifierTokens(modifiers = '') {
	if (typeof modifiers !== 'string' || !modifiers.length) return '';
	return modifiers.replace(/(?:adv\d*|dis\d*)/gi, '');
}

function syncDamageRollModifierOptions(ac5eConfig, rolls) {
	if (!Array.isArray(rolls)) return;
	const preserved = ac5eConfig?.preservedInitialData ?? {};
	const maximizeByRoll = Array.isArray(preserved.activeMaximize) ? preserved.activeMaximize : Array.isArray(rolls) ? rolls.map(() => !!preserved.activeMaximize) : [];
	const minimizeByRoll = Array.isArray(preserved.activeMinimize) ? preserved.activeMinimize : Array.isArray(rolls) ? rolls.map(() => !!preserved.activeMinimize) : [];
	for (let index = 0; index < rolls.length; index++) {
		const roll = rolls[index];
		if (!roll || typeof roll !== 'object') continue;
		roll.options ??= {};
		if (maximizeByRoll[index]) roll.options.maximize = true;
		else if ('maximize' in roll.options) delete roll.options.maximize;
		if (minimizeByRoll[index]) roll.options.minimize = true;
		else if ('minimize' in roll.options) delete roll.options.minimize;
	}
}

function normalizeFormulaOperatorDamageModifier(value) {
	if (typeof value !== 'string') return '';
	const match = value.trim().match(/^([*/])\s*(.+)$/);
	if (!match) return '';
	const operator = match[1];
	const operand = match[2]?.trim();
	if (!operand) return '';
	return `${operator} ${operand}`;
}

function parseFormulaOperatorToken(token) {
	if (typeof token !== 'string') return null;
	const match = token.trim().match(/^([*/])\s*(.+)$/);
	if (!match) return null;
	const operator = match[1];
	const operand = match[2]?.trim();
	if (!operand) return null;
	if (/^\d+(?:\.\d+)?(?:min|max)\d+/i.test(operand.replace(/\s+/g, ''))) return null;
	return { operator, operand };
}

function isUnaryTopLevelSign(formula, index) {
	for (let i = index - 1; i >= 0; i--) {
		const ch = formula[i];
		if (/\s/.test(ch)) continue;
		return ['+', '-', '*', '/', '^', '(', '{', '[', ','].includes(ch);
	}
	return true;
}

function splitTopLevelSignedTerms(formula) {
	const terms = [];
	let current = '';
	let currentSign = '';
	let parenDepth = 0;
	let braceDepth = 0;
	let bracketDepth = 0;
	for (let i = 0; i < formula.length; i++) {
		const ch = formula[i];
		if (ch === '(') parenDepth++;
		else if (ch === ')' && parenDepth > 0) parenDepth--;
		else if (ch === '{') braceDepth++;
		else if (ch === '}' && braceDepth > 0) braceDepth--;
		else if (ch === '[') bracketDepth++;
		else if (ch === ']' && bracketDepth > 0) bracketDepth--;
		if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0 && (ch === '+' || ch === '-')) {
			if (isUnaryTopLevelSign(formula, i)) {
				current += ch;
				continue;
			}
			terms.push({ sign: currentSign, expression: current });
			currentSign = ch;
			current = '';
			continue;
		}
		current += ch;
	}
	terms.push({ sign: currentSign, expression: current });
	return terms;
}

function applyFormulaOperatorToAllTerms(formula, token) {
	if (typeof formula !== 'string') return formula;
	const parsed = parseFormulaOperatorToken(token);
	if (!parsed) return formula;
	const transformed = splitTopLevelSignedTerms(formula)
		.map((term, index) => {
			const rawExpression = String(term.expression ?? '').trim();
			if (!rawExpression) return '';
			const nextExpression = `${rawExpression} ${parsed.operator} ${parsed.operand}`;
			if (index === 0) return term.sign === '-' ? `- ${nextExpression}` : nextExpression;
			return `${term.sign} ${nextExpression}`;
		})
		.filter(Boolean)
		.join(' ');
	return transformed || formula;
}

function getDamageFormulaReplacementData(ac5eConfig) {
	const subjectToken = canvas?.tokens?.get(ac5eConfig?.tokenId);
	return _buildRollEvaluationData({
		subjectToken,
		options: ac5eConfig?.options,
	})?.formulaData;
}

function resolveDamageFormulaDataReferences(formula, replacementData) {
	if (typeof formula !== 'string' || !formula.includes('@')) return formula;
	if (!replacementData || typeof Roll?.replaceFormulaData !== 'function') return formula;
	const resolved = Roll.replaceFormulaData(formula, replacementData, { warn: false });
	if (typeof resolved !== 'string' || /[^\x20-\x7E]/.test(resolved)) return formula;
	return resolved;
}

function normalizeDamageModifierEntries(ac5eConfig) {
	const rawEntries = Array.isArray(ac5eConfig?.damageModifiers) ? ac5eConfig.damageModifiers : [];
	const selectedIds = new Set(Object.keys(ac5eConfig?.optinSelected ?? {}).filter((key) => ac5eConfig.optinSelected[key]));
	return rawEntries
		.map((entry) => {
			if (typeof entry === 'string') return { id: undefined, value: entry, optin: false, forceOptin: false, addTo: undefined, requiredDamageTypes: [] };
			if (!entry || typeof entry !== 'object') return null;
			const value =
				typeof entry.value === 'string' ? entry.value
				: typeof entry.modifier === 'string' ? entry.modifier
				: undefined;
			if (!value) return null;
			return {
				id: entry.id,
				value,
				optin: !!entry.optin,
				forceOptin: !!entry.forceOptin,
				addTo: entry.addTo,
				requiredDamageTypes: Array.isArray(entry.requiredDamageTypes) ? entry.requiredDamageTypes : [],
			};
		})
		.filter((entry) => entry && (!(entry.optin || entry.forceOptin) || entry.forceOptin || selectedIds.has(entry.id)));
}

function areStringArraysEqual(a = [], b = []) {
	if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

function areStringMatrixEqual(a = [], b = []) {
	if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (!areStringArraysEqual(a[i] ?? [], b[i] ?? [])) return false;
	return true;
}

export function getDamageBonusEntries(ac5eConfig, selectedTypes) {
	return getCollectedDamageEntries(ac5eConfig, 'bonus', { selectedTypes });
}

export function getDamageEntriesByMode(ac5eConfig, selectedTypes, mode) {
	return getCollectedDamageEntries(ac5eConfig, mode, { selectedTypes });
}

function getCollectedDamageEntries(ac5eConfig, mode, { selectedTypes = undefined, optinOnly = false, raw = false } = {}) {
	const subjectEntries = Array.isArray(ac5eConfig?.subject?.[mode]) ? ac5eConfig.subject[mode] : [];
	const opponentEntries = Array.isArray(ac5eConfig?.opponent?.[mode]) ? ac5eConfig.opponent[mode] : [];
	const entries = subjectEntries.concat(opponentEntries).filter((entry) => {
		if (!entry || typeof entry !== 'object' || (entry.hook && entry.hook !== 'damage')) return false;
		if (optinOnly && !entry.optin) return false;
		return raw || entry.mode === mode;
	});
	if (raw || !selectedTypes) return entries;
	return entries.filter((entry) => isDamageEntryEligibleForSelectedTypes(entry, selectedTypes));
}

export function getDamageNonBonusOptinEntries(ac5eConfig, selectedTypes) {
	const modes = ['advantage', 'disadvantage', 'modifiers', 'noAdvantage', 'noDisadvantage', 'critical', 'noCritical', 'fail', 'fumble', 'success', 'info'];
	return modes.flatMap((mode) => getCollectedDamageEntries(ac5eConfig, mode, { optinOnly: true })).filter((entry) => isDamageEntryEligibleForSelectedTypes(entry, selectedTypes));
}

function getOptinExtraDiceAdjustments(ac5eConfig, selectedTypes, optins, rollIndex, rollType, isCriticalRoll) {
	const entries = getDamageEntriesByMode(ac5eConfig, selectedTypes, 'extraDice').filter(
		(entry) => Boolean(entry?.optin || entry?.forceOptin) && shouldApplyDamageEntryToRoll(entry, rollIndex, rollType),
	);
	if (!entries.length) return { additive: 0, multiplier: 1, criticalStaticAdditive: 0, criticalStaticMultiplier: 1 };
	const selectedIds = new Set(Object.keys(optins ?? {}).filter((key) => optins[key]));
	let additive = 0;
	let multiplier = 1;
	let criticalStaticAdditive = 0;
	let criticalStaticMultiplier = 1;
	for (const entry of entries) {
		if (!entry.forceOptin && !selectedIds.has(entry.id)) continue;
		if (ac5e?.debug?.damageExtraDice) {
			console.warn('AC5E extraDice optin', {
				label: entry?.label ?? entry?.name,
				id: entry?.id,
				requiredDamageTypes: entry?.requiredDamageTypes,
				addTo: resolveEntryAddTo(entry),
				rollIndex,
				rollType,
				selected: true,
			});
		}
		const criticalStatic = isCriticalStaticExtraDiceEntry(entry);
		const values = Array.isArray(entry.values) ? entry.values : [];
		for (const value of values) {
			const parsed = _parseExtraDiceValue(value);
			if (criticalStatic && isCriticalRoll) {
				criticalStaticAdditive += parsed.additive;
				criticalStaticMultiplier *= parsed.multiplier;
				continue;
			}
			additive += parsed.additive;
			multiplier *= parsed.multiplier;
		}
	}
	return { additive, multiplier, criticalStaticAdditive, criticalStaticMultiplier };
}

function _parseExtraDiceValue(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return { additive: 0, multiplier: 1 };
	const multiplierMatch = raw.match(/^\+?\s*(?:x|\^)\s*(-?\d+)\s*$/i);
	if (multiplierMatch) {
		const parsedMultiplier = Number(multiplierMatch[1]);
		if (!Number.isNaN(parsedMultiplier) && Number.isInteger(parsedMultiplier)) return { additive: 0, multiplier: parsedMultiplier };
		return { additive: 0, multiplier: 1 };
	}
	const parsedAdditive = Number(raw.replace('+', '').trim());
	if (Number.isNaN(parsedAdditive)) return { additive: 0, multiplier: 1 };
	return { additive: parsedAdditive, multiplier: 1 };
}

function normalizeCriticalBonusDamageFormula(value) {
	return typeof value === 'string' && value.trim().length ? value.trim() : '';
}

function extractImplicitBonusDamageType(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return { formula: '', type: undefined, types: [] };
	const knownDamageTypes = new Set(Object.keys(CONFIG?.DND5E?.damageTypes ?? {}).map((key) => String(key).toLowerCase()));
	const detectedTypes = [];
	const formula = raw.replace(/\[([^\]]+)\]/g, (match, inner) => {
		const normalizedTypes = String(inner ?? '')
			.split(',')
			.map((part) => String(part ?? '').trim().toLowerCase())
			.filter(Boolean)
			.filter((part) => knownDamageTypes.has(part));
		if (!normalizedTypes.length) return match;
		for (const normalized of normalizedTypes) {
			if (!detectedTypes.includes(normalized)) detectedTypes.push(normalized);
		}
		return '';
	});
	const detectedType = detectedTypes[0];
	return {
		formula: formula.replace(/\s{2,}/g, ' ').trim() || raw,
		type: detectedType,
		types: detectedTypes,
	};
}

function areBonusRollEntriesEqual(a, b) {
	const safeA = Array.isArray(a) ? a : [];
	const safeB = Array.isArray(b) ? b : [];
	if (safeA.length !== safeB.length) return false;
	for (let index = 0; index < safeA.length; index++) {
		const left = safeA[index] ?? {};
		const right = safeB[index] ?? {};
		if ((left.formula ?? '') !== (right.formula ?? '')) return false;
		if ((left.type ?? '') !== (right.type ?? '')) return false;
		const leftTypes = Array.isArray(left.types) ? left.types : [];
		const rightTypes = Array.isArray(right.types) ? right.types : [];
		if (leftTypes.length !== rightTypes.length) return false;
		for (let typeIndex = 0; typeIndex < leftTypes.length; typeIndex++) {
			if ((leftTypes[typeIndex] ?? '') !== (rightTypes[typeIndex] ?? '')) return false;
		}
	}
	return true;
}

function syncAppendedBonusRolls(dialog, ac5eConfig, formulas = []) {
	const rolls = Array.isArray(dialog?.config?.rolls) ? dialog.config.rolls : [];
	const preserved = ac5eConfig?.preservedInitialData ?? {};
	const appended = Array.isArray(preserved.activeAppendedBonusRolls) ? preserved.activeAppendedBonusRolls : [];
	const baseCount = formulas.length;
	const targetCount = baseCount + appended.length;
	if (rolls.length > targetCount) rolls.length = targetCount;
	for (let index = 0; index < baseCount; index++) {
		const roll = rolls[index];
		if (!roll || !formulas[index]) continue;
		roll.formula = formulas[index];
		roll.parts = formulas[index]
			.split('+')
			.map((part) => part.trim())
			.filter(Boolean);
	}
	for (let offset = 0; offset < appended.length; offset++) {
		const rollIndex = baseCount + offset;
		const bonusRoll = appended[offset] ?? {};
		const existingRoll = rolls[rollIndex];
		const roll = existingRoll && typeof existingRoll === 'object' ? existingRoll : {};
		roll.options = foundry.utils.duplicate(roll.options ?? {});
		roll.options[Constants.MODULE_ID] ??= {};
		roll.options[Constants.MODULE_ID].syntheticBonusRoll = true;
		delete roll.options.damageTypes;
		delete roll.options.defaultDamageType;
		delete roll.options.riderStatuses;
		roll.formula = bonusRoll.formula;
		roll.parts = String(bonusRoll.formula ?? '')
			.split('+')
			.map((part) => part.trim())
			.filter(Boolean);
		const validTypes = Array.isArray(bonusRoll.types) ? bonusRoll.types.filter(Boolean) : [];
		if (validTypes.length) roll.options.types = [...validTypes];
		else if (Object.hasOwn(roll.options, 'types')) delete roll.options.types;
		const existingSelectedType = typeof existingRoll?.options?.type === 'string' ? existingRoll.options.type : undefined;
		const resolvedSelectedType = validTypes.includes(existingSelectedType) ? existingSelectedType : bonusRoll.type;
		if (resolvedSelectedType) roll.options.type = resolvedSelectedType;
		else if (Object.hasOwn(roll.options, 'type')) delete roll.options.type;
		roll.options.isCritical = dialog?.config?.isCritical ?? ac5eConfig?.isCritical ?? false;
		if (roll.options.critical && typeof roll.options.critical === 'object' && Object.hasOwn(roll.options.critical, 'bonusDamage')) delete roll.options.critical.bonusDamage;
		rolls[rollIndex] = roll;
	}
}

export function captureBaseCriticalBonusDamage(ac5eConfig, rolls) {
	const preserved = ac5eConfig?.preservedInitialData;
	if (!preserved || !Array.isArray(rolls)) return;
	const baseByRoll = Array.isArray(preserved.baseCriticalBonusDamageByRoll) ? [...preserved.baseCriticalBonusDamageByRoll] : [];
	const baseRolls = getNonSyntheticDamageRolls(rolls);
	for (let index = 0; index < baseRolls.length; index++) {
		if (typeof baseByRoll[index] === 'string') continue;
		baseByRoll[index] = normalizeCriticalBonusDamageFormula(baseRolls[index]?.options?.critical?.bonusDamage);
	}
	if (baseByRoll.length > baseRolls.length) baseByRoll.length = baseRolls.length;
	preserved.baseCriticalBonusDamageByRoll = baseByRoll;
}

export function syncCriticalStaticBonusDamageRollOptions(ac5eConfig, rolls) {
	if (!ac5eConfig?.preservedInitialData || !Array.isArray(rolls)) return;
	captureBaseCriticalBonusDamage(ac5eConfig, rolls);
	const preserved = ac5eConfig.preservedInitialData;
	const baseByRoll = Array.isArray(preserved.baseCriticalBonusDamageByRoll) ? preserved.baseCriticalBonusDamageByRoll : [];
	const activeByRoll = Array.isArray(preserved.activeCriticalBonusDamageByRoll) ? preserved.activeCriticalBonusDamageByRoll : [];
	const activeAdvDisByRoll = Array.isArray(preserved.activeAdvDis) ? preserved.activeAdvDis : Array.isArray(rolls) ? rolls.map(() => preserved.activeAdvDis ?? '') : [];
	for (let index = 0; index < rolls.length; index++) {
		const roll = rolls[index];
		if (!roll || typeof roll !== 'object') continue;
		roll.options ??= {};
		const foldBaseCriticalIntoFormula = Boolean(activeAdvDisByRoll[index]);
		const baseBonus = foldBaseCriticalIntoFormula ? '' : normalizeCriticalBonusDamageFormula(baseByRoll[index]);
		const ac5eBonus = normalizeCriticalBonusDamageFormula(activeByRoll[index]);
		const combined = [baseBonus, ac5eBonus].filter(Boolean).join(' + ');
		if (combined) {
			roll.options.critical ??= {};
			roll.options.critical.bonusDamage = combined;
		} else if (roll.options.critical && typeof roll.options.critical === 'object' && Object.hasOwn(roll.options.critical, 'bonusDamage')) {
			delete roll.options.critical.bonusDamage;
		}
	}
}

function _getDamageDiceStepFromEntry(entry, value) {
	const parsed = Number(
		String(value ?? '')
			.replace('+', '')
			.trim(),
	);
	if (Number.isNaN(parsed)) return 0;
	if (entry?.mode === 'diceDowngrade') return parsed > 0 ? -parsed : parsed;
	return parsed;
}

function _getDamageDiceStepProgression() {
	const dice = CONFIG?.Dice?.fulfillment?.dice ?? {};
	const sizes = Object.keys(dice)
		.map((key) => key.match(/^d(\d+)$/i)?.[1])
		.filter(Boolean)
		.map((n) => Number(n))
		.filter((n) => Number.isInteger(n) && n > 0)
		.sort((a, b) => a - b);
	return sizes.length ? sizes : [4, 6, 8, 10, 12, 20, 100];
}

function _shiftDamageDieSize(sides, steps, progression) {
	const current = Number(sides);
	if (!Number.isInteger(current) || !Number.isFinite(steps) || steps === 0) return current;
	const index = progression.indexOf(current);
	if (index < 0) return current;
	const nextIndex = Math.max(0, Math.min(progression.length - 1, index + steps));
	return progression[nextIndex] ?? current;
}

export function applyOrResetFormulaChanges(elem, getConfigAC5E, mode = 'apply', baseFormulas, damageTypesByIndex = []) {
	const formulas =
		Array.isArray(baseFormulas) && baseFormulas.length ?
			baseFormulas
		:	Array.from(elem.querySelectorAll('.formula'))
				.map((el) => el.textContent?.trim())
				.filter(Boolean);
	const damageModifierEntries = normalizeDamageModifierEntries(getConfigAC5E);
	const formulaOperatorEntries = damageModifierEntries.filter((entry) => isFormulaOperatorDamageModifier(entry.value));
	const allTypes = new Set(damageTypesByIndex.filter(Boolean).map((type) => String(type).toLowerCase()));
	const selectedOptinIds = new Set(Object.keys(getConfigAC5E.optinSelected ?? {}).filter((key) => getConfigAC5E.optinSelected[key]));
	const isOptinEntrySelected = (entry) => Boolean(entry?.forceOptin || (entry?.id && selectedOptinIds.has(entry.id)));
	const damageBonusEntries = getCollectedDamageEntries(getConfigAC5E, 'bonus', { raw: true }).filter((entry) => !(entry?.optin || entry?.forceOptin) || isOptinEntrySelected(entry));
	const subjectAdvantage = _filterOptinEntries(getConfigAC5E.subject.advantage, getConfigAC5E.optinSelected);
	const opponentAdvantage = _filterOptinEntries(getConfigAC5E.opponent.advantage, getConfigAC5E.optinSelected);
	const subjectDisadvantage = _filterOptinEntries(getConfigAC5E.subject.disadvantage, getConfigAC5E.optinSelected);
	const opponentDisadvantage = _filterOptinEntries(getConfigAC5E.opponent.disadvantage, getConfigAC5E.optinSelected);
	const bonusPartsByRoll = formulas.map(() => []);
	const criticalBonusPartsByRoll = formulas.map(() => []);
	const existingRollIndexByType = new Map();
	formulas.forEach((_, index) => {
		const rollType = getDamageRollTypeAtIndex(getConfigAC5E, damageTypesByIndex, index);
		if (rollType && !existingRollIndexByType.has(rollType)) existingRollIndexByType.set(rollType, index);
	});
	const damageModifierValuesByRoll = formulas.map((_, index) => {
		const rollType = getDamageRollTypeAtIndex(getConfigAC5E, damageTypesByIndex, index);
		return damageModifierEntries
			.filter((entry) => shouldApplyDamageEntryToRoll(entry, index, rollType, { selectedTypes: allTypes }))
			.map((entry) => entry.value)
			.filter((value) => typeof value === 'string');
	});
	const rollOptionModifierStateByRoll = damageModifierValuesByRoll.map((values) => getDamageRollOptionModifierState(values));
	const suffixesByRoll = damageModifierValuesByRoll.map((values) =>
		values
			.filter((value) => isDiceTermSuffixDamageModifier(value))
			.map((value) => normalizeDiceTermModifier(value))
			.filter(Boolean)
			.join('')
	);
	const appendedBonusRollsByKey = new Map();
	const appendedCriticalBonusRollsByKey = new Map();
	const isCriticalDamageRollAtIndex = (index) => isRollCriticalForExtraDice(getConfigAC5E, index);
	const isGlobalCriticalDamage = formulas.some((_, index) => isCriticalDamageRollAtIndex(index)) || Boolean(getConfigAC5E?.isCritical ?? getConfigAC5E?.preAC5eConfig?.wasCritical ?? false);
	const getSyntheticBonusRollKey = (types = []) => {
		const normalizedTypes = types.map((type) => String(type ?? '').trim().toLowerCase()).filter(Boolean);
		if (!normalizedTypes.length) return '';
		return normalizedTypes.join('|');
	};
	const addSyntheticBonusRollPart = (types, part, criticalOnly = false) => {
		const normalizedTypes = types.map((type) => String(type ?? '').trim().toLowerCase()).filter(Boolean);
		if (!part || !normalizedTypes.length) return false;
		const key = getSyntheticBonusRollKey(normalizedTypes);
		if (!key) return false;
		const targetMap = criticalOnly ? appendedCriticalBonusRollsByKey : appendedBonusRollsByKey;
		const existing = targetMap.get(key) ?? {
			type: normalizedTypes[0],
			types: [...normalizedTypes],
			parts: [],
		};
		existing.parts.push(part);
		targetMap.set(key, existing);
		const discoveredNewType = normalizedTypes.some((type) => !allTypes.has(type));
		for (const type of normalizedTypes) allTypes.add(type);
		return discoveredNewType;
	};
	const applyBonusPartToType = (rollType, part, criticalOnly = false) => {
		if (!part || !rollType) return false;
		const normalizedType = String(rollType).toLowerCase();
		const targetIndex = existingRollIndexByType.get(normalizedType);
		if (Number.isInteger(targetIndex)) {
			if (criticalOnly) criticalBonusPartsByRoll[targetIndex].push(part);
			else bonusPartsByRoll[targetIndex].push(part);
			return false;
		}
		return addSyntheticBonusRollPart([normalizedType], part, criticalOnly);
	};
	const applyExplicitBonusEntry = (entry, values) => {
		let discoveredNewType = false;
		const addTo = resolveEntryAddTo(entry);
		const parts = values.map((value) => String(value ?? '').trim()).filter(Boolean);
		if (!parts.length) return discoveredNewType;
		if (addTo.mode === 'types') {
			for (const type of addTo.types) {
				const targetIndex = existingRollIndexByType.get(String(type).toLowerCase());
				const criticalOnly = isCriticalStaticBonusEntry(entry) && (Number.isInteger(targetIndex) ? isCriticalDamageRollAtIndex(targetIndex) : isGlobalCriticalDamage);
				for (const part of parts) discoveredNewType = applyBonusPartToType(type, part, criticalOnly) || discoveredNewType;
			}
			return discoveredNewType;
		}
		formulas.forEach((_, index) => {
			const rollType = getDamageRollTypeAtIndex(getConfigAC5E, damageTypesByIndex, index);
			if (!shouldApplyDamageEntryToRoll(entry, index, rollType, { selectedTypes: allTypes })) return;
			const criticalOnly = isCriticalStaticBonusEntry(entry) && isCriticalDamageRollAtIndex(index);
			for (const part of parts) {
				if (criticalOnly) criticalBonusPartsByRoll[index].push(part);
				else bonusPartsByRoll[index].push(part);
			}
		});
		if (addTo.mode === 'all') {
			const targetMap = isCriticalStaticBonusEntry(entry) && isGlobalCriticalDamage ? appendedCriticalBonusRollsByKey : appendedBonusRollsByKey;
			for (const key of new Set([...appendedBonusRollsByKey.keys(), ...appendedCriticalBonusRollsByKey.keys()])) {
				const existing = targetMap.get(key);
				if (!existing) continue;
				existing.parts.push(...parts);
				targetMap.set(key, existing);
			}
		}
		return discoveredNewType;
	};
	let pendingDamageBonusEntries = [...damageBonusEntries];
	let shouldRetryPendingBonusEntries = true;
	while (pendingDamageBonusEntries.length && shouldRetryPendingBonusEntries) {
		shouldRetryPendingBonusEntries = false;
		const nextPendingDamageBonusEntries = [];
		for (const entry of pendingDamageBonusEntries) {
			if (!isDamageEntryEligibleForSelectedTypes(entry, allTypes)) {
				nextPendingDamageBonusEntries.push(entry);
				continue;
			}
			const values = Array.isArray(entry.values) ? entry.values : [];
			if (hasExplicitAddTo(entry)) {
				const discoveredNewType = applyExplicitBonusEntry(entry, values);
				shouldRetryPendingBonusEntries ||= discoveredNewType;
				continue;
			}
			for (const value of values) {
				const { formula: part, type: inlineDamageType, types: inlineDamageTypes } = extractImplicitBonusDamageType(value);
				if (!part) continue;
				const criticalOnly = isCriticalStaticBonusEntry(entry) && isGlobalCriticalDamage;
				if (inlineDamageTypes.length > 1) {
					shouldRetryPendingBonusEntries = addSyntheticBonusRollPart(inlineDamageTypes, part, criticalOnly) || shouldRetryPendingBonusEntries;
					continue;
				}
				if (!inlineDamageType) {
					if (bonusPartsByRoll.length) {
						if (criticalOnly && isCriticalDamageRollAtIndex(0)) criticalBonusPartsByRoll[0].push(part);
						else bonusPartsByRoll[0].push(part);
					}
					continue;
				}
				shouldRetryPendingBonusEntries = applyBonusPartToType(inlineDamageType, part, criticalOnly) || shouldRetryPendingBonusEntries;
			}
		}
		pendingDamageBonusEntries = nextPendingDamageBonusEntries;
	}
	// Preserve identical bonus parts from distinct sources. Rerender stability is handled
	// by the preserved baseline/state machinery, so value-based dedupe would under-apply
	// cases like two separate +1 damage bonuses.
	const appendedBonusRollTypes = [...new Set([...appendedBonusRollsByKey.keys(), ...appendedCriticalBonusRollsByKey.keys()])];
	const appendedBonusRolls = appendedBonusRollTypes.map((key) => {
		const entry = appendedBonusRollsByKey.get(key) ?? appendedCriticalBonusRollsByKey.get(key) ?? { type: undefined, types: [], parts: [] };
		return {
			formula: entry.parts.length ? entry.parts.join(' + ') : '0',
			type: entry.type,
			types: Array.isArray(entry.types) ? [...entry.types] : [],
		};
	});
	const extraDiceAdjustments = formulas.map((_, index) => {
		const rollType = getDamageRollTypeAtIndex(getConfigAC5E, damageTypesByIndex, index);
		const isCriticalRoll = isRollCriticalForExtraDice(getConfigAC5E, index);
		const entries = getDamageEntriesByMode(getConfigAC5E, allTypes, 'extraDice');
		let baseAdditive = 0;
		let baseMultiplier = 1;
		let baseCriticalStaticAdditive = 0;
		let baseCriticalStaticMultiplier = 1;
		for (const entry of entries) {
			if (entry.optin) continue;
			const appliesToRoll = shouldApplyDamageEntryToRoll(entry, index, rollType);
			if (ac5e?.debug?.damageExtraDice)
				console.warn('AC5E extraDice base', {
					label: entry?.label ?? entry?.name,
					id: entry?.id,
					requiredDamageTypes: entry?.requiredDamageTypes,
					addTo: resolveEntryAddTo(entry),
					rollIndex: index,
					rollType,
					appliesToRoll,
				});
			if (!appliesToRoll) continue;
			const criticalStatic = isCriticalStaticExtraDiceEntry(entry);
			for (const value of Array.isArray(entry.values) ? entry.values : []) {
				const parsed = _parseExtraDiceValue(value);
				if (criticalStatic && isCriticalRoll) {
					baseCriticalStaticAdditive += parsed.additive;
					baseCriticalStaticMultiplier *= parsed.multiplier;
					continue;
				}
				baseAdditive += parsed.additive;
				baseMultiplier *= parsed.multiplier;
			}
		}
		const optinAdjustments = getOptinExtraDiceAdjustments(getConfigAC5E, allTypes, getConfigAC5E.optinSelected, index, rollType, isCriticalRoll);
		return {
			additive: baseAdditive + optinAdjustments.additive,
			multiplier: baseMultiplier * optinAdjustments.multiplier,
			criticalStaticAdditive: baseCriticalStaticAdditive + optinAdjustments.criticalStaticAdditive,
			criticalStaticMultiplier: baseCriticalStaticMultiplier * optinAdjustments.criticalStaticMultiplier,
		};
	});
	const diceStepTotals = formulas.map((_, index) => {
		const rollType = getDamageRollTypeAtIndex(getConfigAC5E, damageTypesByIndex, index);
		const entries = [...getDamageEntriesByMode(getConfigAC5E, allTypes, 'diceUpgrade'), ...getDamageEntriesByMode(getConfigAC5E, allTypes, 'diceDowngrade')];
		let total = 0;
		for (const entry of entries) {
			if ((entry.optin || entry.forceOptin) && !isOptinEntrySelected(entry)) continue;
			if (!shouldApplyDamageEntryToRoll(entry, index, rollType)) continue;
			for (const value of Array.isArray(entry.values) ? entry.values : []) total += _getDamageDiceStepFromEntry(entry, value);
		}
		return total;
	});
	const formulaOperatorTokensByRoll = formulas.map((_, index) => {
		const rollType = getDamageRollTypeAtIndex(getConfigAC5E, damageTypesByIndex, index);
		const tokens = [];
		for (const entry of formulaOperatorEntries) {
			if (!shouldApplyDamageEntryToRoll(entry, index, rollType, { selectedTypes: allTypes })) continue;
			const token = normalizeFormulaOperatorDamageModifier(entry.value);
			if (token) tokens.push(token);
		}
		return tokens;
	});
	const advDisByRoll = formulas.map((_, index) => {
		const rollType = getDamageRollTypeAtIndex(getConfigAC5E, damageTypesByIndex, index);
		const hasAdv =
			subjectAdvantage.some((entry) => shouldApplyDamageEntryToRoll(entry, index, rollType, { selectedTypes: allTypes })) ||
			opponentAdvantage.some((entry) => shouldApplyDamageEntryToRoll(entry, index, rollType, { selectedTypes: allTypes }));
		const hasDis =
			subjectDisadvantage.some((entry) => shouldApplyDamageEntryToRoll(entry, index, rollType, { selectedTypes: allTypes })) ||
			opponentDisadvantage.some((entry) => shouldApplyDamageEntryToRoll(entry, index, rollType, { selectedTypes: allTypes }));
		return getDamageAdvantageModifierToken(hasAdv, hasDis);
	});
	if (!getConfigAC5E.preservedInitialData) getConfigAC5E.preservedInitialData = buildDamagePreservedInitialData(formulas);
	const {
		formulas: originals,
		activeModifiers,
		activeExtraDice,
		activeCriticalStaticExtraDice,
		activeCriticalStaticExtraDiceMultipliers,
		activeExtraDiceMultipliers,
		activeDiceSteps,
		activeFormulaOperators,
		activeOptinBonusParts,
		activeAppendedBonusRolls,
		activeMaximize,
		activeMinimize,
		activeAdvDis,
		baseDamageTypeByRoll,
		baseDamageTypesByRoll,
		activeDamageTypeByRoll,
		activeDamageTypesByRoll,
	} = getConfigAC5E.preservedInitialData;
	const activeExtraDiceArray = Array.isArray(activeExtraDice) ? activeExtraDice : originals.map(() => activeExtraDice ?? 0);
	const activeCriticalStaticExtraDiceArray = Array.isArray(activeCriticalStaticExtraDice) ? activeCriticalStaticExtraDice : originals.map(() => activeCriticalStaticExtraDice ?? 0);
	const activeCriticalStaticExtraDiceMultiplierArray =
		Array.isArray(activeCriticalStaticExtraDiceMultipliers) ? activeCriticalStaticExtraDiceMultipliers : originals.map(() => activeCriticalStaticExtraDiceMultipliers ?? 1);
	const activeExtraDiceMultiplierArray = Array.isArray(activeExtraDiceMultipliers) ? activeExtraDiceMultipliers : originals.map(() => activeExtraDiceMultipliers ?? 1);
	const activeDiceStepsArray = Array.isArray(activeDiceSteps) ? activeDiceSteps : originals.map(() => activeDiceSteps ?? 0);
	const activeFormulaOperatorsArray = Array.isArray(activeFormulaOperators) ? activeFormulaOperators.map((ops) => (Array.isArray(ops) ? [...ops] : [])) : originals.map(() => []);
	const activeOptinBonusPartsArray = Array.isArray(activeOptinBonusParts) ? activeOptinBonusParts.map((parts) => (Array.isArray(parts) ? [...parts] : [])) : originals.map(() => []);
	const activeModifiersArray = Array.isArray(activeModifiers) ? activeModifiers : originals.map(() => activeModifiers ?? '');
	const activeMaximizeArray = Array.isArray(activeMaximize) ? activeMaximize.map((value) => !!value) : originals.map(() => !!activeMaximize);
	const activeMinimizeArray = Array.isArray(activeMinimize) ? activeMinimize.map((value) => !!value) : originals.map(() => !!activeMinimize);
	const activeAdvDisArray = Array.isArray(activeAdvDis) ? activeAdvDis : originals.map(() => activeAdvDis ?? '');
	const baseDamageTypeArray = Array.isArray(baseDamageTypeByRoll) ? baseDamageTypeByRoll : originals.map(() => undefined);
	const baseDamageTypesArray = Array.isArray(baseDamageTypesByRoll) ? baseDamageTypesByRoll.map((types) => normalizeDamageTypeList(types)) : originals.map(() => []);
	const activeDamageTypeArray = Array.isArray(activeDamageTypeByRoll) ? activeDamageTypeByRoll : originals.map(() => undefined);
	const activeDamageTypesArray = Array.isArray(activeDamageTypesByRoll) ? activeDamageTypesByRoll.map((types) => normalizeDamageTypeList(types)) : originals.map(() => []);
	const damageTypeOverrideEntries = getCollectedDamageEntries(getConfigAC5E, 'typeOverride', { raw: true }).filter((entry) => !(entry?.optin || entry?.forceOptin) || isOptinEntrySelected(entry));
	const effectiveDamageTypeStateByRoll = formulas.map((_, index) => {
		const rollType = getDamageRollTypeAtIndex(getConfigAC5E, damageTypesByIndex, index) ?? baseDamageTypeArray[index];
		const baselineTypes = normalizeDamageTypeList(baseDamageTypesArray[index]);
		const baselineType =
			typeof baseDamageTypeArray[index] === 'string' && baseDamageTypeArray[index].trim() ? String(baseDamageTypeArray[index]).trim().toLowerCase()
			: baselineTypes[0];
		let nextTypes = baselineTypes.length ? [...baselineTypes] : [];
		let nextType = baselineType;
		for (const entry of damageTypeOverrideEntries) {
			if (!shouldApplyDamageEntryToRoll(entry, index, rollType, { selectedTypes: allTypes })) continue;
			const overrideTypes = parseDamageTypeOverrideSet(entry?.set);
			if (!overrideTypes.length) continue;
			const currentSelectedType = getDamageRollTypeAtIndex(getConfigAC5E, damageTypesByIndex, index);
			nextTypes = [...overrideTypes];
			nextType = overrideTypes.includes(currentSelectedType) ? currentSelectedType : overrideTypes[0];
		}
		return { type: nextType, types: nextTypes };
	});
	const formulaReplacementData = getDamageFormulaReplacementData(getConfigAC5E);
	const diceRegex = /(\d+)d(\d+)([a-z0-9]*)?/gi;
	const diceProgression = _getDamageDiceStepProgression();
	const criticalBonusDamageByRoll = originals.map(() => '');
	getConfigAC5E.preservedInitialData.modified = originals.map((formula, index) => {
		const optinBonusParts = bonusPartsByRoll[index] ?? [];
		let formulaWithOptins = formula;
		if (optinBonusParts.length)
			formulaWithOptins = typeof formulaWithOptins === 'string' && formulaWithOptins.trim().length ? `${formulaWithOptins} + ${optinBonusParts.join(' + ')}` : optinBonusParts.join(' + ');
		const baseCriticalBonusDamage = normalizeCriticalBonusDamageFormula(getConfigAC5E.preservedInitialData?.baseCriticalBonusDamageByRoll?.[index]);
		const advDis = advDisByRoll[index] ?? '';
		const suffix = suffixesByRoll[index] ?? '';
		const rollOptionModifierState = rollOptionModifierStateByRoll[index] ?? {};
		const formulaSource = advDis && baseCriticalBonusDamage ? `${formulaWithOptins} + ${baseCriticalBonusDamage}` : formulaWithOptins;
		const resolvedFormula = resolveDamageFormulaDataReferences(formulaSource, formulaReplacementData);
		const extraDiceAdditive = extraDiceAdjustments[index]?.additive ?? 0;
		const extraDiceCriticalStaticAdditive = extraDiceAdjustments[index]?.criticalStaticAdditive ?? 0;
		const extraDiceCriticalStaticMultiplier = extraDiceAdjustments[index]?.criticalStaticMultiplier ?? 1;
		const extraDiceMultiplier = extraDiceAdjustments[index]?.multiplier ?? 1;
		const diceStepTotal = diceStepTotals[index] ?? 0;
		const criticalStaticParts = [];
		let nextFormula = resolvedFormula.replace(diceRegex, (match, count, sides, existing = '') => {
			const baseCount = parseInt(count, 10);
			const newCount = baseCount * extraDiceMultiplier + extraDiceAdditive;
			if (newCount <= 0) return `0d${sides}${existing}`;
			const shiftedSides = _shiftDamageDieSize(sides, diceStepTotal, diceProgression);
			const extremeModifier = getDamageExtremeDieModifier(rollOptionModifierState, shiftedSides);
			const existingSuffix = stripDamageAdvantageModifierTokens(existing);
			const diceTerm = `${newCount}d${shiftedSides}${suffix}${advDis}${extremeModifier}`;
			const term = `${diceTerm}${existingSuffix}`;
			const criticalStaticCount = baseCount * Math.max(0, extraDiceCriticalStaticMultiplier - 1) + extraDiceCriticalStaticAdditive;
			if (criticalStaticCount > 0) {
				const criticalDiceTerm = `${criticalStaticCount}d${shiftedSides}${suffix}${advDis}${extremeModifier}`;
				criticalStaticParts.push(`${criticalDiceTerm}${existingSuffix}`);
			}
			return term;
		});
		for (const op of formulaOperatorTokensByRoll[index] ?? []) nextFormula = applyFormulaOperatorToAllTerms(nextFormula, op);
		let criticalBonusDamage = [...criticalStaticParts, ...(criticalBonusPartsByRoll[index] ?? [])].filter(Boolean).join(' + ');
		for (const op of formulaOperatorTokensByRoll[index] ?? []) criticalBonusDamage = applyFormulaOperatorToAllTerms(criticalBonusDamage, op);
		criticalBonusDamageByRoll[index] = criticalBonusDamage;
		return nextFormula;
	});
	for (const entry of appendedBonusRolls) {
		const appendedCriticalParts = appendedCriticalBonusRollsByKey.get(getSyntheticBonusRollKey(entry.types?.length ? entry.types : [entry.type]))?.parts ?? [];
		criticalBonusDamageByRoll.push(appendedCriticalParts.join(' + '));
	}
	const suffixChanged = !areStringArraysEqual(activeModifiersArray, suffixesByRoll);
	const additiveChanged = extraDiceAdjustments.some((adj, index) => activeExtraDiceArray[index] !== adj.additive);
	const criticalStaticChanged = extraDiceAdjustments.some((adj, index) => activeCriticalStaticExtraDiceArray[index] !== (adj.criticalStaticAdditive ?? 0));
	const criticalStaticMultiplierChanged = extraDiceAdjustments.some((adj, index) => activeCriticalStaticExtraDiceMultiplierArray[index] !== (adj.criticalStaticMultiplier ?? 1));
	const multiplierChanged = extraDiceAdjustments.some((adj, index) => activeExtraDiceMultiplierArray[index] !== adj.multiplier);
	const diceStepChanged = diceStepTotals.some((total, index) => activeDiceStepsArray[index] !== total);
	const formulaOperatorChanged = !areStringMatrixEqual(activeFormulaOperatorsArray, formulaOperatorTokensByRoll);
	const optinBonusChanged = !areStringMatrixEqual(activeOptinBonusPartsArray, bonusPartsByRoll);
	const appendedBonusChanged = !areBonusRollEntriesEqual(activeAppendedBonusRolls, appendedBonusRolls);
	const activeCriticalBonusDamageArray =
		Array.isArray(getConfigAC5E.preservedInitialData.activeCriticalBonusDamageByRoll) ? getConfigAC5E.preservedInitialData.activeCriticalBonusDamageByRoll : originals.map(() => '');
	const criticalBonusChanged =
		activeCriticalBonusDamageArray.length !== criticalBonusDamageByRoll.length ||
		activeCriticalBonusDamageArray.some((value, index) => normalizeCriticalBonusDamageFormula(value) !== normalizeCriticalBonusDamageFormula(criticalBonusDamageByRoll[index]));
	const maximizeByRoll = rollOptionModifierStateByRoll.map((state) => !!state?.maximize);
	const minimizeByRoll = rollOptionModifierStateByRoll.map((state) => !!state?.minimize);
	const maximizeChanged = maximizeByRoll.some((value, index) => activeMaximizeArray[index] !== value);
	const minimizeChanged = minimizeByRoll.some((value, index) => activeMinimizeArray[index] !== value);
	const advDisChanged = !areStringArraysEqual(activeAdvDisArray, advDisByRoll);
	const damageTypeOverrideChanged =
		!areStringArraysEqual(activeDamageTypeArray, effectiveDamageTypeStateByRoll.map((entry) => entry.type)) ||
		!areStringMatrixEqual(activeDamageTypesArray, effectiveDamageTypeStateByRoll.map((entry) => entry.types));
	if (
		mode === 'apply' &&
		!suffixChanged &&
		!additiveChanged &&
		!criticalStaticChanged &&
		!criticalStaticMultiplierChanged &&
		!multiplierChanged &&
		!diceStepChanged &&
		!formulaOperatorChanged &&
		!optinBonusChanged &&
		!appendedBonusChanged &&
		!criticalBonusChanged &&
		!maximizeChanged &&
		!minimizeChanged &&
		!advDisChanged &&
		!damageTypeOverrideChanged
	)
		return false;
	if (
		mode === 'reset' ||
		(!suffixesByRoll.some(Boolean) &&
			extraDiceAdjustments.every((adj) => adj.additive === 0 && (adj.criticalStaticAdditive ?? 0) === 0 && (adj.criticalStaticMultiplier ?? 1) === 1 && adj.multiplier === 1) &&
			diceStepTotals.every((total) => total === 0) &&
			formulaOperatorTokensByRoll.every((tokens) => !tokens.length) &&
			bonusPartsByRoll.every((parts) => !parts.length) &&
			!appendedBonusRolls.length &&
			!criticalBonusDamageByRoll.some(Boolean) &&
			!maximizeByRoll.some(Boolean) &&
			!minimizeByRoll.some(Boolean) &&
			!advDisByRoll.some(Boolean) &&
			effectiveDamageTypeStateByRoll.every((entry, index) => areStringArraysEqual(entry.types, baseDamageTypesArray[index]) && (entry.type ?? '') === (baseDamageTypeArray[index] ?? '')))
	) {
		getConfigAC5E.preservedInitialData.modified = [...originals];
		getConfigAC5E.preservedInitialData.activeModifiers = originals.map(() => '');
		getConfigAC5E.preservedInitialData.activeExtraDice = originals.map(() => 0);
		getConfigAC5E.preservedInitialData.activeCriticalStaticExtraDice = originals.map(() => 0);
		getConfigAC5E.preservedInitialData.activeCriticalStaticExtraDiceMultipliers = originals.map(() => 1);
		getConfigAC5E.preservedInitialData.activeExtraDiceMultipliers = originals.map(() => 1);
		getConfigAC5E.preservedInitialData.activeDiceSteps = originals.map(() => 0);
		getConfigAC5E.preservedInitialData.activeFormulaOperators = originals.map(() => []);
		getConfigAC5E.preservedInitialData.activeOptinBonusParts = originals.map(() => []);
		getConfigAC5E.preservedInitialData.activeAppendedBonusRolls = [];
		getConfigAC5E.preservedInitialData.activeCriticalBonusDamageByRoll = originals.map(() => '');
		getConfigAC5E.preservedInitialData.activeMaximize = originals.map(() => false);
		getConfigAC5E.preservedInitialData.activeMinimize = originals.map(() => false);
		getConfigAC5E.preservedInitialData.activeAdvDis = originals.map(() => '');
		getConfigAC5E.preservedInitialData.activeDamageTypeByRoll = [...baseDamageTypeArray];
		getConfigAC5E.preservedInitialData.activeDamageTypesByRoll = baseDamageTypesArray.map((types) => [...types]);
		return true;
	}
	getConfigAC5E.preservedInitialData.activeModifiers = [...suffixesByRoll];
	getConfigAC5E.preservedInitialData.activeExtraDice = extraDiceAdjustments.map((adj) => adj.additive);
	getConfigAC5E.preservedInitialData.activeCriticalStaticExtraDice = extraDiceAdjustments.map((adj) => adj.criticalStaticAdditive ?? 0);
	getConfigAC5E.preservedInitialData.activeCriticalStaticExtraDiceMultipliers = extraDiceAdjustments.map((adj) => adj.criticalStaticMultiplier ?? 1);
	getConfigAC5E.preservedInitialData.activeExtraDiceMultipliers = extraDiceAdjustments.map((adj) => adj.multiplier);
	getConfigAC5E.preservedInitialData.activeDiceSteps = [...diceStepTotals];
	getConfigAC5E.preservedInitialData.activeFormulaOperators = formulaOperatorTokensByRoll.map((tokens) => [...tokens]);
	getConfigAC5E.preservedInitialData.activeOptinBonusParts = bonusPartsByRoll.map((parts) => [...parts]);
	getConfigAC5E.preservedInitialData.activeAppendedBonusRolls = appendedBonusRolls.map((entry) => ({ ...entry, types: Array.isArray(entry.types) ? [...entry.types] : [] }));
	getConfigAC5E.preservedInitialData.activeCriticalBonusDamageByRoll = criticalBonusDamageByRoll;
	getConfigAC5E.preservedInitialData.activeMaximize = maximizeByRoll;
	getConfigAC5E.preservedInitialData.activeMinimize = minimizeByRoll;
	getConfigAC5E.preservedInitialData.activeAdvDis = [...advDisByRoll];
	getConfigAC5E.preservedInitialData.activeDamageTypeByRoll = effectiveDamageTypeStateByRoll.map((entry) => entry.type);
	getConfigAC5E.preservedInitialData.activeDamageTypesByRoll = effectiveDamageTypeStateByRoll.map((entry) => [...entry.types]);
	return true;
}

export function compareArrays(a, b) {
	const safeA = Array.isArray(a) ? a : [];
	const safeB = Array.isArray(b) ? b : [];
	const len = Math.max(safeA.length, safeB.length);
	for (let i = 0; i < len; i++) {
		if (safeA[i] !== safeB[i]) return { equal: false, index: i, initialValue: safeA[i], selectedValue: safeB[i] };
	}
	return { equal: true };
}

export function applyDamageFormulaStateToConfig(ac5eConfig, config) {
	if (!ac5eConfig || !config || !Array.isArray(config.rolls)) return false;
	const frozenDamageBaseline = ac5eConfig?.preAC5eConfig?.frozenDamageBaseline ?? ac5eConfig?.frozenDamageBaseline;
	const currentCritical = ac5eConfig.isCritical ?? config.isCritical ?? false;
	ensureDamagePreservedInitialData(ac5eConfig, frozenDamageBaseline, config.rolls, currentCritical);
	captureBaseCriticalBonusDamage(ac5eConfig, config.rolls);
	captureBaseDamageTypeData(ac5eConfig, config.rolls, frozenDamageBaseline);
	const baseRolls = getNonSyntheticDamageRolls(config.rolls);
	const baseFormulas =
		ac5eConfig.preservedInitialData?.formulas ??
		baseRolls
			.map((roll) =>
				typeof roll?.formula === 'string' ? roll.formula
				: Array.isArray(roll?.parts) && roll.parts.length ? roll.parts.join(' + ')
				: undefined,
			)
			.filter((formula) => typeof formula === 'string' && formula.trim().length);
	const damageTypesByIndex = baseRolls.map((roll) => {
		const type = roll?.options?.type;
		return typeof type === 'string' && type.trim().length ? String(type).toLowerCase() : undefined;
	});
	ac5eConfig.options ??= {};
	applyOrResetFormulaChanges(null, ac5eConfig, 'apply', baseFormulas, damageTypesByIndex);
	syncAppendedBonusRolls({ config }, ac5eConfig, ac5eConfig.preservedInitialData?.modified ?? baseFormulas);
	syncDamageRollTypeOverrideOptions(ac5eConfig, config.rolls);
	const syncedBaseRolls = getNonSyntheticDamageRolls(config.rolls);
	const syncedDamageTypesByIndex = syncedBaseRolls.map((roll) => {
		const type = roll?.options?.type;
		return typeof type === 'string' && type.trim().length ? String(type).toLowerCase() : undefined;
	});
	ac5eConfig.options.selectedDamageTypesByIndex = syncedDamageTypesByIndex;
	ac5eConfig.options.selectedDamageTypes = syncedDamageTypesByIndex.filter(Boolean);
	syncDamageRollModifierOptions(ac5eConfig, config.rolls);
	syncCriticalStaticBonusDamageRollOptions(ac5eConfig, config.rolls);
	return true;
}
