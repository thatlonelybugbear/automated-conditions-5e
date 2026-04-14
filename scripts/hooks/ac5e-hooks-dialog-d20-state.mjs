import { _getActiveAbilityOverride, _getDistance, _getTokenFromActor, _localize, _safeFromUuidSync } from '../ac5e-helpers.mjs';
import { autoRanged } from '../ac5e-systemRules.mjs';
import { getDialogAc5eConfig, syncDialogAc5eState } from './ac5e-hooks-dialog-state.mjs';
import { getSubjectTokenIdFromConfig } from './ac5e-hooks-ui-utils.mjs';

export function applyAbilityOverrideToCoreConfig(config, activity, abilityOverride) {
	const normalizedAbility = String(abilityOverride ?? '')
		.trim()
		.toLowerCase();
	if (!config || !normalizedAbility) return;
	if (!config.subject || typeof config.subject !== 'object') return;
	const activityType = String(activity?.type ?? '')
		.trim()
		.toLowerCase();
	if (!activityType) return;
	config.subject[activityType] ??= {};
	if (config.subject[activityType] && typeof config.subject[activityType] === 'object') {
		config.subject[activityType].ability = normalizedAbility;
	}
}

export function restoreAbilityToBaseline(config, ac5eConfig) {
	const baselineAbility = String(ac5eConfig?.preAC5eConfig?.baseAbility ?? ac5eConfig?.frozenD20Baseline?.profile?.ability ?? ac5eConfig?.preAC5eConfig?.frozenD20Baseline?.profile?.ability ?? '')
		.trim()
		.toLowerCase();
	if (!baselineAbility) return;
	ac5eConfig.options ??= {};
	ac5eConfig.options.ability = baselineAbility;
	if (config?.options && typeof config.options === 'object') config.options.ability = baselineAbility;
	if (!config?.subject || typeof config.subject !== 'object') return;
	const hookType = String(ac5eConfig?.hookType ?? '')
		.trim()
		.toLowerCase();
	if (!hookType) return;
	config.subject[hookType] ??= {};
	if (config.subject[hookType] && typeof config.subject[hookType] === 'object') {
		config.subject[hookType].ability = baselineAbility;
	}
}

export function syncD20AbilityOverrideState(config, ac5eConfig, { activity, options } = {}) {
	ac5eConfig.preAC5eConfig ??= {};
	if (!ac5eConfig.preAC5eConfig.baseAbility) {
		ac5eConfig.preAC5eConfig.baseAbility = String(options?.ability ?? config?.subject?.[activity?.type ?? '']?.ability ?? '')
			.trim()
			.toLowerCase();
	}
	ac5eConfig.abilityOverride = _getActiveAbilityOverride(ac5eConfig) || ac5eConfig?.abilityOverride || '';
	if (ac5eConfig.abilityOverride) {
		ac5eConfig.options ??= {};
		ac5eConfig.options.ability = ac5eConfig.abilityOverride;
		if (options && typeof options === 'object') options.ability = ac5eConfig.abilityOverride;
	} else if (config) {
		restoreAbilityToBaseline(config, ac5eConfig);
	}
	applyAbilityOverrideToCoreConfig(config, activity ?? { type: ac5eConfig?.hookType }, ac5eConfig?.abilityOverride);
	return ac5eConfig.abilityOverride;
}

export function refreshDialogAbilityState(dialog, ac5eConfig, selectedAbility, deps) {
	if (!dialog?.config || !selectedAbility || !['check', 'save'].includes(ac5eConfig?.hookType)) return null;
	const currentAbility = ac5eConfig?.options?.ability ?? dialog?.config?.ability;
	if (!selectedAbility || selectedAbility === currentAbility) return null;
	const activeHook = ac5eConfig.hookType === 'save' ? 'save' : 'check';
	resetDialogD20State(dialog, ac5eConfig, deps, { restoreBaseTarget: true, resetTargetADC: true });
	dialog.config.ability = selectedAbility;
	const transientDialog = { options: { window: { title: dialog?.message?.flavor }, advantageMode: 0, defaultButton: 'normal' } };
	const refreshedConfig =
		activeHook === 'save' ?
			deps.preRollSavingThrow(dialog.config, transientDialog, dialog.message, activeHook)
		:	deps.preRollAbilityCheck(dialog.config, transientDialog, dialog.message, activeHook, ac5eConfig?.reEval);
	return refreshedConfig ?? dialog?.config?.rolls?.[0]?.options?.[deps.Constants.MODULE_ID] ?? dialog?.config?.[deps.Constants.MODULE_ID] ?? ac5eConfig;
}

