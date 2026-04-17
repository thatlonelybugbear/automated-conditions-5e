import { _getMessageDnd5eFlags, _getMessageFlagScope, _resolveUseMessageContext } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { refreshAttackAutoRangeState } from './ac5e-hooks-dialog-d20-state.mjs';
import { getAssociatedRollMessage } from './ac5e-hooks-message-association.mjs';
import { getMessageTargetsFromFlags, resolveTargets, syncTargetsToConfigAndMessage } from './ac5e-hooks-target-context.mjs';

export function refreshAttackTargetsForSubmission(dialog, config, ac5eConfig, message, deps) {
	if (!config || !ac5eConfig || ac5eConfig.hookType !== 'attack') return;
	if (Number.isInteger(ac5eConfig?.buildRollConfig?.index) && ac5eConfig.buildRollConfig.index !== 0) return;
	const preservedD20State = captureAppliedAttackRollState(config, ac5eConfig);
	refreshAttackAutoRangeState(ac5eConfig, config);

	const messageForRead = message ?? getMessageForConfigTargets(config, 'attack', ac5eConfig.options?.activity, deps) ?? dialog?.message;
	const targetDeps = {
		Constants,
		getMessageFlagScope: _getMessageFlagScope,
		getMessageDnd5eFlags: _getMessageDnd5eFlags,
	};
	const messageTargets = getMessageTargetsFromFlags(messageForRead, targetDeps);
	const finalTargets = resolveTargets(messageForRead, messageTargets, { hook: 'attack', activity: ac5eConfig.options?.activity }, targetDeps);
	if (!finalTargets.length) return;

	syncTargetsToConfigAndMessage(ac5eConfig, finalTargets, message, targetDeps);
	config.advantage = undefined;
	config.disadvantage = undefined;
	deps.calcAdvantageMode(ac5eConfig, config, undefined, undefined, { skipSetProperties: true });
	deps.applyExplicitModeOverride(ac5eConfig, config);
	restoreAppliedAttackRollState(config, ac5eConfig, preservedD20State);
	syncTargetsToConfigAndMessage(ac5eConfig, ac5eConfig.options?.targets ?? finalTargets, message, targetDeps);
}

function captureAppliedAttackRollState(config, ac5eConfig) {
	const roll0 = Array.isArray(config?.rolls) && config.rolls[0] && typeof config.rolls[0] === 'object' ? config.rolls[0] : null;
	const roll0Options = roll0?.options && typeof roll0.options === 'object' ? roll0.options : null;
	const roll0Ac5eOptions = roll0Options?.[Constants.MODULE_ID] && typeof roll0Options[Constants.MODULE_ID] === 'object' ? roll0Options[Constants.MODULE_ID] : null;
	return {
		appliedParts: foundry.utils.duplicate(roll0Ac5eOptions?.appliedParts ?? []),
		parts: foundry.utils.duplicate(Array.isArray(roll0?.parts) ? roll0.parts : config?.parts ?? []),
		effectiveModifiers: foundry.utils.duplicate(ac5eConfig?.effectiveModifiers ?? {}),
		maximum: roll0Options?.maximum,
		minimum: roll0Options?.minimum,
		maximize: roll0Options?.maximize,
		minimize: roll0Options?.minimize,
	};
}

function restoreAppliedAttackRollState(config, ac5eConfig, preservedState = {}) {
	const preservedAppliedParts = Array.isArray(preservedState?.appliedParts) ? preservedState.appliedParts : [];
	const hasPreservedModifiers =
		Number.isFinite(preservedState?.maximum) ||
		Number.isFinite(preservedState?.minimum) ||
		preservedState?.maximize === true ||
		preservedState?.minimize === true;
	const roll0 = Array.isArray(config?.rolls) && config.rolls[0] && typeof config.rolls[0] === 'object' ? config.rolls[0] : null;
	const roll0Options = roll0?.options && typeof roll0.options === 'object' ? roll0.options : null;
	if (roll0Options) roll0Options[Constants.MODULE_ID] ??= {};
	const roll0Ac5eOptions = roll0Options?.[Constants.MODULE_ID];
	const currentAppliedParts = Array.isArray(roll0Ac5eOptions?.appliedParts) ? roll0Ac5eOptions.appliedParts : [];
	if (preservedAppliedParts.length && !currentAppliedParts.length) {
		const restoredParts = foundry.utils.duplicate(preservedState?.parts ?? []);
		if (roll0) roll0.parts = restoredParts;
		if (Array.isArray(config?.parts) || restoredParts.length) config.parts = foundry.utils.duplicate(restoredParts);
		if (roll0Ac5eOptions) roll0Ac5eOptions.appliedParts = foundry.utils.duplicate(preservedAppliedParts);
		if (Array.isArray(ac5eConfig?.parts) && !ac5eConfig.parts.length) ac5eConfig.parts = foundry.utils.duplicate(preservedAppliedParts);
	}
	if (!roll0Options || !hasPreservedModifiers) return;
	const hasCurrentModifiers =
		Number.isFinite(roll0Options.maximum) ||
		Number.isFinite(roll0Options.minimum) ||
		roll0Options.maximize === true ||
		roll0Options.minimize === true;
	if (hasCurrentModifiers) return;
	if (Number.isFinite(preservedState.maximum)) roll0Options.maximum = preservedState.maximum;
	if (Number.isFinite(preservedState.minimum)) roll0Options.minimum = preservedState.minimum;
	if (preservedState.maximize === true) roll0Options.maximize = true;
	if (preservedState.minimize === true) roll0Options.minimize = true;
	if ((!ac5eConfig?.effectiveModifiers || !Object.keys(ac5eConfig.effectiveModifiers).length) && preservedState?.effectiveModifiers && typeof preservedState.effectiveModifiers === 'object') {
		ac5eConfig.effectiveModifiers = foundry.utils.duplicate(preservedState.effectiveModifiers);
	}
}
export function getMessageForConfigTargets(config, hook, activity, deps) {
	const options = config?.options ?? {};
	const originatingMessageId = options?.originatingMessageId;
	const messageId = originatingMessageId ?? options?.messageId;
	const directMessage = messageId ? (game.messages.get(messageId) ?? dnd5e?.registry?.messages?.get(messageId)?.pop?.()) : undefined;
	const context = _resolveUseMessageContext({ message: directMessage, messageId, originatingMessageId });
	const originatingMessage = context?.originatingMessage ?? context?.message ?? directMessage;
	if (hook === 'damage') {
		const associatedRollMessage = getAssociatedRollMessage({
			hook,
			activity,
			originatingMessage,
			config,
			resolvedMessageId: context?.resolvedMessageId,
			triggerMessageId: messageId,
		});
		if (associatedRollMessage) return associatedRollMessage;
	}
	return originatingMessage;
}
