import {
	_activeModule,
	_collectActivityDamageTypes,
	_collectRollDamageTypes,
	_getDistance,
	_getMessageDnd5eFlags,
	_getMessageFlagScope,
	_getTokenFromActor,
	_getTooltip,
	_getD20TooltipOwnership,
	_captureFrozenD20Baseline,
	_captureFrozenDamageBaseline,
	_restoreD20ConfigFromFrozenBaseline,
	_restoreDamageConfigFromFrozenBaseline,
	_hasValidTargets,
	_setMessageFlagScope,
} from './ac5e-helpers.mjs';
import { _getConfig } from './ac5e-config-logic.mjs';
import { _calcAdvantageMode, _setAC5eProperties } from './ac5e-runtimeLogic.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
import { _ac5eChecks } from './ac5e-setpieces.mjs';
import {
	applyOptinCriticalToDamageConfig,
	handleDamageOptinSelectionsChanged,
} from './hooks/ac5e-hooks-dialog-damage-state.mjs';
import {
	readOptinSelections,
	renderOptionalBonusesFieldset,
	renderOptionalBonusesRoll,
	setOptinSelections,
} from './hooks/ac5e-hooks-dialog-optins.mjs';
import {
	handleD20OptinSelectionsChanged,
	syncD20AbilityOverrideState,
} from './hooks/ac5e-hooks-dialog-d20-state.mjs';
import {
	getHookMessageData,
	getOpponentTokenForSave,
	getSingleTargetToken,
	getSubjectTokenForHook,
	logResolvedTargets,
	prepareHookTargetsAndDamage,
} from './hooks/ac5e-hooks-roll-context.mjs';
import {
	getAssociatedRollTargets,
	resolveTargets,
	syncTargetsToConfigAndMessage,
} from './hooks/ac5e-hooks-target-context.mjs';
import { buildRollConfig } from './hooks/ac5e-hooks-roll-build.mjs';
import { preRollAttack } from './hooks/ac5e-hooks-roll-attack.mjs';
import { preRollDamage } from './hooks/ac5e-hooks-roll-damage.mjs';
import { preRollAbilityCheck, preRollSavingThrow } from './hooks/ac5e-hooks-roll-d20.mjs';
import { preConfigureInitiative } from './hooks/ac5e-hooks-roll-initiative.mjs';
import { postBuildRollConfig } from './hooks/ac5e-hooks-roll-post-build.mjs';
import { applyExplicitModeOverride, buildChatRollPayload, postRollConfiguration, setExplicitModeOverride } from './hooks/ac5e-hooks-roll-post.mjs';
import { enforceDefaultButtonFocus, getExistingRoll, getExistingRollOptions } from './hooks/ac5e-hooks-ui-utils.mjs';
import { postUseActivity, preUseActivity } from './hooks/ac5e-hooks-use-activity.mjs';
import { getRenderHijackDialogConfig, renderRollConfigDialogHijack } from './hooks/ac5e-hooks-render-dialog.mjs';
import { renderChatMessageHijack } from './hooks/ac5e-hooks-render-chat.mjs';
import { renderSettings } from './settings/ac5e-settings-render.mjs';

const settings = new Settings();
const _hookDebugEnabled = (flag) => Boolean(settings.debug || globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.[flag]);
const rollFunctionDispatch = {
	use: (hook, [activity, config, dialog, message]) => _preUseActivity(activity, config, dialog, message, hook),
	postUse: (hook, [, usageConfig, results]) => _postUseActivity(usageConfig, results, hook),
	buildRoll: (hook, [app, config, formData, index]) => _buildRollConfig(app, config, formData, index, hook),
	postBuildRoll: (hook, [processConfig, config, index]) => _postBuildRollConfig(processConfig, config, index),
	postRollConfig: (hook, [rolls, config, dialog, message]) => _postRollConfiguration(rolls, config, dialog, message, hook),
	save: (hook, [config, dialog, message]) => _preRollSavingThrow(config, dialog, message, hook),
	attack: (hook, [config, dialog, message]) => _preRollAttack(config, dialog, message, hook),
	damage: (hook, [config, dialog, message]) => _preRollDamage(config, dialog, message, hook),
	check: (hook, [config, dialog, message]) => _preRollAbilityCheck(config, dialog, message, hook),
	init: (hook, [actor, rollConfig]) => _preConfigureInitiative(actor, rollConfig, hook),
	preCreateItem: (hook, [item, updates]) => _preCreateItem(item, updates),
};

