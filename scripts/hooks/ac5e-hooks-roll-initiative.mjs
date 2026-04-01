import { _getTooltip } from '../ac5e-helpers.mjs';
import { _getConfig } from '../ac5e-config-logic.mjs';

export function preConfigureInitiative(subject, rollConfig, hook, deps) {
	const subjectToken = subject.token?.object ?? subject.getActiveTokens()[0];
	const config = rollConfig.options;
	const options = {
		isInitiative: true,
		hook,
		preConfigInitiative: true,
	};
	const initAbility = rollConfig.data?.attributes?.init?.ability;
	options.ability = initAbility === '' ? 'dex' : initAbility;
	let ac5eConfig = _getConfig(config, {}, hook, subjectToken?.id, undefined, options);
	if (ac5eConfig.returnEarly) {
		_getTooltip(ac5eConfig);
		foundry.utils.mergeObject(rollConfig.options, { [deps.Constants.MODULE_ID]: ac5eConfig });
		return ac5eConfig;
	}

	ac5eConfig = deps.ac5eChecks({ ac5eConfig, subjectToken, opponentToken: undefined });

	clearSuppressedInitiativeModes(ac5eConfig);
	importInitialInitiativeModeAttribution(ac5eConfig, config);
	const advantageMode = getInitiativeAdvantageMode(ac5eConfig);
	if (ac5eConfig.parts.length) rollConfig.parts = rollConfig.parts.concat(ac5eConfig.parts);
	applyInitiativeModeToRollOptions(rollConfig.options, advantageMode);

	ac5eConfig.advantageMode = advantageMode;
	ac5eConfig.defaultButton =
		advantageMode === 0 ? 'normal'
		: advantageMode > 0 ? 'advantage'
		: 'disadvantage';
	_getTooltip(ac5eConfig);
	foundry.utils.mergeObject(rollConfig.options, { [deps.Constants.MODULE_ID]: ac5eConfig });
	if (deps.hookDebugEnabled('preConfigureInitiativeHook')) console.warn('AC5E._preConfigureInitiative', { ac5eConfig });
	return ac5eConfig;
}

function clearSuppressedInitiativeModes(ac5eConfig) {
	if (!foundry.utils.isEmpty(ac5eConfig.subject.noAdvantage)) {
		ac5eConfig.subject.advantage = [];
		ac5eConfig.opponent.advantage = [];
		ac5eConfig.subject.advantageNames = new Set();
		ac5eConfig.opponent.advantageNames = new Set();
	}
	if (!foundry.utils.isEmpty(ac5eConfig.subject.noDisadvantage)) {
		ac5eConfig.subject.disadvantage = [];
		ac5eConfig.opponent.disadvantage = [];
		ac5eConfig.subject.disadvantageNames = new Set();
		ac5eConfig.opponent.disadvantageNames = new Set();
	}
}

function getInitiativeAdvantageMode(ac5eConfig) {
	const hasForcedAdvantage = hasEntries(ac5eConfig.subject.forcedAdvantage) || hasEntries(ac5eConfig.opponent.forcedAdvantage);
	const hasForcedDisadvantage = hasEntries(ac5eConfig.subject.forcedDisadvantage) || hasEntries(ac5eConfig.opponent.forcedDisadvantage);
	if (hasForcedAdvantage && !hasForcedDisadvantage) return 1;
	if (hasForcedDisadvantage && !hasForcedAdvantage) return -1;
	const hasAdvantage =
		hasEntries(ac5eConfig.subject.advantage) ||
		hasEntries(ac5eConfig.opponent.advantage) ||
		hasEntries(ac5eConfig.subject.advantageNames) ||
		hasEntries(ac5eConfig.opponent.advantageNames) ||
		Number(ac5eConfig?.systemRollMode?.adv ?? 0) > 0;
	const hasDisadvantage =
		hasEntries(ac5eConfig.subject.disadvantage) ||
		hasEntries(ac5eConfig.opponent.disadvantage) ||
		hasEntries(ac5eConfig.subject.disadvantageNames) ||
		hasEntries(ac5eConfig.opponent.disadvantageNames) ||
		Number(ac5eConfig?.systemRollMode?.dis ?? 0) > 0;
	if (hasAdvantage && !hasDisadvantage) return 1;
	if (hasDisadvantage && !hasAdvantage) return -1;
	return 0;
}

function applyInitiativeModeToRollOptions(options, advantageMode) {
	options.advantageMode = advantageMode;
	if (advantageMode > 0) {
		options.advantage = true;
		options.disadvantage = false;
	} else if (advantageMode < 0) {
		options.advantage = false;
		options.disadvantage = true;
	} else {
		options.advantage = true;
		options.disadvantage = true;
	}
}

function importInitialInitiativeModeAttribution(ac5eConfig, config) {
	const subject = ac5eConfig?.subject;
	if (!subject) return;
	subject.advantageNames ??= new Set();
	subject.disadvantageNames ??= new Set();
	const preConfig = ac5eConfig?.preAC5eConfig ?? {};
	const returnEarly = !preConfig.deferD20KeypressToMidi && preConfig.skipDialogNormal && (preConfig.skipDialogAdvantage || preConfig.skipDialogDisadvantage);
	const keypressAdvantageSource = !preConfig.deferD20KeypressToMidi && preConfig.skipDialogAdvantage && !returnEarly;
	const keypressDisadvantageSource = !preConfig.deferD20KeypressToMidi && preConfig.skipDialogDisadvantage && !returnEarly;
	const resolvedAdvantageMode =
		typeof preConfig?.advantageMode === 'number' ? preConfig.advantageMode
		: typeof config?.advantageMode === 'number' ? config.advantageMode
		: null;
	const incomingAdvantage =
		typeof resolvedAdvantageMode === 'number' ? resolvedAdvantageMode > 0
		: preConfig.adv === true || config?.advantage === true;
	const incomingDisadvantage =
		typeof resolvedAdvantageMode === 'number' ? resolvedAdvantageMode < 0
		: preConfig.dis === true || config?.disadvantage === true;
	if (incomingAdvantage && !keypressAdvantageSource) subject.advantageNames.add(getInitiativeSourceLabel());
	if (incomingDisadvantage && !keypressDisadvantageSource) subject.disadvantageNames.add(getInitiativeSourceLabel());
}

function getInitiativeSourceLabel() {
	const localize = (key) => game.i18n?.localize?.(key) ?? key;
	const systemModeLabel = localize('AC5E.SystemMode');
	const initiativeLabel = localize('DND5E.Initiative');
	return `${systemModeLabel} (${initiativeLabel})`;
}

function hasEntries(value) {
	return (
		typeof value?.size === 'number' ? value.size
		: Array.isArray(value) || typeof value === 'string' ? value.length
		: 0
	);
}
