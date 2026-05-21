import { _entryMatchesTransientState, _getMessageDnd5eFlags, _getMessageFlagScope, _getTooltip, _restoreD20ConfigFromFrozenBaseline, debugRollStateMigration, getRollModeCounts } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { applyOptinCriticalToDamageConfig, syncCriticalStaticBonusDamageRollOptions } from './ac5e-hooks-dialog-damage-state.mjs';
import { setOptinSelections } from './ac5e-hooks-dialog-optins.mjs';
import { appendPartsToD20Config, collectPreservedExternalD20Parts, getD20ActivePartsSnapshot, refreshAttackAutoRangeState } from './ac5e-hooks-dialog-d20-state.mjs';
import { getMessageForConfigTargets } from './ac5e-hooks-target-attack.mjs';
import { getMessageTargetsFromFlags, resolveTargets, syncTargetsToConfigAndMessage } from './ac5e-hooks-target-context.mjs';
import { applyExplicitModeOverride, mirrorD20ModeState } from './ac5e-hooks-roll-post.mjs';
import { getBonusEntriesForHook } from './ac5e-hooks-roll-selections.mjs';
import { applyTargetADCStateToD20Config, rebuildOptinTargetADCState } from './ac5e-hooks-roll-target-adc.mjs';
import { getExistingRollOptions } from './ac5e-hooks-ui-utils.mjs';

