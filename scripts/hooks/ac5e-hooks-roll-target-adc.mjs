import { _getMessageDnd5eFlags, _getMessageFlagScope, getAlteredTargetValueOrThreshold } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { syncTargetsToConfigAndMessage } from './ac5e-hooks-target-context.mjs';

export function rebuildOptinTargetADCState(ac5eConfig, rollConfig) {
	const hookType = ac5eConfig?.hookType;
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
			const type = hookType === 'attack' ? 'acBonus' : 'dcBonus';
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
	const hookType = ac5eConfig?.hookType;
	const isAttackHook = hookType === 'attack';
	const isAttackLikeHook = isAttackHook || hookType === 'damage';
	const roll0Target = getExistingRoll(rollConfig, 0);
	if (ac5eConfig.alteredTargetADC !== undefined) {
		const nextTarget = ac5eConfig.alteredTargetADC;
		if (isAttackLikeHook) {
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
		if (isAttackHook && Array.isArray(ac5eConfig.options?.targets)) {
			for (const target of ac5eConfig.options.targets) {
				if (target && typeof target === 'object') target.ac = nextTarget;
			}
		}
	} else if (Array.isArray(ac5eConfig.optinBaseTargetADC) && ac5eConfig.optinBaseTargetADCValue !== undefined) {
		const baseTarget = getBaseTargetADCValue(rollConfig, ac5eConfig);
		ac5eConfig.optinBaseTargetADCValue = baseTarget;
		if (isAttackLikeHook) {
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
		if (isAttackHook && Array.isArray(ac5eConfig.options?.targets)) {
			for (const target of ac5eConfig.options.targets) {
				if (target && typeof target === 'object') target.ac = baseTarget;
			}
		}
	}
	if (syncAttackTargets && isAttackHook) {
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

	const hookType = ac5eConfig?.hookType;
	const useTargetAcs = hookType === 'attack' || hookType === 'damage';
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

function getTargetADCEntriesForHook(ac5eConfig, hookType) {
	const subjectEntries = Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC : [];
	const opponentEntries = Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC : [];
	return subjectEntries.concat(opponentEntries).filter((entry) => entry && typeof entry === 'object' && entry.mode === 'targetADC' && (!entry.hook || entry.hook === hookType));
}

function getExistingRoll(config, index = 0) {
	if (!Array.isArray(config?.rolls)) return undefined;
	const roll = config.rolls[index];
	return roll && typeof roll === 'object' ? roll : undefined;
}
