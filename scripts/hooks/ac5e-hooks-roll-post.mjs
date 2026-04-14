import { _activeModule, _getMessageDnd5eFlags, _getMessageFlagScope, _getTooltip, _setMessageFlagScope, debugRollStateMigration, getResolvedD20BooleansFromMode, getRollModeCounts } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { _applyPendingUses } from '../ac5e-setpieces.mjs';
import { syncMidiResolvedAdvantageMode } from './ac5e-hooks-roll-midi.mjs';
import { getPersistedTargetsForHook, syncResolvedTargetsToMessage } from './ac5e-hooks-target-context.mjs';
import { refreshAttackTargetsForSubmission } from './ac5e-hooks-target-attack.mjs';
import { getExistingRoll, getExistingRollOptions } from './ac5e-hooks-ui-utils.mjs';

export function postRollConfiguration(rolls, config, dialog, message, hook, deps) {
	if (deps.buildDebug || deps.hookDebugEnabled('postRollConfigurationHook')) console.warn('AC5E._postRollConfiguration', { hook, rolls, config, dialog, message });
	if (!config) return true;
	syncRollReferencesToConfig(rolls, config);
	const options = config.options ?? {};
	const ac5eConfig = getPostRollAc5eConfig(rolls, config, dialog);
	const stableModeCounts = ac5eConfig?.modeCounts && typeof ac5eConfig.modeCounts === 'object' ? foundry.utils.duplicate(ac5eConfig.modeCounts) : null;
	reconcileResolvedD20Mode(ac5eConfig, config, rolls, message);
	syncChatRollPayloads(rolls, message, ac5eConfig, deps);
	normalizeCollapsedMidiD20Mode(ac5eConfig, config, rolls, options, deps);
	syncMidiResolvedAdvantageMode(ac5eConfig, config, dialog, rolls, {
		hookDebugEnabled: deps.hookDebugEnabled,
		getExplicitModeOverride,
	});
	refreshAttackTargetsForSubmission(dialog, config, ac5eConfig, message, {
		calcAdvantageMode: deps.calcAdvantageMode,
		applyExplicitModeOverride,
	});
	syncPostRollTargets(ac5eConfig, config, rolls, message);
	applyPendingUsesIfNeeded(ac5eConfig, rolls);
	restoreStableModeCounts(ac5eConfig, config, rolls, stableModeCounts);
	debugRollStateMigration('postRoll', { hook, config, rolls, ac5eConfig, extra: { hasMessage: !!message } });
	return true;
}

function syncRollReferencesToConfig(rolls, config) {
	if (!Array.isArray(config?.rolls) && Array.isArray(rolls)) {
		config.rolls = rolls;
	}
	if (!Array.isArray(rolls) || !Array.isArray(config?.rolls)) return;
	for (let index = 0; index < rolls.length; index++) {
		const rollOptions = rolls[index]?.options?.[Constants.MODULE_ID];
		if (!rollOptions) continue;
		const configRollOptions = getExistingRollOptions(config, index);
		if (!configRollOptions) continue;
		const existing = configRollOptions[Constants.MODULE_ID];
		configRollOptions[Constants.MODULE_ID] = chooseRicherAc5eCandidate(existing, rollOptions) ?? rollOptions;
	}
}

function scoreAc5eCandidate(candidate) {
	if (!candidate || typeof candidate !== 'object') return -1;
	const counts = candidate?.modeCounts;
	const hasModeCounts = counts && typeof counts === 'object' && (
		Number(counts?.advantages?.total ?? 0) > 0 ||
		Number(counts?.disadvantages?.total ?? 0) > 0 ||
		Number(counts?.noAdvantages?.total ?? 0) > 0 ||
		Number(counts?.noDisadvantages?.total ?? 0) > 0
	);
	const hasSides = Boolean(candidate?.subject || candidate?.opponent);
	const hasHook = typeof candidate?.hookType === 'string' && candidate.hookType.trim().length > 0;
	const hasTooltip = typeof candidate?.chatTooltip === 'string' || candidate?.tooltipObj;
	const hasOptions = candidate?.options && typeof candidate.options === 'object';
	const hasPending = Array.isArray(candidate?.pendingUses) || Array.isArray(candidate?.damageModifiers) || Array.isArray(candidate?.extraDice);
	return (hasModeCounts ? 16 : 0) + (hasSides ? 8 : 0) + (hasOptions ? 4 : 0) + (hasHook ? 2 : 0) + (hasTooltip ? 1 : 0) + (hasPending ? 1 : 0);
}