export function buildRollConfig(app, rollConfig, formData, index, hook, deps) {
	if (deps.buildDebug || deps.hookDebugEnabled('buildRollConfigHook')) console.warn('AC5E._buildRollConfig', { hook, app, config: rollConfig, formData, index });
	if (!rollConfig) return true;
	const options = rollConfig.options ?? (rollConfig.options = {});
	const ac5eConfig = options[Constants.MODULE_ID] ?? (options[Constants.MODULE_ID] = {});
	ac5eConfig.buildRollConfig = { hook, index };
	const activeHook = ac5eConfig.hookType ?? hook;
	const shouldSyncAttackTargets = activeHook === 'attack' || activeHook === 'damage';
	const targetMessage = getMessageForConfigTargets(rollConfig, activeHook, ac5eConfig.options?.activity);
	if (shouldSyncAttackTargets) {
		const targetDeps = { Constants, getMessageFlagScope: _getMessageFlagScope, getMessageDnd5eFlags: _getMessageDnd5eFlags };
		const messageTargets = getMessageTargetsFromFlags(targetMessage, targetDeps);
		const resolvedTargets = resolveTargets(targetMessage, messageTargets, { hook: activeHook, activity: ac5eConfig.options?.activity }, targetDeps);
		syncTargetsToConfigAndMessage(ac5eConfig, resolvedTargets, null, targetDeps);
	}
	if (ac5eConfig.hookType === 'damage') {
		const optins = getOptinsFromForm(formData);
		setOptinSelections(ac5eConfig, optins);
		applyResolvedAbilityOverrideToRollConfig(ac5eConfig, rollConfig, activeHook);
		applyOptinCriticalToDamageConfig(ac5eConfig, rollConfig, formData);
		syncCriticalStaticBonusDamageRollOptions(ac5eConfig, rollConfig?.rolls);
		syncRollOptinSelections(ac5eConfig, rollConfig);
		syncChatTooltipToRollConfigs(ac5eConfig, rollConfig);
		debugRollStateMigration('build.damage', { hook: activeHook, config: rollConfig, rolls: rollConfig?.rolls, ac5eConfig, extra: { index, optins } });
		return true;
	}
	if (!ac5eConfig.hookType || !['attack', 'save', 'check'].includes(ac5eConfig.hookType)) return true;
	if (index !== 0) return true;

	const preRestoreParts = getD20ActivePartsSnapshot(rollConfig);
	const preservedExternalParts = collectPreservedExternalD20Parts(ac5eConfig, preRestoreParts, rollConfig);
	_restoreD20ConfigFromFrozenBaseline(ac5eConfig, rollConfig);
	const optins = getOptinsFromForm(formData);
	setOptinSelections(ac5eConfig, optins);
	applyResolvedAbilityOverrideToRollConfig(ac5eConfig, rollConfig, activeHook);
	if (ac5eConfig.hookType === 'attack') refreshAttackAutoRangeState(ac5eConfig, rollConfig);
	let targetADCEntries = [];
	if (ac5eConfig.hookType === 'attack') {
		if (ac5e?.debugTargetADC)
			console.warn('AC5E targetADC: buildRollConfig entries', {
				hook: ac5eConfig.hookType,
				subjectTargetADC: ac5eConfig?.subject?.targetADC,
				opponentTargetADC: ac5eConfig?.opponent?.targetADC,
				optins,
			});
		({ targetADCEntries } = rebuildOptinTargetADCState(ac5eConfig, rollConfig));
		if (ac5e?.debugTargetADC)
			console.warn('AC5E targetADC: selected', {
				targetADCEntries,
				optinSelected: ac5eConfig.optinSelected,
				targetADC: ac5eConfig.targetADC,
			});
	}
	rollConfig.advantage = undefined;
	rollConfig.disadvantage = undefined;
	deps.calcAdvantageMode(ac5eConfig, rollConfig, undefined, undefined, { skipSetProperties: true });
	applyExplicitModeOverride(ac5eConfig, rollConfig);
	if (ac5eConfig.hookType === 'attack') {
		applyTargetADCStateToD20Config(ac5eConfig, rollConfig, { syncAttackTargets: true });
		if (ac5e?.debugTargetADC)
			console.warn('AC5E targetADC: buildRollConfig target', {
				hook: ac5eConfig.hookType,
				configTarget: rollConfig.target,
				rollTarget: rollConfig?.rolls?.[0]?.target,
				rollOptionsTarget: rollConfig?.rolls?.[0]?.options?.target,
				alteredTargetADC: ac5eConfig.alteredTargetADC,
			});
	}
	const roll0Options = getExistingRollOptions(rollConfig, 0);
	const nextDefaultButton = ac5eConfig.defaultButton ?? 'normal';
	if (Object.isExtensible(options)) rollConfig.options = options;
	mirrorD20ModeState(ac5eConfig, rollConfig, { advantageMode: ac5eConfig.advantageMode, defaultButton: nextDefaultButton, rollOptions: roll0Options });
	getRollModeCounts(ac5eConfig);
	if (rollConfig?.rolls?.length) {
		for (const roll of rollConfig.rolls) {
			if (!roll?.options) continue;
			roll.options[Constants.MODULE_ID] ??= {};
			roll.options[Constants.MODULE_ID].optinSelected = ac5eConfig.optinSelected;
			roll.options[Constants.MODULE_ID].defaultButton = ac5eConfig.defaultButton;
			roll.options[Constants.MODULE_ID].advantageMode = ac5eConfig.advantageMode;
			roll.options[Constants.MODULE_ID].hasTransitAdvantage = !!ac5eConfig.hasTransitAdvantage;
			roll.options[Constants.MODULE_ID].hasTransitDisadvantage = !!ac5eConfig.hasTransitDisadvantage;
			roll.options[Constants.MODULE_ID].modeCounts = ac5eConfig?.modeCounts ? foundry.utils.duplicate(ac5eConfig.modeCounts) : undefined;
		}
	}
	const entries = getBonusEntriesForHook(ac5eConfig, ac5eConfig.hookType).filter((entry) => entry.optin);
	if (entries.length) {
		const selectedIds = new Set(Object.keys(optins).filter((key) => optins[key]));
		const partsToAdd = [];
		for (const entry of entries) {
			if (!selectedIds.has(entry.id)) continue;
			if (!_entryMatchesTransientState(entry, ac5eConfig)) continue;
			const values = Array.isArray(entry.values) ? entry.values : [];
			for (const value of values) partsToAdd.push(value);
		}
		ac5eConfig._lastAppliedD20OptinParts = [...partsToAdd];
		appendPartsToD20Config(rollConfig, partsToAdd);
	} else {
		ac5eConfig._lastAppliedD20OptinParts = [];
	}
	appendPartsToD20Config(rollConfig, preservedExternalParts);
	syncChatTooltipToRollConfigs(ac5eConfig, rollConfig);
	debugRollStateMigration('build.d20', { hook: activeHook, config: rollConfig, rolls: rollConfig?.rolls, ac5eConfig, extra: { index, optins, preservedExternalParts } });
	return true;
}

