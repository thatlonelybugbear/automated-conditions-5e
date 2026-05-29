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
	_ac5eSafeEval,
	_hasValidTargets,
	_resolveEffectOriginContext,
	_setMessageFlagScope,
} from './ac5e-helpers.mjs';
import { _getConfig } from './ac5e-config-logic.mjs';
import { _calcAdvantageMode, _setAC5eProperties } from './ac5e-runtimeLogic.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
import { _ac5eChecks } from './ac5e-setpieces.mjs';
import {
	applyOptinCriticalToDamageConfig,
	applyDamageFormulaStateToConfig,
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
import { postUseActivity, preActivityConsumption, preUseActivity } from './hooks/ac5e-hooks-use-activity.mjs';
import { renderRollConfigDialogHijack } from './hooks/ac5e-hooks-render-dialog.mjs';
import { renderActivityUsageDialogHijack } from './hooks/ac5e-hooks-render-usage-activity-dialog.mjs';
import { getDialogAc5eConfig } from './hooks/ac5e-hooks-dialog-state.mjs';
import { renderChatMessageHijack } from './hooks/ac5e-hooks-render-chat.mjs';
import { renderSettings } from './settings/ac5e-settings-render.mjs';

const settings = new Settings();
const _hookDebugEnabled = (flag) => Boolean(settings.debug || globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.[flag]);

const rollFunctionDispatch = {
	use: (hook, [activity, config, dialog, message]) => _preUseActivity(activity, config, dialog, message, hook),
	postUse: (hook, [, usageConfig, results]) => _postUseActivity(usageConfig, results, hook),
	preActivityConsumption: (hook, [activity, usageConfig, messageConfig]) => _preActivityConsumption(activity, usageConfig, messageConfig, hook),
	buildRoll: (hook, [app, config, formData, index]) => _buildRollConfig(app, config, formData, index, hook),
	postBuildRoll: (hook, [processConfig, config, index]) => _postBuildRollConfig(processConfig, config, index),
	postRollConfig: (hook, [rolls, config, dialog, message]) => _postRollConfiguration(rolls, config, dialog, message, hook),
	save: (hook, [config, dialog, message]) => _preRollSavingThrow(config, dialog, message, hook),
	attack: (hook, [config, dialog, message]) => _preRollAttack(config, dialog, message, hook),
	damage: (hook, [config, dialog, message]) => _preRollDamage(config, dialog, message, hook),
	check: (hook, [config, dialog, message]) => _preRollAbilityCheck(config, dialog, message, hook),
	init: (hook, [actor, rollConfig]) => _preConfigureInitiative(actor, rollConfig, hook),
	preCreateItem: (hook, [item, updates]) => _preCreateItem(item, updates),
	preCreateActiveEffect: (hook, [effect, updates, options, userId]) => _preCreateActiveEffect(effect, updates, options, userId),
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

function _extractAllowEffectApplicationExpression(effect, data) {
	const scopedFlag =
		effect?.flags?.[Constants.MODULE_ID]?.allowEffectApplication ??
		effect?._source?.flags?.[Constants.MODULE_ID]?.allowEffectApplication ??
		data?.flags?.[Constants.MODULE_ID]?.allowEffectApplication;
	if (typeof scopedFlag === 'string' && scopedFlag.trim()) return scopedFlag.trim();
	const changeSets = [effect?.changes, effect?._source?.changes, data?.changes];
	for (const changes of changeSets) {
		for (const change of changes ?? []) {
			const key = change?.key;
			if (key !== `flags.${Constants.MODULE_ID}.allowEffectApplication` && key !== 'flags.ac5e.allowEffectApplication') continue;
			if (typeof change.value !== 'string') continue;
			const value = change.value.trim();
			if (value) return value;
		}
	}
	return null;
}

function _toActorRollData(actor) {
	return actor?.getRollData?.() ?? {};
}

function _toItemRollData(item) {
	return item?.getRollData?.() ?? {};
}

function _toActivityData(activity) {
	return {
		id: activity?.id ?? null,
		uuid: activity?.uuid ?? null,
		identifier: activity?.identifier ?? null,
		type: activity?.type ?? null,
		name: activity?.name ?? null,
	};
}

function _formatAllowEffectApplicationBypassKeys(bindings) {
	if (!Array.isArray(bindings) || !bindings.length) return '';
	const labels = bindings
		.map((binding) => {
			const parts = [];
			if (binding?.modifiers?.shift) parts.push('Shift');
			if (binding?.modifiers?.control) parts.push('Ctrl');
			if (binding?.modifiers?.alt) parts.push('Alt');
			if (binding?.modifiers?.meta) parts.push('Meta');
			const keyLabel = binding?.key ?? '';
			if (keyLabel) parts.push(keyLabel);
			return parts.join('+').trim();
		})
		.filter(Boolean);
	return labels.join(' or ');
}

export function _preCreateActiveEffect(effect, updates, options, userId) {
	try {
		const trace = _hookDebugEnabled('allowEffectApplicationTrace');
		const traceSkip = (reason, extra = {}) => {
			if (!trace) return;
			console.warn('AC5E allowEffectApplication.skip', {
				reason,
				effect: effect?.uuid ?? effect?.id ?? null,
				...extra,
			});
		};
		const isEnchantment = updates?.type === 'enchantment';
		const isTransfer = updates?.transfer;
		if (isTransfer) {
			traceSkip('transfer-effect');
			return true;
		}
		if (isEnchantment) {
			traceSkip('enchantment-effect');
			return true;
		}
		const expression = _extractAllowEffectApplicationExpression(effect, updates);
		if (!expression) {
			traceSkip('no-expression', {
				changeCount: (effect?.changes?.length ?? 0) + (effect?._source?.changes?.length ?? 0) + (updates?.changes?.length ?? 0),
			});
			return true;
		}
		const bindings = game.keybindings?.get?.(Constants.MODULE_ID, 'allowEffectApplicationBypassModifier');
		const downKeys = game.keyboard?.downKeys;
		const keybindingActive = Array.isArray(bindings) && downKeys?.has ? bindings.some((binding) => downKeys.has(binding?.key)) : false;
		if (game.user?.isGM && keybindingActive) {
			traceSkip('gm-keypress-bypass', {
				effect: effect?.uuid ?? effect?.id ?? null,
				keybindingActive,
			});
			return true;
		}
		const originContext = _resolveEffectOriginContext(effect, { relative: effect?.parent ?? effect?.target ?? null });
		const originActivity = originContext?.originActivity;
		const originItem = originContext?.originItem;
		if (!originItem) {
			traceSkip('missing-origin-item', {
				hasOriginItem: Boolean(originItem),
				hasOriginActivity: Boolean(originActivity),
				origin: effect?.origin ?? effect?._source?.origin ?? updates?.origin ?? null,
			});
			return true;
		}
		const rollingActor = originContext?.originActor ?? originItem?.actor ?? originActivity?.item?.actor ?? null;
		if (!(rollingActor instanceof CONFIG.Actor.documentClass)) {
			traceSkip('missing-rolling-actor', { originItem: originItem?.uuid ?? originItem?.id ?? null, originActivity: originActivity?.uuid ?? originActivity?.id ?? null });
			return true;
		}
		const targetActor = effect?.parent instanceof CONFIG.Actor.documentClass ? effect.parent : null;
		const targetsCount = game.user?.targets?.size ?? 0;
		const hasSingleTarget = targetsCount === 1;
		const opponentActor = hasSingleTarget && targetActor ? targetActor : null;
		const sandbox = {
			rollingActor: _toActorRollData(rollingActor),
			opponentActor: _toActorRollData(opponentActor),
			item: _toItemRollData(originItem),
			activity: originActivity ? _toActivityData(originActivity) : null,
			hook: 'effectApplication',
			hasSingleTarget,
			singleTarget: hasSingleTarget,
			targetsCount,
		};
		const result = _ac5eSafeEval({ expression, sandbox, mode: 'condition' });
		if (trace) {
			console.warn('AC5E allowEffectApplication', {
				expression,
				result,
				effect: effect?.uuid ?? effect?.id,
				rollingActor: rollingActor?.uuid ?? rollingActor?.id,
				opponentActor: opponentActor?.uuid ?? opponentActor?.id,
				hasSingleTarget,
				targetsCount,
			});
		}
		if (result === false || result === 0 || result === '0' || result === 'false') {
			if (ui?.notifications) {
				const effectName = effect?.name ?? updates?.name ?? game.i18n?.localize?.('DOCUMENT.ActiveEffect') ?? 'Effect';
				const bypassHint = _formatAllowEffectApplicationBypassKeys(bindings);
				const gmHint = bypassHint ? ` GM override: hold ${bypassHint} while clicking Apply Effect.` : '';
				ui.notifications.info(`AC5E: "${effectName}" was not applied because allowEffectApplication evaluated to false.${gmHint}`);
			}
			if (trace || settings.debug) {
				console.warn('AC5E allowEffectApplication.block', {
					reason: 'expression-evaluated-false',
					expression,
					result,
					effect: effect?.uuid ?? effect?.id ?? null,
					originItem: originItem?.uuid ?? originItem?.id ?? null,
					originActivity: originActivity?.uuid ?? originActivity?.id ?? null,
					rollingActor: rollingActor?.uuid ?? rollingActor?.id ?? null,
					opponentActor: opponentActor?.uuid ?? opponentActor?.id ?? null,
					hasSingleTarget,
					targetsCount,
				});
			}
			return false;
		}
		return true;
	} catch (err) {
		if (_hookDebugEnabled('allowEffectApplicationTrace') || settings.debug) {
			console.warn('AC5E allowEffectApplication evaluation failed; allowing effect application by default.', {
				effect: effect?.uuid ?? effect?.id,
				error: err,
			});
		}
		return true;
	}
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

export function _preActivityConsumption(activity, usageConfig, messageConfig, hook) {
	return preActivityConsumption(activity, usageConfig, messageConfig, hook, {
		hookDebugEnabled: _hookDebugEnabled,
	});
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
		applyDamageFormulaStateToConfig,
		captureFrozenDamageBaseline: _captureFrozenDamageBaseline,
		setAC5eProperties: _setAC5eProperties,
		syncTargetsToConfigAndMessage,
		getMessageFlagScope: _getMessageFlagScope,
		getMessageDnd5eFlags: _getMessageDnd5eFlags,
	});
}

export function _renderHijack(hook, render, elem, ...extraArgs) {
	const sourceHookId = extraArgs.at(-1);
	const sourceExtraArgs = sourceHookId ? extraArgs.slice(0, -1) : extraArgs;
	const [rawRsrType, rawRsrSection] = sourceExtraArgs;
	const isRsrHook = sourceHookId === 'rsreforged.renderChatMessageContent' || sourceHookId === 'rsreforged.renderRoll';
	const rsrType = isRsrHook && typeof rawRsrType === 'string' ? rawRsrType : undefined;
	const rsrSection = isRsrHook ? rawRsrSection : undefined;
	const getConfigAC5E =
		hook === 'chat' ?
			(render.rolls?.[0]?.options?.[Constants.MODULE_ID] ?? render.flags?.[Constants.MODULE_ID])
		:	getDialogAc5eConfig(render, undefined);
	if (_hookDebugEnabled('renderHijackHook')) console.warn('AC5E._renderHijack:', { hook, render, elem });
	if (!getConfigAC5E && hook !== 'chat') return;
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
			rsrType,
			rsrSection,
		});
	}
	if (hook === 'usageDialog') {
		return renderActivityUsageDialogHijack(render, elem, {
			Constants,
			settings,
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


