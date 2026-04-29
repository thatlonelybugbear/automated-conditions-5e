import { _getMessageDnd5eFlags, _getMessageFlagScope, getAlteredTargetValueOrThreshold } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { syncTargetsToConfigAndMessage } from './ac5e-hooks-target-context.mjs';
import { getExistingRoll } from './ac5e-hooks-ui-utils.mjs';
import { getConfigEntriesByModes } from './ac5e-hooks-roll-selections.mjs';

export function rebuildOptinTargetADCState(ac5eConfig, rollConfig) {
	const hookType = ac5eConfig?.hookType;
	const isAttackContext = isAttackActivityContext(ac5eConfig, rollConfig);
	if (ac5eConfig?.tooltipObj && typeof ac5eConfig.tooltipObj === 'object' && hookType) {
		delete ac5eConfig.tooltipObj[hookType];
	}
	const targetADCEntries = getTargetADCEntriesForHook(ac5eConfig, hookType).filter((entry) => entry.optin);
	const baseTargetADCEntries = getTargetADCEntriesForHook(ac5eConfig, hookType)
		.filter((entry) => !entry.optin)
		.flatMap((entry) => (Array.isArray(entry.values) ? entry.values : []));
	const hasTargetADCOptins = targetADCEntries.length > 0 || Array.isArray(ac5eConfig?.optinBaseTargetADC);
	if (hasTargetADCOptins && (ac5eConfig.optinBaseTargetADCValue === undefined || isForcedSentinelAC(ac5eConfig.optinBaseTargetADCValue))) {
		ac5eConfig.optinBaseTargetADCValue = getBaseTargetADCValue(rollConfig, ac5eConfig);
	}
	if (targetADCEntries.length) {
		const selectedIds = new Set(Object.keys(ac5eConfig?.optinSelected ?? {}).filter((key) => ac5eConfig.optinSelected[key]));
		ac5eConfig.optinBaseTargetADC = [...baseTargetADCEntries];
		const baseTargetADC = ac5eConfig.optinBaseTargetADC ?? [];
		const selectedValues = [];
		for (const entry of targetADCEntries) {
			if (!selectedIds.has(entry.id)) continue;
			const values = Array.isArray(entry.values) ? entry.values : [];
			for (const value of values) selectedValues.push(value);
		}
		ac5eConfig.targetADC = [...new Set(baseTargetADC.concat(selectedValues))];
		if (selectedValues.length) {
			const baseTarget = getBaseTargetADCValue(rollConfig, ac5eConfig);
			const type = isAttackContext ? 'acBonus' : 'dcBonus';
			ac5eConfig.initialTargetADC = baseTarget;
			ac5eConfig.alteredTargetADC = getAlteredTargetValueOrThreshold(baseTarget, selectedValues, type);
		} else {
			ac5eConfig.alteredTargetADC = undefined;
			ac5eConfig.initialTargetADC = ac5eConfig.optinBaseTargetADCValue ?? ac5eConfig.initialTargetADC;
		}
	} else if (Array.isArray(ac5eConfig.optinBaseTargetADC)) {
		ac5eConfig.targetADC = [...ac5eConfig.optinBaseTargetADC];
		ac5eConfig.alteredTargetADC = undefined;
		ac5eConfig.initialTargetADC = ac5eConfig.optinBaseTargetADCValue ?? ac5eConfig.initialTargetADC;
	}
	return { targetADCEntries, hasTargetADCOptins };
}

