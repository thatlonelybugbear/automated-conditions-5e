import { _getTooltip, _localize } from '../ac5e-helpers.mjs';
import { _getConfig } from '../ac5e-config-logic.mjs';

export function preConfigureInitiative(subject, rollConfig, hook, deps) {
	const subjectToken = subject.token?.object ?? subject.getActiveTokens()[0];
	const config = rollConfig.options;
	const options = {
		isInitiative: true,
		hook,
	};
	const initAbility = rollConfig.data?.attributes?.init?.ability;
	options.ability = initAbility === '' ? 'dex' : initAbility;
	let ac5eConfig = _getConfig(config, {}, hook, subjectToken?.id, undefined, options);
	if (ac5eConfig.returnEarly) {
		_getTooltip(ac5eConfig);
		foundry.utils.mergeObject(rollConfig.options, { [deps.Constants.MODULE_ID]: ac5eConfig });
		return ac5eConfig;
	}

	if (subject?.flags?.dnd5e?.initiativeAdv) ac5eConfig.subject.advantage.push(_localize('AC5E.FlagsInitiativeAdv'));
	if (subject?.flags?.dnd5e?.initiativeDisadv) ac5eConfig.subject.disadvantage.push(_localize('AC5E.FlagsInitiativeDisadv'));
	ac5eConfig = deps.ac5eChecks({ ac5eConfig, subjectToken, opponentToken: undefined });

	clearSuppressedInitiativeModes(ac5eConfig);
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
	const subjectAdvantageNamesCount = getCount(ac5eConfig.subject.advantageNames);
	const opponentAdvantageNamesCount = getCount(ac5eConfig.opponent.advantageNames);
	const subjectDisadvantageNamesCount = getCount(ac5eConfig.subject.disadvantageNames);
	const opponentDisadvantageNamesCount = getCount(ac5eConfig.opponent.disadvantageNames);
	let advantageMode = 0;
	if (ac5eConfig.subject.advantage.length || ac5eConfig.opponent.advantage.length || subjectAdvantageNamesCount || opponentAdvantageNamesCount) advantageMode += 1;
	if (ac5eConfig.subject.disadvantage.length || ac5eConfig.opponent.disadvantage.length || subjectDisadvantageNamesCount || opponentDisadvantageNamesCount) advantageMode -= 1;
	return advantageMode;
}

function applyInitiativeModeToRollOptions(options, advantageMode) {
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

function getCount(value) {
	return (
		typeof value?.size === 'number' ? value.size
		: Array.isArray(value) || typeof value === 'string' ? value.length
		: 0
	);
}
