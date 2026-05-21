import { _getDistance, _getTokenFromActor, _localize, _safeFromUuidSync } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { autoRanged } from '../ac5e-systemRules.mjs';
import { getDialogAc5eConfig, syncDialogAc5eState } from './ac5e-hooks-dialog-state.mjs';
import { getSubjectTokenIdFromConfig } from './ac5e-hooks-ui-utils.mjs';

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
	if (!dialog?.config || !['attack', 'save', 'check', 'initiative'].includes(ac5eConfig?.hookType)) return false;
	if (dialog._ac5eOptinReevalInProgress) return false;
	dialog._ac5eOptinReevalInProgress = true;
	try {
		const preservedOptinSelected = foundry.utils.duplicate(ac5eConfig?.optinSelected ?? {});
		const preservedBaselineAttackAbility =
			dialog?._ac5eBaselineAttackAbility ??
			ac5eConfig?.options?._ac5eBaselineAttackAbility ??
			ac5eConfig?.preAC5eConfig?._ac5eBaselineAttackAbility ??
			dialog?.config?.options?.[Constants.MODULE_ID]?.options?._ac5eBaselineAttackAbility;
		if (preservedBaselineAttackAbility !== undefined) dialog._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
		const preRestoreParts = getD20ActivePartsSnapshot(dialog.config);
		const preservedExternalParts = collectPreservedExternalD20Parts(ac5eConfig, preRestoreParts, dialog.config);
		deps.restoreD20ConfigFromFrozenBaseline(ac5eConfig, dialog.config);
		dialog.config.advantage = undefined;
		dialog.config.disadvantage = undefined;
		let nextConfig = ac5eConfig;
		if (ac5eConfig.hookType === 'attack') {
			const resolvedAttackAbility = getSelectedAttackAbilityOverride(ac5eConfig);
			if (preservedBaselineAttackAbility !== undefined) {
				ac5eConfig.options ??= {};
				ac5eConfig.options._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
				ac5eConfig.preAC5eConfig ??= {};
				ac5eConfig.preAC5eConfig._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
				dialog.config.options ??= {};
				dialog.config.options._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
				dialog.config.options.originatingUseConfig ??= {};
				dialog.config.options.originatingUseConfig.options ??= {};
				dialog.config.options.originatingUseConfig.options._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
				dialog.config.originatingUseConfig ??= {};
				dialog.config.originatingUseConfig.options ??= {};
				dialog.config.originatingUseConfig.options._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
				dialog.config.useConfig ??= {};
				dialog.config.useConfig.options ??= {};
				dialog.config.useConfig.options._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
			}
			if (resolvedAttackAbility) {
				dialog.config.ability = resolvedAttackAbility;
				ac5eConfig.options ??= {};
				ac5eConfig.options.ability = resolvedAttackAbility;
				ac5eConfig.options.activityAbilityResolved = resolvedAttackAbility;
				ac5eConfig.options._abilityOverrideResolvedAtUse = resolvedAttackAbility;
			} else {
				const baselineAbility =
					preservedBaselineAttackAbility ??
					ac5eConfig?.options?._ac5eBaselineAttackAbility ??
					ac5eConfig?.preAC5eConfig?._ac5eBaselineAttackAbility;
				if (baselineAbility !== undefined && baselineAbility !== null) dialog.config.ability = baselineAbility;
				else dialog.config.ability = '';
				ac5eConfig.options ??= {};
				ac5eConfig.options.ability = baselineAbility;
				delete ac5eConfig.options.activityAbilityResolved;
				delete ac5eConfig.options._abilityOverrideResolvedAtUse;
			}
			const transientDialog = {
				options: {
					window: { title: dialog?.message?.flavor },
					advantageMode: 0,
					defaultButton: 'normal',
				},
			};
			const rebuiltConfig = deps.preRollAttack(dialog.config, transientDialog, dialog.message, 'attack', ac5eConfig?.reEval);
			if (rebuiltConfig) {
				rebuiltConfig.optinSelected = { ...(rebuiltConfig.optinSelected ?? {}), ...preservedOptinSelected };
				if (preservedBaselineAttackAbility !== undefined) {
					rebuiltConfig.options ??= {};
					rebuiltConfig.options._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
					rebuiltConfig.preAC5eConfig ??= {};
					rebuiltConfig.preAC5eConfig._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
				}
				nextConfig = rebuiltConfig;
			}
		} else {
			deps.calcAdvantageMode(ac5eConfig, dialog.config, undefined, undefined, { skipSetProperties: true });
			deps.applyExplicitModeOverride(ac5eConfig, dialog.config);
		}
		appendPartsToD20Config(dialog.config, preservedExternalParts);
		nextConfig.optinSelected = { ...(nextConfig.optinSelected ?? {}), ...preservedOptinSelected };
		if (preservedBaselineAttackAbility !== undefined) {
			nextConfig.options ??= {};
			nextConfig.options._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
			nextConfig.preAC5eConfig ??= {};
			nextConfig.preAC5eConfig._ac5eBaselineAttackAbility = preservedBaselineAttackAbility;
		}
		syncDialogAc5eState(dialog, nextConfig);
		dialog.rebuild();
		dialog.render();
		return true;
	} finally {
		dialog._ac5eOptinReevalInProgress = false;
	}
}