export function applyTargetADCStateToD20Config(ac5eConfig, rollConfig, { syncAttackTargets = false } = {}) {
	const options = rollConfig.options ?? (rollConfig.options = {});
	const isAttackContext = isAttackActivityContext(ac5eConfig, rollConfig);
	const roll0Target = getExistingRoll(rollConfig, 0);
	if (ac5eConfig.alteredTargetADC !== undefined) {
		const nextTarget = ac5eConfig.alteredTargetADC;
		if (isAttackContext) {
			rollConfig.target = nextTarget;
			if (roll0Target) {
				roll0Target.target = nextTarget;
				if (roll0Target.options && typeof roll0Target.options === 'object') roll0Target.options.target = nextTarget;
			}
			options.target = nextTarget;
		} else {
			options.initialTargetADC = ac5eConfig.initialTargetADC;
			options.alteredTargetADC = ac5eConfig.alteredTargetADC;
		}
		if (isAttackContext && Array.isArray(ac5eConfig.options?.targets)) {
			for (const target of ac5eConfig.options.targets) {
				if (target && typeof target === 'object') target.ac = nextTarget;
			}
		}
	} else if (Array.isArray(ac5eConfig.optinBaseTargetADC) && ac5eConfig.optinBaseTargetADCValue !== undefined) {
		const baseTarget = getBaseTargetADCValue(rollConfig, ac5eConfig);
		ac5eConfig.optinBaseTargetADCValue = baseTarget;
		if (isAttackContext) {
			rollConfig.target = baseTarget;
			if (roll0Target) {
				roll0Target.target = baseTarget;
				if (roll0Target.options && typeof roll0Target.options === 'object') roll0Target.options.target = baseTarget;
			}
			options.target = baseTarget;
		} else {
			options.initialTargetADC = ac5eConfig.initialTargetADC ?? baseTarget;
			delete options.alteredTargetADC;
		}
		if (isAttackContext && Array.isArray(ac5eConfig.options?.targets)) {
			for (const target of ac5eConfig.options.targets) {
				if (target && typeof target === 'object') target.ac = baseTarget;
			}
		}
	}
	if (syncAttackTargets && isAttackContext) {
		syncTargetsToConfigAndMessage(ac5eConfig, ac5eConfig.options?.targets ?? [], null, {
			Constants,
			getMessageFlagScope: _getMessageFlagScope,
			getMessageDnd5eFlags: _getMessageDnd5eFlags,
		});
	}
}

function isForcedSentinelAC(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) && Math.abs(numeric) === 999;
}

function getBaseTargetADCValue(config, ac5eConfig) {
	const collectFinite = (values = []) => values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && !isForcedSentinelAC(value));
	const collectNestedAcs = (value, acc = []) => {
		if (!value || typeof value !== 'object') return acc;
		const direct = Number(value?.ac);
		if (Number.isFinite(direct) && !isForcedSentinelAC(direct)) acc.push(direct);
		for (const nested of Object.values(value)) collectNestedAcs(nested, acc);
		return acc;
	};

	const useTargetAcs = isAttackActivityContext(ac5eConfig, config);
	if (useTargetAcs) {
		const optinBaseTargetADCValue = Number(ac5eConfig?.optinBaseTargetADCValue);
		if (Number.isFinite(optinBaseTargetADCValue) && !isForcedSentinelAC(optinBaseTargetADCValue)) return optinBaseTargetADCValue;
		const byInitialTargets = collectNestedAcs(ac5eConfig?.initialTargetADCs);
		if (byInitialTargets.length) return Math.min(...byInitialTargets);
		const byPreTargets = collectNestedAcs(ac5eConfig?.preAC5eConfig?.baseTargetAcByKey);
		if (byPreTargets.length) return Math.min(...byPreTargets);
		const byTargets = collectFinite((ac5eConfig?.options?.targets ?? []).map((target) => target?.ac));
		if (byTargets.length) return Math.min(...byTargets);
	}

	const direct = collectFinite([ac5eConfig?.preAC5eConfig?.baseRoll0Options?.target, config?.rolls?.[0]?.options?.target, config?.rolls?.[0]?.target, config?.target]);
	if (direct.length) return direct[0];

	return 10;
}

function isAttackActivityContext(ac5eConfig, rollConfig) {
	const activity = ac5eConfig?.options?.activity ?? rollConfig?.options?.activity ?? rollConfig?.subject ?? null;
	return !!activity?.attack || ac5eConfig?.hookType === 'attack';
}

function getTargetADCEntriesForHook(ac5eConfig, hookType) {
	return getConfigEntriesByModes(ac5eConfig, 'targetADC', hookType, (entry) => entry.mode === 'targetADC');
}

