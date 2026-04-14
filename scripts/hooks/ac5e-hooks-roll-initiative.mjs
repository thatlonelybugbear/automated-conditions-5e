import { _getTooltip, _localize, getRollModeCounts } from '../ac5e-helpers.mjs';
import { _getConfig } from '../ac5e-config-logic.mjs';
import { runAc5eInitiativePhase } from './ac5e-hooks-roll-phase.mjs';

export function preConfigureInitiative(subject, rollConfig, hook, deps) {
	const config = rollConfig.options;
	const options = {
		isInitiative: true,
		hook,
	};
	const initAbility = rollConfig.data?.attributes?.init?.ability;
	options.ability = initAbility === '' ? 'dex' : initAbility;
	const ac5eConfig = runAc5eInitiativePhase({
		hook,
		subject,
		rollConfig,
		config,
		options,
		deps,
		getConfig: _getConfig,
		applyHookState: ({ ac5eConfig: phaseConfig }) => {
			if (subject?.flags?.dnd5e?.initiativeAdv) phaseConfig.subject.advantage.push(_localize('AC5E.FlagsInitiativeAdv'));
			if (subject?.flags?.dnd5e?.initiativeDisadv) phaseConfig.subject.disadvantage.push(_localize('AC5E.FlagsInitiativeDisadv'));
			clearSuppressedInitiativeModes(phaseConfig);
			getRollModeCounts(phaseConfig, { filterOptin: false });
			const advantageMode = getInitiativeAdvantageMode(phaseConfig);
			appendInitiativeParts(rollConfig, phaseConfig.parts);
			applyInitiativeModeToRollOptions(rollConfig.options, advantageMode);
			phaseConfig.advantageMode = advantageMode;
			phaseConfig.defaultButton =
				advantageMode === 0 ? 'normal'
				: advantageMode > 0 ? 'advantage'
				: 'disadvantage';
		},
		finalizeReturnEarly: ({ ac5eConfig: phaseConfig }) => {
			_getTooltip(phaseConfig);
			foundry.utils.mergeObject(rollConfig.options, { [deps.Constants.MODULE_ID]: phaseConfig });
			return phaseConfig;
		},
		finalizeApplied: ({ ac5eConfig: phaseConfig }) => {
			_getTooltip(phaseConfig);
			foundry.utils.mergeObject(rollConfig.options, { [deps.Constants.MODULE_ID]: phaseConfig });
			if (deps.hookDebugEnabled('preConfigureInitiativeHook')) console.warn('AC5E._preConfigureInitiative', { ac5eConfig: phaseConfig });
			return phaseConfig;
		},
		debugExtra: { actor: subject?.name ?? subject?.id ?? null },
	});
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
	const counts = ac5eConfig?.modeCounts ?? getRollModeCounts(ac5eConfig, { filterOptin: false });
	return counts?.netMode ?? 0;
}

function appendInitiativeParts(rollConfig, parts = []) {
	if (!Array.isArray(parts) || !parts.length) return;
	const roll0 = rollConfig?.rolls?.[0];
	if (roll0) {
		roll0.parts = Array.isArray(roll0.parts) ? roll0.parts : [];
		roll0.parts.push(...parts);
	}
	rollConfig.parts = Array.isArray(rollConfig?.parts) ? rollConfig.parts : [];
	rollConfig.parts.push(...parts);
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