function chooseRicherAc5eCandidate(left, right) {
	if (!left || typeof left !== 'object') return right;
	if (!right || typeof right !== 'object') return left;
	return scoreAc5eCandidate(right) > scoreAc5eCandidate(left) ? right : left;
}

function getPostRollAc5eConfig(rolls, config, dialog) {
	const options = config?.options ?? {};
	const candidates = [
		config?.rolls?.[0]?.options?.[Constants.MODULE_ID],
		options[Constants.MODULE_ID],
		config?.[Constants.MODULE_ID],
		dialog?.config?.options?.[Constants.MODULE_ID],
		rolls?.[0]?.options?.[Constants.MODULE_ID],
	].filter((candidate) => candidate && typeof candidate === 'object');
	if (!candidates.length) return undefined;
	return candidates.reduce((best, candidate) => chooseRicherAc5eCandidate(best, candidate), candidates[0]);
}

function restoreStableModeCounts(ac5eConfig, config, rolls, stableModeCounts) {
	if (!stableModeCounts || typeof stableModeCounts !== 'object') return;
	if (ac5eConfig && typeof ac5eConfig === 'object') ac5eConfig.modeCounts = foundry.utils.duplicate(stableModeCounts);
	if (config?.options?.[Constants.MODULE_ID] && typeof config.options[Constants.MODULE_ID] === 'object') {
		config.options[Constants.MODULE_ID].modeCounts = foundry.utils.duplicate(stableModeCounts);
	}
	if (Array.isArray(config?.rolls)) {
		for (const roll of config.rolls) {
			if (!roll?.options?.[Constants.MODULE_ID] || typeof roll.options[Constants.MODULE_ID] !== 'object') continue;
			roll.options[Constants.MODULE_ID].modeCounts = foundry.utils.duplicate(stableModeCounts);
		}
	}
	if (Array.isArray(rolls)) {
		for (const roll of rolls) {
			if (!roll?.options?.[Constants.MODULE_ID] || typeof roll.options[Constants.MODULE_ID] !== 'object') continue;
			roll.options[Constants.MODULE_ID].modeCounts = foundry.utils.duplicate(stableModeCounts);
		}
	}
}

function reconcileResolvedD20Mode(ac5eConfig, config, rolls, message) {
	if (!['attack', 'check', 'save'].includes(ac5eConfig?.hookType) || !Array.isArray(rolls) || !rolls[0]?.options) return;
	const resolvedAction = getActionFromResolvedD20Mode(rolls[0].options.advantageMode);
	const proposedAction = getProposedModeOverrideAction(ac5eConfig) || 'normal';
	const configRoll0Options = getExistingRollOptions(config, 0);
	const existingExplicitOverride = getExplicitModeOverride(ac5eConfig);
	mirrorD20ModeState(ac5eConfig, config, { action: resolvedAction, rollOptions: rolls[0].options });
	if (resolvedAction !== proposedAction) {
		const overrideSource = existingExplicitOverride?.replacesCalculatedMode && existingExplicitOverride?.source === 'keypress' ? 'keypress' : 'dialog';
		const override = setExplicitModeOverride(ac5eConfig, { action: resolvedAction, source: overrideSource, force: true });
		if (configRoll0Options && typeof configRoll0Options === 'object') {
			configRoll0Options[Constants.MODULE_ID] ??= {};
			configRoll0Options[Constants.MODULE_ID].explicitModeOverride = override;
		}
		rolls[0].options[Constants.MODULE_ID] ??= {};
		rolls[0].options[Constants.MODULE_ID].explicitModeOverride = override;
	} else if (getExplicitModeOverride(ac5eConfig)?.source === 'dialog') {
		clearExplicitModeOverride(ac5eConfig);
	}
	_getTooltip(ac5eConfig);
	if (message && typeof message === 'object') _setMessageFlagScope(message, Constants.MODULE_ID, { tooltipObj: ac5eConfig.tooltipObj, hookType: ac5eConfig.hookType }, { merge: true });
}

