import { _entryMatchesTransientState, _getMessageDnd5eFlags, _getMessageFlagScope, _getTooltip, _restoreD20ConfigFromFrozenBaseline } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { applyOptinCriticalToDamageConfig, syncCriticalStaticBonusDamageRollOptions } from './ac5e-hooks-dialog-damage-state.mjs';
import { setOptinSelections } from './ac5e-hooks-dialog-optins.mjs';
import { appendPartsToD20Config, collectPreservedExternalD20Parts, getD20ActivePartsSnapshot, refreshAttackAutoRangeState } from './ac5e-hooks-dialog-d20-state.mjs';
import { getMessageForConfigTargets } from './ac5e-hooks-target-attack.mjs';
import { getMessageTargetsFromFlags, resolveTargets, syncTargetsToConfigAndMessage } from './ac5e-hooks-target-context.mjs';
import { applyExplicitModeOverride } from './ac5e-hooks-roll-post.mjs';
import { getBonusEntriesForHook } from './ac5e-hooks-roll-selections.mjs';
import { applyTargetADCStateToD20Config, rebuildOptinTargetADCState } from './ac5e-hooks-roll-target-adc.mjs';

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
		applyOptinCriticalToDamageConfig(ac5eConfig, rollConfig, formData);
		syncCriticalStaticBonusDamageRollOptions(ac5eConfig, rollConfig?.rolls);
		syncRollOptinSelections(ac5eConfig, rollConfig);
		syncChatTooltipToRollConfigs(ac5eConfig, rollConfig);
		return true;
	}
	if (!ac5eConfig.hookType || !['attack', 'save', 'check'].includes(ac5eConfig.hookType)) return true;
	if (index !== 0) return true;

	const preRestoreParts = getD20ActivePartsSnapshot(rollConfig);
	_restoreD20ConfigFromFrozenBaseline(ac5eConfig, rollConfig);
	const preservedExternalParts = collectPreservedExternalD20Parts(ac5eConfig, preRestoreParts);
	const optins = getOptinsFromForm(formData);
	setOptinSelections(ac5eConfig, optins);
	if (ac5eConfig.hookType === 'attack') refreshAttackAutoRangeState(ac5eConfig, rollConfig);
	if (ac5e?.debugTargetADC)
		console.warn('AC5E targetADC: buildRollConfig entries', {
			hook: ac5eConfig.hookType,
			subjectTargetADC: ac5eConfig?.subject?.targetADC,
			opponentTargetADC: ac5eConfig?.opponent?.targetADC,
			optins,
		});
	const { targetADCEntries } = rebuildOptinTargetADCState(ac5eConfig, rollConfig);
	if (ac5e?.debugTargetADC)
		console.warn('AC5E targetADC: selected', {
			targetADCEntries,
			optinSelected: ac5eConfig.optinSelected,
			targetADC: ac5eConfig.targetADC,
		});
	rollConfig.advantage = undefined;
	rollConfig.disadvantage = undefined;
	deps.calcAdvantageMode(ac5eConfig, rollConfig, undefined, undefined, { skipSetProperties: true });
	applyExplicitModeOverride(ac5eConfig, rollConfig);
	applyTargetADCStateToD20Config(ac5eConfig, rollConfig, { syncAttackTargets: true });
	if (ac5e?.debugTargetADC)
		console.warn('AC5E targetADC: buildRollConfig target', {
			hook: ac5eConfig.hookType,
			configTarget: rollConfig.target,
			rollTarget: rollConfig?.rolls?.[0]?.target,
			rollOptionsTarget: rollConfig?.rolls?.[0]?.options?.target,
			alteredTargetADC: ac5eConfig.alteredTargetADC,
		});
	const roll0 = getExistingRoll(rollConfig, 0);
	const roll0Options = getExistingRollOptions(rollConfig, 0);
	const nextDefaultButton = ac5eConfig.defaultButton ?? 'normal';
	ac5eConfig.defaultButton = nextDefaultButton;
	if (Object.isExtensible(options)) {
		options.advantage = rollConfig.advantage;
		options.disadvantage = rollConfig.disadvantage;
		options.advantageMode = ac5eConfig.advantageMode ?? options.advantageMode;
		options.defaultButton = nextDefaultButton;
		rollConfig.options = options;
	}
	if (roll0Options && Object.isExtensible(roll0Options)) {
		roll0.options.advantage = rollConfig.advantage;
		roll0.options.disadvantage = rollConfig.disadvantage;
		roll0.options.advantageMode = options.advantageMode;
	}
	if (rollConfig?.rolls?.length) {
		for (const roll of rollConfig.rolls) {
			if (!roll?.options) continue;
			roll.options[Constants.MODULE_ID] ??= {};
			roll.options[Constants.MODULE_ID].optinSelected = ac5eConfig.optinSelected;
			roll.options[Constants.MODULE_ID].defaultButton = ac5eConfig.defaultButton;
			roll.options[Constants.MODULE_ID].advantageMode = ac5eConfig.advantageMode;
			roll.options[Constants.MODULE_ID].hasTransitAdvantage = !!ac5eConfig.hasTransitAdvantage;
			roll.options[Constants.MODULE_ID].hasTransitDisadvantage = !!ac5eConfig.hasTransitDisadvantage;
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

function getExistingRoll(config, index = 0) {
	if (!Array.isArray(config?.rolls)) return undefined;
	const roll = config.rolls[index];
	return roll && typeof roll === 'object' ? roll : undefined;
}

function getExistingRollOptions(config, index = 0) {
	const roll = getExistingRoll(config, index);
	const options = roll?.options;
	return options && typeof options === 'object' ? options : undefined;
}