export function doDialogAttackRender(dialog, elem, getConfigAC5E, deps) {
	const attackModeSelect = elem.querySelector('select[name="attackMode"]');
	const masterySelect = elem.querySelector('select[name="mastery"]');
	const ammunitionSelect = elem.querySelector('select[name="ammunition"]');
	for (const control of [attackModeSelect, masterySelect, ammunitionSelect]) {
		if (!control || control.dataset.ac5eAttackReevalBound) continue;
		control.dataset.ac5eAttackReevalBound = 'true';
		control.addEventListener('change', () => {
			const activeConfig = getDialogAc5eConfig(dialog, getConfigAC5E);
			const refreshed = refreshDialogAttackState(
				dialog,
				activeConfig,
				{
					ammunition: ammunitionSelect?.value,
					attackMode: attackModeSelect?.value,
					mastery: masterySelect?.value,
				},
				deps,
			);
			if (refreshed) queueMicrotask(() => deps.rerenderHijack('d20Dialog', dialog, elem));
		});
	}
	const refreshed = refreshDialogAttackState(
		dialog,
		getConfigAC5E,
		{
			ammunition: ammunitionSelect?.value,
			attackMode: attackModeSelect?.value,
			mastery: masterySelect?.value,
		},
		deps,
	);
	return refreshed ?? getConfigAC5E;
}

export function handleD20OptinSelectionsChanged(dialog, ac5eConfig, deps) {
	if (!dialog?.config || !['attack', 'save', 'check'].includes(ac5eConfig?.hookType)) return false;
	const preRestoreParts = getD20ActivePartsSnapshot(dialog.config);
	deps.restoreD20ConfigFromFrozenBaseline(ac5eConfig, dialog.config);
	const preservedExternalParts = collectPreservedExternalD20Parts(ac5eConfig, preRestoreParts);
	dialog.config.advantage = undefined;
	dialog.config.disadvantage = undefined;
	if (ac5eConfig.hookType === 'attack') refreshAttackAutoRangeState(ac5eConfig, dialog.config);
	deps.calcAdvantageMode(ac5eConfig, dialog.config, undefined, undefined, { skipSetProperties: true });
	deps.applyExplicitModeOverride(ac5eConfig, dialog.config);
	syncD20AbilityOverrideState(dialog.config, ac5eConfig, { options: dialog.config?.options });
	appendPartsToD20Config(dialog.config, preservedExternalParts);
	syncDialogAc5eState(dialog, ac5eConfig);
	dialog.rebuild();
	dialog.render();
	return true;
}

export function getD20ActivePartsSnapshot(config) {
	const configParts = Array.isArray(config?.parts) ? config.parts : [];
	const roll0Parts = Array.isArray(config?.rolls?.[0]?.parts) ? config.rolls[0].parts : [];
	const source = configParts.length >= roll0Parts.length ? configParts : roll0Parts;
	return foundry.utils.duplicate(source);
}

export function collectPreservedExternalD20Parts(ac5eConfig, beforeParts = []) {
	if (!Array.isArray(beforeParts) || !beforeParts.length) return [];
	const baselineParts =
		Array.isArray(ac5eConfig?.frozenD20Baseline?.parts) ? ac5eConfig.frozenD20Baseline.parts
		: Array.isArray(ac5eConfig?.preAC5eConfig?.frozenD20Baseline?.parts) ? ac5eConfig.preAC5eConfig.frozenD20Baseline.parts
		: [];
	const withoutBaseline = subtractPartsByOccurrence(beforeParts, baselineParts);
	const previousOptinParts = Array.isArray(ac5eConfig?._lastAppliedD20OptinParts) ? ac5eConfig._lastAppliedD20OptinParts : [];
	return subtractPartsByOccurrence(withoutBaseline, previousOptinParts);
}

export function appendPartsToD20Config(config, parts = []) {
	if (!Array.isArray(parts) || !parts.length) return;
	config.parts ??= [];
	appendPartsByOccurrence(config.parts, parts);
	const roll0 = config?.rolls?.[0];
	if (!roll0) return;
	roll0.parts = Array.isArray(roll0.parts) ? roll0.parts : [];
	appendPartsByOccurrence(roll0.parts, parts);
}