function syncChatRollPayloads(rolls, message, ac5eConfig, deps) {
	if (!message || !Array.isArray(rolls)) return;
	for (const roll of rolls) {
		if (!roll?.options || typeof roll.options !== 'object') continue;
		const rollAc5eConfig = roll.options?.[Constants.MODULE_ID];
		if (!rollAc5eConfig || typeof rollAc5eConfig !== 'object') continue;
		const payload = deps.buildChatRollPayload(rollAc5eConfig, {
			chatTooltip:
				typeof rollAc5eConfig?.chatTooltip === 'string' && rollAc5eConfig.chatTooltip.trim() ? rollAc5eConfig.chatTooltip
				: rollAc5eConfig?.hookType && ac5eConfig?.tooltipObj?.[rollAc5eConfig.hookType] ? ac5eConfig.tooltipObj[rollAc5eConfig.hookType]
				: typeof rollAc5eConfig?.hookType === 'string' && rollAc5eConfig.hookType && rollAc5eConfig !== ac5eConfig ? _getTooltip(rollAc5eConfig)
				: typeof ac5eConfig?.hookType === 'string' && ac5eConfig?.hookType === rollAc5eConfig?.hookType ? _getTooltip(ac5eConfig)
				: '',
		});
		if (payload) roll.options[Constants.MODULE_ID] = payload;
	}
}

export function buildChatRollPayload(ac5eConfig, { chatTooltip } = {}) {
	const hookType = String(ac5eConfig?.hookType ?? '').trim();
	if (!hookType) return null;
	const modeCounts = ac5eConfig?.modeCounts ?? getRollModeCounts(ac5eConfig, { persist: false });
	const payload = {
		hookType,
		chatTooltip: typeof chatTooltip === 'string' ? chatTooltip : String(ac5eConfig?.chatTooltip ?? '').trim(),
	};
	if (modeCounts && typeof modeCounts === 'object') payload.modeCounts = foundry.utils.duplicate(modeCounts);
	if (ac5eConfig?.hasTransitAdvantage) payload.hasTransitAdvantage = true;
	if (ac5eConfig?.hasTransitDisadvantage) payload.hasTransitDisadvantage = true;
	if (hookType !== 'attack' && hookType !== 'damage' && !!ac5eConfig?.preAC5eConfig?.forceChatTooltip) payload.forceAc5eD20Tooltip = true;
	return payload;
}

function normalizeCollapsedMidiD20Mode(ac5eConfig, config, rolls, options, deps) {
	if (!_activeModule('midi-qol') || !['attack', 'check', 'save'].includes(ac5eConfig?.hookType) || !Array.isArray(rolls) || !rolls[0]?.options) return;
	const advModes = CONFIG?.Dice?.D20Roll?.ADV_MODE;
	const currentMode = rolls[0].options.advantageMode;
	const isNonNormalMode = advModes && (currentMode === advModes.ADVANTAGE || currentMode === advModes.DISADVANTAGE);
	if (!isNonNormalMode || getExplicitModeOverride(ac5eConfig)?.replacesCalculatedMode) return;
	const modeCounts = ac5eConfig?.modeCounts ?? getRollModeCounts(ac5eConfig, { persist: false });
	const hasAdvReasons = modeCounts?.advantages?.present;
	const hasDisReasons = modeCounts?.disadvantages?.present;
	const d20Dice = (Array.isArray(rolls[0].dice) ? rolls[0].dice : []).filter((die) => Number(die?.faces) === 20);
	const hasSingleD20Result = d20Dice.length && d20Dice.every((die) => !Array.isArray(die?.results) || die.results.length <= 1);
	if (!hasAdvReasons || !hasDisReasons || !hasSingleD20Result) return;
	mirrorD20ModeState(ac5eConfig, config, { action: 'normal', advantageMode: advModes.NORMAL, defaultButton: 'normal', rollOptions: rolls[0].options });
	if (options && typeof options === 'object') {
		options.advantage = config.advantage;
		options.disadvantage = config.disadvantage;
		options.advantageMode = advModes.NORMAL;
		options.defaultButton = 'normal';
	}
	if (deps.hookDebugEnabled('postRollConfigurationHook')) console.warn('AC5E postRollConfiguration normalized non-multi d20 advantageMode', { currentMode, roll: rolls[0] });
}