function getOptinsFromForm(formData) {
	const optins = { ...(formData?.object?.ac5eOptins ?? {}) };
	const raw = formData?.object ?? {};
	for (const [key, value] of Object.entries(raw)) {
		if (!key.startsWith('ac5eOptins.')) continue;
		const id = key.slice('ac5eOptins.'.length);
		optins[id] = !!value;
	}
	return optins;
}

function syncRollOptinSelections(ac5eConfig, rollConfig) {
	if (!rollConfig?.rolls?.length) return;
	for (const roll of rollConfig.rolls) {
		if (!roll?.options) continue;
		roll.options[Constants.MODULE_ID] ??= {};
		roll.options[Constants.MODULE_ID].optinSelected = ac5eConfig.optinSelected;
	}
}

function syncChatTooltipToRollConfigs(ac5eConfig, rollConfig) {
	if (!ac5eConfig || !rollConfig?.rolls?.length) return;
	const tooltip = _getTooltip(ac5eConfig);
	ac5eConfig.chatTooltip = tooltip;
	for (const roll of rollConfig.rolls) {
		if (!roll?.options) continue;
		roll.options[Constants.MODULE_ID] ??= {};
		roll.options[Constants.MODULE_ID].chatTooltip = tooltip;
	}
}

function applyResolvedAbilityOverrideToRollConfig(ac5eConfig, rollConfig, hookType) {
	if (!['attack', 'damage'].includes(hookType)) return;
	const subjectAttack = rollConfig?.subject?.attack;
	if (hookType === 'attack' && ac5eConfig?.options) {
		const existingBaseline =
			ac5eConfig.options._ac5eBaselineAttackAbility ??
			ac5eConfig?.preAC5eConfig?._ac5eBaselineAttackAbility;
		if (existingBaseline !== undefined) {
			ac5eConfig.options._ac5eBaselineAttackAbility = existingBaseline;
			ac5eConfig.preAC5eConfig ??= {};
			ac5eConfig.preAC5eConfig._ac5eBaselineAttackAbility = existingBaseline;
		}
	}
	const resolvedAbility = getWinningAbilityOverride(ac5eConfig, hookType);
	if (!resolvedAbility) {
		if (ac5eConfig?.options) {
			delete ac5eConfig.options.activityAbilityResolved;
			delete ac5eConfig.options._abilityOverrideResolvedAtUse;
		}
		if (ac5eConfig?.preAC5eConfig) {
			delete ac5eConfig.preAC5eConfig.activityAbilityResolved;
			delete ac5eConfig.preAC5eConfig._abilityOverrideResolvedAtUse;
		}
		if (hookType === 'attack' && subjectAttack && typeof subjectAttack === 'object') {
			const baseline = ac5eConfig?.options?._ac5eBaselineAttackAbility;
			const hasBaseline = baseline !== undefined && baseline !== null;
			if (hasBaseline && subjectAttack.ability !== baseline) {
				if (globalThis.ac5e?.debug?.abilityOverrideTrace) {
					console.warn('AC5E TRACE rollBuild.restoreBaselineAttackAbility', {
						from: subjectAttack.ability,
						to: baseline,
						hookType,
					});
				}
				subjectAttack.ability = baseline;
			}
			if (hasBaseline) {
				rollConfig.ability = baseline;
				const baselineMod = rollConfig?.subject?.actor?.system?.abilities?.[baseline]?.mod;
				if (Number.isFinite(baselineMod)) {
					rollConfig.data ??= {};
					rollConfig.data.mod = baselineMod;
				} else if (rollConfig?.data && Object.hasOwn(rollConfig.data, 'mod')) {
					delete rollConfig.data.mod;
				}
				const roll0Restore = rollConfig?.rolls?.[0];
				if (roll0Restore && typeof roll0Restore === 'object') {
					roll0Restore.options ??= {};
					roll0Restore.options.ability = baseline;
					if (Number.isFinite(baselineMod)) {
						roll0Restore.data ??= {};
						roll0Restore.data.mod = baselineMod;
					} else if (roll0Restore?.data && Object.hasOwn(roll0Restore.data, 'mod')) {
						delete roll0Restore.data.mod;
					}
				}
			}
		}
		return;
	}
	ac5eConfig.options ??= {};
	ac5eConfig.options.ability = resolvedAbility;
	ac5eConfig.options.activityAbilityResolved = resolvedAbility;
	ac5eConfig.options._abilityOverrideResolvedAtUse = resolvedAbility;
	ac5eConfig.preAC5eConfig ??= {};
	ac5eConfig.preAC5eConfig.activityAbilityResolved = resolvedAbility;
	ac5eConfig.preAC5eConfig._abilityOverrideResolvedAtUse = resolvedAbility;
	rollConfig.ability = resolvedAbility;
	if (hookType === 'attack' && subjectAttack && typeof subjectAttack === 'object' && subjectAttack.ability !== resolvedAbility) {
		subjectAttack.ability = resolvedAbility;
	}
	const resolvedMod = rollConfig?.subject?.actor?.system?.abilities?.[resolvedAbility]?.mod;
	if (Number.isFinite(resolvedMod)) {
		rollConfig.data ??= {};
		rollConfig.data.mod = resolvedMod;
	}
	const roll0 = rollConfig?.rolls?.[0];
	if (roll0 && typeof roll0 === 'object') {
		roll0.options ??= {};
		roll0.options.ability = resolvedAbility;
		if (Number.isFinite(resolvedMod)) {
			roll0.data ??= {};
			roll0.data.mod = resolvedMod;
		}
	}
}