export function refreshAttackAutoRangeState(ac5eConfig, config) {
	if (!ac5eConfig || ac5eConfig.hookType !== 'attack') return;
	const options = ac5eConfig.options ?? {};
	const activity = options.activity ?? config?.subject ?? config?.activity;
	if (!activity) return;
	const sourceTokenId = ac5eConfig.tokenId ?? getSubjectTokenIdFromConfig(config);
	const sourceToken =
		sourceTokenId ? canvas.tokens.get(sourceTokenId)
		: activity?.actor ? (_getTokenFromActor(activity.actor) ?? activity.actor.getActiveTokens?.()?.[0])
		: undefined;
	const isTargetSelf = activity?.target?.affects?.type === 'self';
	const targets = Array.isArray(options.targets) ? options.targets : [];
	const singleTargetToken = getSingleTargetToken(targets) ?? (isTargetSelf ? sourceToken : game.user?.targets?.first());
	if (!sourceToken || !singleTargetToken) return;
	const failLabel = _localize('AC5E.OutOfRange');
	const nearbyLabel = _localize('AC5E.NearbyFoe');
	const longLabel = _localize('RangeLong');
	ac5eConfig.subject.fail = (ac5eConfig.subject.fail ?? []).filter((entry) => {
		if (entry === failLabel) return false;
		if (!entry || typeof entry !== 'object') return true;
		const label = String(entry.label ?? entry.name ?? entry.id ?? '').trim();
		return label !== failLabel;
	});
	ac5eConfig.subject.disadvantage = (ac5eConfig.subject.disadvantage ?? []).filter((v) => v !== nearbyLabel && v !== longLabel);
	ac5eConfig.subject.rangeNotes = [];
	const mergedOptions = { ...options, targets, ac5eConfig };
	mergedOptions.distance = _getDistance(sourceToken, singleTargetToken);
	const { nearbyFoe, inRange, range, longDisadvantage, outOfRangeFail, outOfRangeFailSourceLabel } = autoRanged(activity, sourceToken, singleTargetToken, mergedOptions);
	ac5eConfig.options ??= {};
	ac5eConfig.options.distance = mergedOptions.distance;
	if (nearbyFoe) ac5eConfig.subject.disadvantage.push(nearbyLabel);
	if (!outOfRangeFail && !inRange && outOfRangeFailSourceLabel) {
		ac5eConfig.subject.rangeNotes.push(`${failLabel} fail suppressed: ${outOfRangeFailSourceLabel}`);
	}
	if (outOfRangeFail && !config?.workflow?.AoO && !inRange) ac5eConfig.subject.fail.push(failLabel);
	if (range === 'long' && longDisadvantage) ac5eConfig.subject.disadvantage.push(longLabel);
	if (ac5eConfig?.tooltipObj?.attack) delete ac5eConfig.tooltipObj.attack;
}

function refreshDialogAttackState(dialog, ac5eConfig, nextSelections = {}, deps) {
	if (!dialog?.config || ac5eConfig?.hookType !== 'attack') return null;
	const currentSelections = {
		ammunition: ac5eConfig?.options?.ammo ?? dialog?.config?.ammunition,
		attackMode: ac5eConfig?.options?.attackMode ?? dialog?.config?.attackMode,
		mastery: ac5eConfig?.options?.mastery ?? dialog?.config?.mastery,
	};
	const nextAmmunition = nextSelections.ammunition ?? currentSelections.ammunition;
	const nextAttackMode = nextSelections.attackMode ?? currentSelections.attackMode;
	const nextMastery = nextSelections.mastery ?? currentSelections.mastery;
	if (nextAmmunition === currentSelections.ammunition && nextAttackMode === currentSelections.attackMode && nextMastery === currentSelections.mastery) return null;
	resetDialogD20State(dialog, ac5eConfig, deps, { resetMidiOptions: true });
	dialog.config.ammunition = nextAmmunition;
	dialog.config.attackMode = nextAttackMode;
	dialog.config.mastery = nextMastery;
	const transientDialog = { options: { window: { title: dialog?.message?.flavor }, advantageMode: 0, defaultButton: 'normal' } };
	return (
		deps.preRollAttack(dialog.config, transientDialog, dialog.message, 'attack') ??
		dialog?.config?.rolls?.[0]?.options?.[deps.Constants.MODULE_ID] ??
		dialog?.config?.[deps.Constants.MODULE_ID] ??
		ac5eConfig
	);
}

function resetDialogD20State(dialog, ac5eConfig, deps, { resetMidiOptions = false, restoreBaseTarget = false, resetTargetADC = false } = {}) {
	deps.restoreD20ConfigFromFrozenBaseline(ac5eConfig, dialog.config);
	if (resetTargetADC) resetDialogTargetADCState(ac5eConfig);
	if (restoreBaseTarget) restoreDialogBaseTarget(dialog, ac5eConfig, deps);
	resetDialogAc5eMirrors(dialog, deps);
	if (resetMidiOptions && dialog.config.midiOptions) {
		dialog.config.midiOptions.isCritical = false;
		dialog.config.midiOptions.advantage = false;
		dialog.config.midiOptions.disadvantage = false;
	}
	if (ac5eConfig.preAC5eConfig && typeof ac5eConfig.preAC5eConfig === 'object') {
		ac5eConfig.preAC5eConfig.frozenD20BaselineByProfile = {};
		delete ac5eConfig.preAC5eConfig.frozenD20Baseline;
		delete ac5eConfig.preAC5eConfig.activeRollProfileKey;
	}
	delete ac5eConfig.frozenD20Baseline;
}