function syncPostRollTargets(ac5eConfig, config, rolls, message) {
	if (ac5eConfig?.hookType === 'attack') {
		const currentTargets = getPersistedTargetsForHook(ac5eConfig, config, message, { getMessageDnd5eFlags: _getMessageDnd5eFlags });
		const finiteAcs = currentTargets.map((target) => Number(target?.ac)).filter((value) => Number.isFinite(value));
		const nextTarget = finiteAcs.length ? Math.min(...finiteAcs) : undefined;
		if (nextTarget !== undefined) {
			if (Array.isArray(rolls)) {
				const roll0Options = rolls[0]?.options;
				if (roll0Options && typeof roll0Options === 'object') roll0Options.target = nextTarget;
			}
			const configRoll0Options = getExistingRollOptions(config, 0);
			if (configRoll0Options) configRoll0Options.target = nextTarget;
		}
		syncResolvedTargetsToMessage(message, foundry.utils.duplicate(currentTargets), { Constants, getMessageFlagScope: _getMessageFlagScope });
		return;
	}
	if (ac5eConfig?.hookType !== 'damage') return;
	const currentTargets = getPersistedTargetsForHook(ac5eConfig, config, message, { getMessageDnd5eFlags: _getMessageDnd5eFlags });
	if (Array.isArray(currentTargets)) syncResolvedTargetsToMessage(message, foundry.utils.duplicate(currentTargets), { Constants, getMessageFlagScope: _getMessageFlagScope });
}

function applyPendingUsesIfNeeded(ac5eConfig, rolls) {
	if (!ac5eConfig?.pendingUses?.length) return;
	if (ac5eConfig.pendingUsesApplied) return;
	if (Array.isArray(rolls) && !rolls.length) return;
	const optins = ac5eConfig.optinSelected ?? {};
	const selectedIds = new Set(Object.keys(optins).filter((key) => optins[key]));
	const explicitOverride = getExplicitModeOverride(ac5eConfig);
	const pending = ac5eConfig.pendingUses
		.filter((entry) => !entry.optin || selectedIds.has(entry.id))
		.filter((entry) => entry?.modeFamily !== explicitOverride?.family || !explicitOverride?.replacesCalculatedMode);
	if (ac5e?.debug?.auraCadenceOptins) {
		const auraPending = ac5eConfig.pendingUses.filter((entry) => String(entry?.id ?? '').includes(':aura:'));
		if (auraPending.length) {
			console.warn('AC5E aura pending uses before post-roll apply', {
				selectedIds: [...selectedIds].filter((id) => String(id).includes(':aura:')),
				allAuraPending: auraPending.map((entry) => ({
					id: entry?.id,
					cadence: entry?.cadence,
					optin: entry?.optin,
					modeFamily: entry?.modeFamily,
				})),
				appliedAuraPending: pending
					.filter((entry) => String(entry?.id ?? '').includes(':aura:'))
					.map((entry) => ({
						id: entry?.id,
						cadence: entry?.cadence,
						optin: entry?.optin,
						modeFamily: entry?.modeFamily,
					})),
			});
		}
	}
	if (!pending.length) {
		ac5eConfig.pendingUsesApplied = true;
		return;
	}
	_applyPendingUses(pending);
	ac5eConfig.pendingUsesApplied = true;
}