function getWinningAbilityOverride(ac5eConfig, hookType) {
	const forcedCandidates = [
		ac5eConfig?.options?.activityAbilityResolved,
		ac5eConfig?.options?._abilityOverrideResolvedAtUse,
		ac5eConfig?.preAC5eConfig?.activityAbilityResolved,
		ac5eConfig?.preAC5eConfig?._abilityOverrideResolvedAtUse,
	];
	for (const candidate of forcedCandidates) {
		if (!isValidAbilityKey(candidate)) continue;
		if (globalThis.ac5e?.debug?.abilityOverrideTrace) console.warn('AC5E TRACE rollBuild.getWinningAbilityOverride.forced', { hookType, candidate });
		return candidate;
	}
	const entries = [
		...(Array.isArray(ac5eConfig?.subject?.abilityOverride) ? ac5eConfig.subject.abilityOverride : []),
		...(Array.isArray(ac5eConfig?.opponent?.abilityOverride) ? ac5eConfig.opponent.abilityOverride : []),
	].filter((entry) => entry && typeof entry === 'object' && (!entry.hook || entry.hook === hookType) && entry.optin);
	if (!entries.length) return null;
	const selectedIds = new Set(Object.keys(ac5eConfig?.optinSelected ?? {}).filter((key) => ac5eConfig.optinSelected[key]));
	let winner = null;
	for (const entry of entries) {
		if (!entry.forceOptin && !selectedIds.has(entry.id)) continue;
		const raw = entry?.set?.trim()?.toLowerCase?.();
		if (!raw) continue;
		let resolved = raw;
		if (raw === 'spellcasting') {
			const actorSpellcasting =
				ac5eConfig?.options?.activity?.spellcastingAbility
				?? ac5eConfig?.options?.item?.actor?.system?.attributes?.spellcasting
				?? ac5eConfig?.options?.spellcastingAbility;
			resolved = actorSpellcasting?.trim?.()?.toLowerCase?.() ?? '';
		}
		if (!isValidAbilityKey(resolved)) continue;
		const score = Number.isFinite(entry?.priority) ? entry.priority : 0;
		if (!winner || score >= winner.score) winner = { resolved, score };
	}
	if (globalThis.ac5e?.debug?.abilityOverrideTrace) {
		console.warn(`AC5E TRACE rollBuild.getWinningAbilityOverride.optins ${JSON.stringify({
			hookType,
			selectedIds: [...selectedIds],
			candidateCount: entries.length,
			winner: winner ? { resolved: winner.resolved, score: winner.score } : null,
		})}`);
	}
	if (!winner) return null;
	const normalized = winner.resolved;
	if (!isValidAbilityKey(normalized)) return null;
	return normalized;
}

function isValidAbilityKey(value) {
	const normalized = value?.trim?.()?.toLowerCase?.();
	if (!normalized) return false;
	return Object.hasOwn(CONFIG?.DND5E?.abilities ?? {}, normalized);
}