export function _rollFunctions(hook, ...args) {
	const handler = rollFunctionDispatch[hook];
	if (!handler) return;
	return handler(hook, args);
}
function _postBuildRollConfig(processConfig, config, index) {
	return postBuildRollConfig(processConfig, config, index);
}

export function _preCreateItem(item, updates) {
	// if (_activeModule('dnd5e-scriptlets') && game.settings.get('dnd5e-scriptlets', 'UpdateCreatedOrigins')) return; //@to-do: integration with scriptlets when it's fixed
	const itemUuid = item.uuid;
	if (!itemUuid) return;
	const effects = foundry.utils.duplicate(item._source.effects);
	if (!effects.length) return;
	for (const e of effects) if (e.origin && e.origin !== itemUuid && e.type !== 'enchantment') e.origin = itemUuid; //make sure that we dont overwrite enchantment effects origins; might be from compendium template items
	item.updateSource({ effects });
}

export function _preUseActivity(activity, usageConfig, dialogConfig, messageConfig, hook) {
	return preUseActivity(activity, usageConfig, dialogConfig, messageConfig, hook, {
		settings,
		hookDebugEnabled: _hookDebugEnabled,
	});
}
export function _buildRollConfig(app, rollConfig, formData, index, hook) {
	return buildRollConfig(app, rollConfig, formData, index, hook, {
		buildDebug: ac5e.buildDebug,
		hookDebugEnabled: _hookDebugEnabled,
		calcAdvantageMode: _calcAdvantageMode,
	});
}

export function _postRollConfiguration(rolls, config, dialog, message, hook) {
	return postRollConfiguration(rolls, config, dialog, message, hook, {
		buildDebug: ac5e.buildDebug,
		hookDebugEnabled: _hookDebugEnabled,
		buildChatRollPayload,
		calcAdvantageMode: _calcAdvantageMode,
	});
}

export async function _postUseActivity(usageConfig, results, hook) {
	return postUseActivity(usageConfig, results, hook);
}

// export function _postConsumptionHook(activity, config, dialog, message) {
// 	const ac5eConfig = config[Constants.MODULE_ID] || {};
// 	if (settings.debug) console.warn('AC5E._postConsumptionHook', { activity, config, dialog, message, ac5eConfig });
// 	if (activity.isSpell) foundry.utils.mergeObject(ac5eConfig, { options: { spellLevel: dialog?.data?.flags?.use?.spellLevel || activity.item.system.level } });
// 	_setAC5eProperties(ac5eConfig, config, dialog, message);
// }

export function _preRollSavingThrow(config, dialog, message, hook) {
	return preRollSavingThrow(config, dialog, message, hook, {
		Constants,
		hookDebugEnabled: _hookDebugEnabled,
		getHookMessageData,
		prepareHookTargetsAndDamage,
		getSubjectTokenForHook,
		getOpponentTokenForSave,
		logResolvedTargets,
		resolveTargets,
		collectRollDamageTypes: _collectRollDamageTypes,
		collectActivityDamageTypes: _collectActivityDamageTypes,
		getTokenFromActor: _getTokenFromActor,
		getDistance: _getDistance,
		getConfig: _getConfig,
		ac5eChecks: _ac5eChecks,
		captureFrozenD20Baseline: _captureFrozenD20Baseline,
		calcAdvantageMode: _calcAdvantageMode,
		applyExplicitModeOverride,
		setAC5eProperties: _setAC5eProperties,
		getMessageFlagScope: _getMessageFlagScope,
		getMessageDnd5eFlags: _getMessageDnd5eFlags,
	});
}

export function _preRollAbilityCheck(config, dialog, message, hook, reEval) {
	return preRollAbilityCheck(config, dialog, message, hook, reEval, {
		Constants,
		hookDebugEnabled: _hookDebugEnabled,
		getHookMessageData,
		prepareHookTargetsAndDamage,
		getSubjectTokenForHook,
		resolveTargets,
		collectRollDamageTypes: _collectRollDamageTypes,
		collectActivityDamageTypes: _collectActivityDamageTypes,
		getTokenFromActor: _getTokenFromActor,
		getConfig: _getConfig,
		ac5eChecks: _ac5eChecks,
		captureFrozenD20Baseline: _captureFrozenD20Baseline,
		calcAdvantageMode: _calcAdvantageMode,
		applyExplicitModeOverride,
		setAC5eProperties: _setAC5eProperties,
		getMessageFlagScope: _getMessageFlagScope,
		getMessageDnd5eFlags: _getMessageDnd5eFlags,
	});
}