export function getExplicitModeOverride(ac5eConfig) {
	return ac5eConfig?.explicitModeOverride && typeof ac5eConfig.explicitModeOverride === 'object' ? ac5eConfig.explicitModeOverride : null;
}

export function setExplicitModeOverride(ac5eConfig, { action, source, force = false } = {}) {
	if (!ac5eConfig || typeof ac5eConfig !== 'object') return null;
	const normalizedAction = String(action ?? '')
		.trim()
		.toLowerCase();
	const hookType = String(ac5eConfig?.hookType ?? '')
		.trim()
		.toLowerCase();
	const family = hookType === 'damage' ? 'damage' : 'd20';
	const allowedActions = family === 'damage' ? ['critical', 'normal'] : ['advantage', 'disadvantage', 'normal'];
	if (!allowedActions.includes(normalizedAction)) {
		clearExplicitModeOverride(ac5eConfig);
		return null;
	}
	const proposedAction = getProposedModeOverrideAction(ac5eConfig) || 'normal';
	const replacesCalculatedMode = force || normalizedAction !== proposedAction;
	if (!replacesCalculatedMode) {
		clearExplicitModeOverride(ac5eConfig);
		return null;
	}
	const override = {
		action: normalizedAction,
		source: source === 'dialog' ? 'dialog' : 'keypress',
		family,
		proposedAction,
		replacesCalculatedMode: true,
	};
	ac5eConfig.explicitModeOverride = override;
	ac5eConfig.explicitRollDialogAction = family === 'd20' ? normalizedAction : undefined;
	ac5eConfig.explicitRollDialogOverride = family === 'd20';
	clearTooltipCacheForHook(ac5eConfig);
	return override;
}

export function applyExplicitModeOverride(ac5eConfig, config) {
	const override = getExplicitModeOverride(ac5eConfig);
	if (!override?.replacesCalculatedMode || !config) return false;
	const { action, family } = override;
	const roll0 = getExistingRoll(config, 0);
	const roll0Options = getExistingRollOptions(config, 0);
	if (family === 'damage') {
		const isCritical = action === 'critical';
		config.isCritical = isCritical;
		ac5eConfig.isCritical = isCritical;
		ac5eConfig.defaultButton = action;
		if (config.midiOptions && typeof config.midiOptions === 'object') config.midiOptions.isCritical = isCritical;
		if (Array.isArray(config.rolls)) {
			for (const roll of config.rolls) {
				if (!roll?.options || typeof roll.options !== 'object') continue;
				roll.options.isCritical = isCritical;
				roll.options[Constants.MODULE_ID] ??= {};
				roll.options[Constants.MODULE_ID].defaultButton = action;
				roll.options[Constants.MODULE_ID].explicitModeOverride = override;
			}
		}
		return true;
	}
	const nextState = mirrorD20ModeState(ac5eConfig, config, { action, defaultButton: action, explicitOverride: override, rollOptions: roll0Options });
	if (!nextState) return false;
	if (roll0?.options?.[Constants.MODULE_ID] && typeof roll0.options[Constants.MODULE_ID] === 'object') {
		roll0.options[Constants.MODULE_ID].explicitRollDialogOverride = true;
		roll0.options[Constants.MODULE_ID].explicitModeOverride = override;
	}
	return true;
}

function getProposedModeOverrideAction(ac5eConfig) {
	return String(ac5eConfig?.proposedButton ?? ac5eConfig?.calculatedDefaultButton ?? ac5eConfig?.defaultButton ?? '')
		.trim()
		.toLowerCase();
}

function getActionFromResolvedD20Mode(mode) {
	const advModes = CONFIG?.Dice?.D20Roll?.ADV_MODE;
	if (!advModes) return 'normal';
	if (mode === advModes.ADVANTAGE) return 'advantage';
	if (mode === advModes.DISADVANTAGE) return 'disadvantage';
	return 'normal';
}

