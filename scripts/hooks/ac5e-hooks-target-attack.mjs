import { _getMessageDnd5eFlags, _getMessageFlagScope, _resolveUseMessageContext } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { refreshAttackAutoRangeState } from './ac5e-hooks-dialog-d20-state.mjs';
import { getAssociatedRollMessage } from './ac5e-hooks-message-association.mjs';
import { getMessageTargetsFromFlags, resolveTargets, syncTargetsToConfigAndMessage } from './ac5e-hooks-target-context.mjs';

export function refreshAttackTargetsForSubmission(dialog, config, ac5eConfig, message, deps) {
	if (!config || !ac5eConfig || ac5eConfig.hookType !== 'attack') return;
	if (Number.isInteger(ac5eConfig?.buildRollConfig?.index) && ac5eConfig.buildRollConfig.index !== 0) return;
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
	syncTargetsToConfigAndMessage(ac5eConfig, ac5eConfig.options?.targets ?? finalTargets, message, targetDeps);
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