export function _preRollAttack(config, dialog, message, hook, reEval) {
	return preRollAttack(config, dialog, message, hook, reEval, {
		Constants,
		settings,
		hookDebugEnabled: _hookDebugEnabled,
		getHookMessageData,
		prepareHookTargetsAndDamage,
		getSubjectTokenForHook,
		getSingleTargetToken,
		logResolvedTargets,
		getTokenFromActor: _getTokenFromActor,
		resolveTargets,
		collectRollDamageTypes: _collectRollDamageTypes,
		collectActivityDamageTypes: _collectActivityDamageTypes,
		getConfig: _getConfig,
		ac5eChecks: _ac5eChecks,
		syncD20AbilityOverrideState,
		captureFrozenD20Baseline: _captureFrozenD20Baseline,
		calcAdvantageMode: _calcAdvantageMode,
		applyExplicitModeOverride,
		setAC5eProperties: _setAC5eProperties,
		syncTargetsToConfigAndMessage,
		getMessageFlagScope: _getMessageFlagScope,
		getMessageDnd5eFlags: _getMessageDnd5eFlags,
	});
}

export function _preRollDamage(config, dialog, message, hook, reEval) {
	return preRollDamage(config, dialog, message, hook, reEval, {
		Constants,
		settings,
		hookDebugEnabled: _hookDebugEnabled,
		getHookMessageData,
		prepareHookTargetsAndDamage,
		getSubjectTokenForHook,
		getSingleTargetToken,
		logResolvedTargets,
		resolveTargets,
		collectRollDamageTypes: _collectRollDamageTypes,
		collectActivityDamageTypes: _collectActivityDamageTypes,
		getTokenFromActor: _getTokenFromActor,
		getDistance: _getDistance,
		hasValidTargets: _hasValidTargets,
		getAssociatedRollTargets,
		getConfig: _getConfig,
		ac5eChecks: _ac5eChecks,
		calcAdvantageMode: _calcAdvantageMode,
		applyExplicitModeOverride,
		applyOptinCriticalToDamageConfig,
		captureFrozenDamageBaseline: _captureFrozenDamageBaseline,
		setAC5eProperties: _setAC5eProperties,
		syncTargetsToConfigAndMessage,
		getMessageFlagScope: _getMessageFlagScope,
		getMessageDnd5eFlags: _getMessageDnd5eFlags,
	});
}

export function _renderHijack(hook, render, elem) {
	const getConfigAC5E =
		hook === 'chat' ?
			(render.rolls?.[0]?.options?.[Constants.MODULE_ID] ?? render.flags?.[Constants.MODULE_ID])
		:	getRenderHijackDialogConfig(render, undefined, { Constants });
	if (_hookDebugEnabled('renderHijackHook')) console.warn('AC5E._renderHijack:', { hook, render, elem });
	if (!getConfigAC5E) return;
	if (hook === 'd20Dialog' || hook === 'damageDialog') {
		return renderRollConfigDialogHijack(hook, render, elem, getConfigAC5E, {
			Constants,
			settings,
			hookDebugEnabled: _hookDebugEnabled,
			getTooltip: _getTooltip,
			setMessageFlagScope: _setMessageFlagScope,
			enforceDefaultButtonFocus,
			setExplicitModeOverride,
			renderOptionalBonusesFieldset,
			renderOptionalBonusesRoll,
			readOptinSelections,
			setOptinSelections,
			handleD20OptinSelectionsChanged,
			handleDamageOptinSelectionsChanged,
			restoreD20ConfigFromFrozenBaseline: _restoreD20ConfigFromFrozenBaseline,
			restoreDamageConfigFromFrozenBaseline: _restoreDamageConfigFromFrozenBaseline,
			calcAdvantageMode: _calcAdvantageMode,
			applyExplicitModeOverride,
			getExistingRoll,
			getExistingRollOptions,
			preRollAttack: _preRollAttack,
			preRollSavingThrow: _preRollSavingThrow,
			preRollAbilityCheck: _preRollAbilityCheck,
			preRollDamage: _preRollDamage,
			rerenderHijack: _renderHijack,
		});
	}
	if (hook === 'chat') {
		return renderChatMessageHijack(render, elem, getConfigAC5E, {
			Constants,
			settings,
			hookDebugEnabled: _hookDebugEnabled,
			activeModule: _activeModule,
			getD20TooltipOwnership: _getD20TooltipOwnership,
		});
	}
	return true;
}

export function _renderSettings(app, html, data) {
	return renderSettings(app, html, data);
}

export function _preConfigureInitiative(subject, rollConfig, hook) {
	return preConfigureInitiative(subject, rollConfig, hook, {
		Constants,
		ac5eChecks: _ac5eChecks,
		hookDebugEnabled: _hookDebugEnabled,
	});
}