function getSelectedAttackAbilityOverride(ac5eConfig) {
	if (!ac5eConfig) return null;
	const selectedIds = new Set(Object.keys(ac5eConfig.optinSelected ?? {}).filter((key) => ac5eConfig.optinSelected?.[key]));
	const entries = [
		...(Array.isArray(ac5eConfig.subject?.abilityOverride) ? ac5eConfig.subject.abilityOverride : []),
		...(Array.isArray(ac5eConfig.opponent?.abilityOverride) ? ac5eConfig.opponent.abilityOverride : []),
	].filter((entry) => entry && (!entry.hook || entry.hook === 'attack'));
	let winner = null;
	for (const entry of entries) {
		if (!(entry.optin || entry.forceOptin)) continue;
		if (!entry.forceOptin && !selectedIds.has(entry.id)) continue;
		let resolved = entry.set?.trim?.()?.toLowerCase?.();
		if (!resolved) continue;
		if (resolved === 'spellcasting') {
			resolved =
				ac5eConfig?.options?.activity?.spellcastingAbility?.trim?.()?.toLowerCase?.() ??
				ac5eConfig?.options?.item?.actor?.system?.attributes?.spellcasting?.trim?.()?.toLowerCase?.() ??
				ac5eConfig?.options?.spellcastingAbility?.trim?.()?.toLowerCase?.() ??
				'';
		}
		if (!resolved || !Object.hasOwn(CONFIG?.DND5E?.abilities ?? {}, resolved)) continue;
		const score = Number.isFinite(entry.priority) ? entry.priority : 0;
		if (!winner || score >= winner.score) winner = { resolved, score };
	}
	return winner?.resolved ?? null;
}

export function getD20ActivePartsSnapshot(config) {
	const configParts = Array.isArray(config?.parts) ? config.parts : [];
	const roll0Parts = Array.isArray(config?.rolls?.[0]?.parts) ? config.rolls[0].parts : [];
	const source = configParts.length >= roll0Parts.length ? configParts : roll0Parts;
	return foundry.utils.duplicate(source);
}

export function collectPreservedExternalD20Parts(ac5eConfig, beforeParts = [], config = null) {
	if (!Array.isArray(beforeParts) || !beforeParts.length) return [];
	const baselineParts =
		Array.isArray(ac5eConfig?.frozenD20Baseline?.parts) ? ac5eConfig.frozenD20Baseline.parts
		: Array.isArray(ac5eConfig?.preAC5eConfig?.frozenD20Baseline?.parts) ? ac5eConfig.preAC5eConfig.frozenD20Baseline.parts
		: [];
	const withoutBaseline = subtractPartsByOccurrence(beforeParts, baselineParts);
	const previousOptinParts = Array.isArray(ac5eConfig?._lastAppliedD20OptinParts) ? ac5eConfig._lastAppliedD20OptinParts : [];
	const previousInjectedParts = getAppliedD20Parts(config);
	return subtractPartsByOccurrence(subtractPartsByOccurrence(withoutBaseline, previousOptinParts), previousInjectedParts);
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
	const { nearbyFoe, inRange, range, longDisadvantage, outOfRangeFail, rangeNotes = [] } = autoRanged(activity, sourceToken, singleTargetToken, mergedOptions);
	ac5eConfig.options ??= {};
	ac5eConfig.options.distance = mergedOptions.distance;
	if (nearbyFoe) ac5eConfig.subject.disadvantage.push(nearbyLabel);
	ac5eConfig.subject.rangeNotes.push(...rangeNotes);
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
	// Preserve system-provided base d20 composition and min/max constraints (e.g. `1d20min7`).
	// AC5E opt-in cleanup should remove only AC5E-tracked overlays, not core roll constraints.
}

function subtractPartsByOccurrence(parts = [], toSubtract = []) {
	if (!Array.isArray(parts) || !parts.length) return [];
	if (!Array.isArray(toSubtract) || !toSubtract.length) return [...parts];
	const subtractionCounts = new Map();
	for (const part of toSubtract) {
		const key = getPartOccurrenceKey(part);
		subtractionCounts.set(key, (subtractionCounts.get(key) ?? 0) + 1);
	}
	const kept = [];
	for (const part of parts) {
		const key = getPartOccurrenceKey(part);
		const remaining = subtractionCounts.get(key) ?? 0;
		if (remaining > 0) {
			subtractionCounts.set(key, remaining - 1);
			continue;
		}
		kept.push(part);
	}
	return kept;
}

function appendPartsByOccurrence(targetParts = [], additions = []) {
	const remaining = new Map();
	for (const part of targetParts) {
		const key = getPartOccurrenceKey(part);
		remaining.set(key, (remaining.get(key) ?? 0) + 1);
	}
	for (const part of additions) {
		const key = getPartOccurrenceKey(part);
		const current = remaining.get(key) ?? 0;
		if (current > 0) {
			remaining.set(key, current - 1);
			continue;
		}
		targetParts.push(part);
	}
}

function getAppliedD20Parts(config) {
	const roll0 = Array.isArray(config?.rolls) && config.rolls[0] && typeof config.rolls[0] === 'object' ? config.rolls[0] : null;
	const roll0Options = roll0?.options && typeof roll0.options === 'object' ? roll0.options : null;
	const roll0Ac5eOptions = roll0Options?.[Constants.MODULE_ID] && typeof roll0Options[Constants.MODULE_ID] === 'object' ? roll0Options[Constants.MODULE_ID] : null;
	return Array.isArray(roll0Ac5eOptions?.appliedParts) ? roll0Ac5eOptions.appliedParts : [];
}

function getPartOccurrenceKey(part) {
	return String(part);
}

function getSingleTargetToken(messageTargets) {
	if (!Array.isArray(messageTargets) || !messageTargets.length) return undefined;
	const tokenUuid = messageTargets[0]?.tokenUuid;
	if (!tokenUuid) return undefined;
	const tokenDoc = _safeFromUuidSync(tokenUuid);
	return tokenDoc?.object ?? canvas.tokens?.get(tokenDoc?.id);
}