function clearTooltipCacheForHook(ac5eConfig) {
	const hookType = String(ac5eConfig?.hookType ?? '').trim();
	if (!hookType) return;
	if (ac5eConfig?.tooltipObj && typeof ac5eConfig.tooltipObj === 'object') delete ac5eConfig.tooltipObj[hookType];
}

export function mirrorD20ModeState(ac5eConfig, config, { action, advantageMode, defaultButton, explicitOverride, rollOptions } = {}) {
	if (!config) return null;
	const advModes = CONFIG?.Dice?.D20Roll?.ADV_MODE;
	if (!advModes) return null;
	const normalizedAction =
		typeof action === 'string' && action.trim() ? action.trim().toLowerCase()
		: typeof advantageMode === 'number' ? getActionFromResolvedD20Mode(advantageMode)
		: getActionFromResolvedD20Mode(ac5eConfig?.advantageMode);
	const resolvedMode =
		typeof advantageMode === 'number' ? advantageMode
		: normalizedAction === 'advantage' ? advModes.ADVANTAGE
		: normalizedAction === 'disadvantage' ? advModes.DISADVANTAGE
		: advModes.NORMAL;
	const nextDefaultButton =
		typeof defaultButton === 'string' && defaultButton.trim() ? defaultButton.trim().toLowerCase()
		: normalizedAction;
	const resolvedButtons = getResolvedD20BooleansFromMode(resolvedMode, {
		advantage: config?.advantage,
		disadvantage: config?.disadvantage,
	});
	if (resolvedButtons.advantage !== undefined) config.advantage = resolvedButtons.advantage;
	if (resolvedButtons.disadvantage !== undefined) config.disadvantage = resolvedButtons.disadvantage;
	config.options ??= {};
	config.options.advantage = config.advantage;
	config.options.disadvantage = config.disadvantage;
	config.options.advantageMode = resolvedMode;
	config.options.defaultButton = nextDefaultButton;
	config.options[Constants.MODULE_ID] ??= {};
	config.options[Constants.MODULE_ID].advantageMode = resolvedMode;
	config.options[Constants.MODULE_ID].defaultButton = nextDefaultButton;
	if (explicitOverride !== undefined) config.options[Constants.MODULE_ID].explicitModeOverride = foundry.utils.duplicate(explicitOverride);
	const targets = [];
	if (rollOptions && typeof rollOptions === 'object') targets.push(rollOptions);
	const configRoll0Options = getExistingRollOptions(config, 0);
	if (configRoll0Options && configRoll0Options !== rollOptions) targets.push(configRoll0Options);
	for (const target of targets) {
		target.advantage = config.advantage;
		target.disadvantage = config.disadvantage;
		target.advantageMode = resolvedMode;
		target.defaultButton = nextDefaultButton;
	}
	const roll0 = getExistingRoll(config, 0);
	if (roll0?.options?.[Constants.MODULE_ID] && typeof roll0.options[Constants.MODULE_ID] === 'object') {
		roll0.options[Constants.MODULE_ID].advantageMode = resolvedMode;
		roll0.options[Constants.MODULE_ID].defaultButton = nextDefaultButton;
		if (explicitOverride !== undefined) roll0.options[Constants.MODULE_ID].explicitModeOverride = explicitOverride;
	}
	if (ac5eConfig && typeof ac5eConfig === 'object') {
		ac5eConfig.advantageMode = resolvedMode;
		ac5eConfig.defaultButton = nextDefaultButton;
	}
	return {
		action: normalizedAction,
		advantage: config.advantage,
		disadvantage: config.disadvantage,
		advantageMode: resolvedMode,
		defaultButton: nextDefaultButton,
	};
}

function clearExplicitModeOverride(ac5eConfig) {
	if (!ac5eConfig || typeof ac5eConfig !== 'object') return;
	delete ac5eConfig.explicitModeOverride;
	delete ac5eConfig.explicitRollDialogAction;
	ac5eConfig.explicitRollDialogOverride = false;
	clearTooltipCacheForHook(ac5eConfig);
}