function resetDialogTargetADCState(ac5eConfig) {
	ac5eConfig.initialTargetADC = undefined;
	ac5eConfig.alteredTargetADC = undefined;
	ac5eConfig.optinBaseTargetADCValue = undefined;
	ac5eConfig.optinBaseTargetADC = undefined;
	ac5eConfig.targetADC = [];
	if (ac5eConfig?.subject && typeof ac5eConfig.subject === 'object') ac5eConfig.subject.targetADC = [];
	if (ac5eConfig?.opponent && typeof ac5eConfig.opponent === 'object') ac5eConfig.opponent.targetADC = [];
}

function restoreDialogBaseTarget(dialog, ac5eConfig, deps) {
	if (!ac5eConfig.preAC5eConfig || typeof ac5eConfig.preAC5eConfig !== 'object') return;
	const baseRoll0Options = ac5eConfig.preAC5eConfig.baseRoll0Options;
	if (!baseRoll0Options || !Object.hasOwn(baseRoll0Options, 'target')) return;
	const baseTarget = baseRoll0Options.target;
	dialog.config.target = baseTarget;
	const baseRoll0 = deps.getExistingRoll(dialog.config, 0);
	const baseRoll0OptionsTarget = deps.getExistingRollOptions(dialog.config, 0);
	if (baseRoll0) baseRoll0.target = baseTarget;
	if (baseRoll0OptionsTarget) baseRoll0OptionsTarget.target = baseTarget;
}

function resetDialogAc5eMirrors(dialog, deps) {
	dialog.config.advantage = undefined;
	dialog.config.disadvantage = undefined;
	dialog.config.advantageMode = 0;
	delete dialog.config.defaultButton;
	if (dialog.config?.options && typeof dialog.config.options === 'object') {
		dialog.config.options.advantage = undefined;
		dialog.config.options.disadvantage = undefined;
		dialog.config.options.advantageMode = 0;
		delete dialog.config.options.defaultButton;
	}
	const roll0 = deps.getExistingRoll(dialog.config, 0);
	const roll0Options = deps.getExistingRollOptions(dialog.config, 0);
	delete dialog.config?.[deps.Constants.MODULE_ID];
	if (dialog.config?.options && typeof dialog.config.options === 'object') delete dialog.config.options[deps.Constants.MODULE_ID];
	if (roll0 && typeof roll0 === 'object') delete roll0[deps.Constants.MODULE_ID];
	if (roll0Options && typeof roll0Options === 'object') delete roll0Options[deps.Constants.MODULE_ID];
	if (roll0?.options && typeof roll0.options === 'object') {
		roll0.options.advantage = undefined;
		roll0.options.disadvantage = undefined;
		roll0.options.advantageMode = 0;
		delete roll0.options.defaultButton;
	}
	if (roll0Options) roll0Options.advantageMode = 0;
	if (roll0Options) roll0Options.advantage = undefined;
	if (roll0Options) roll0Options.disadvantage = undefined;
	if (roll0Options) delete roll0Options.defaultButton;
	if (roll0) roll0.parts = [];
	if (roll0Options) roll0Options.maximum = null;
	if (roll0Options) roll0Options.minimum = null;
}

function subtractPartsByOccurrence(parts = [], toSubtract = []) {
	if (!Array.isArray(parts) || !parts.length) return [];
	if (!Array.isArray(toSubtract) || !toSubtract.length) return [...parts];
	const subtractionCounts = new Map();
	for (const part of toSubtract) {
		subtractionCounts.set(part, (subtractionCounts.get(part) ?? 0) + 1);
	}
	const kept = [];
	for (const part of parts) {
		const remaining = subtractionCounts.get(part) ?? 0;
		if (remaining > 0) {
			subtractionCounts.set(part, remaining - 1);
			continue;
		}
		kept.push(part);
	}
	return kept;
}

function appendPartsByOccurrence(targetParts = [], additions = []) {
	const remaining = new Map();
	for (const part of targetParts) {
		remaining.set(part, (remaining.get(part) ?? 0) + 1);
	}
	for (const part of additions) {
		const current = remaining.get(part) ?? 0;
		if (current > 0) {
			remaining.set(part, current - 1);
			continue;
		}
		targetParts.push(part);
	}
}

function getSingleTargetToken(messageTargets) {
	if (!Array.isArray(messageTargets) || !messageTargets.length) return undefined;
	const tokenUuid = messageTargets[0]?.tokenUuid;
	if (!tokenUuid) return undefined;
	const tokenDoc = _safeFromUuidSync(tokenUuid);
	return tokenDoc?.object ?? canvas.tokens?.get(tokenDoc?.id);
}
