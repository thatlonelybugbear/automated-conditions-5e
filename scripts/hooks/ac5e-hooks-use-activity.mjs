import {
	_autoArmor,
	_collectActivityDamageTypes,
	_filterOptinEntries,
	_ac5eSafeEval,
	_getActivityEffectsStatusRiders,
	_getDistance,
	_getMessageDnd5eFlags,
	_getMessageFlagScope,
	_getOptinSelectionScale,
	_getTokenFromActor,
	_isOptinSelectionActive,
	getAlteredTargetValueOrThreshold,
	_hasValidTargets,
	_localize,
	_setMessageFlagScope,
	_setUseConfigInflightCache,
} from '../ac5e-helpers.mjs';
import { _getConfig, _getSafeUseConfig } from '../ac5e-config-logic.mjs';
import { _createEvaluationSandbox } from '../ac5e-runtimeLogic.mjs';
import Constants from '../ac5e-constants.mjs';
import { _setAC5eProperties } from '../ac5e-runtimeLogic.mjs';
import { autoRanged } from '../ac5e-systemRules.mjs';
import { _ac5eChecks, _applyPendingUses } from '../ac5e-setpieces.mjs';
import { getTargets } from './ac5e-hooks-target-context.mjs';

const templateSizeStateByActivityUuid = new Map();

export function preUseActivity(activity, usageConfig, dialogConfig, messageConfig, hook, deps) {
	const { item, ability, skill, tool } = activity || {};
	const sourceActor = item.actor;
	if (deps.hookDebugEnabled('preUseActivityHook')) console.error('AC5e preUseActivity:', { item, sourceActor, activity, usageConfig, dialogConfig, messageConfig });
	if (!sourceActor) return;

	const options = {
		ability,
		skill,
		tool,
		hook,
		activity,
		targets: getTargets({ message: messageConfig }, { Constants, getMessageDnd5eFlags: _getMessageDnd5eFlags, getMessageFlagScope: _getMessageFlagScope }),
	};
	_collectActivityDamageTypes(activity, options);
	options.riderStatuses = _getActivityEffectsStatusRiders(activity);

	const useWarnings =
		deps.settings.autoArmorSpellUse === 'off' ? false
		: deps.settings.autoArmorSpellUse === 'warn' ? 'Warn'
		: 'Enforce';
	if (item.type === 'spell' && useWarnings) {
		const notProficient = _autoArmor(sourceActor).notProficient;
		const raging = sourceActor.appliedEffects.some((effect) => [_localize('AC5E.Raging'), _localize('AC5E.Rage')].includes(effect.name));
		const silenced =
			item.system.properties.has('vocal') &&
			sourceActor.statuses.has('silenced') &&
			!sourceActor.appliedEffects.some((effect) => effect.name === _localize('AC5E.SubtleSpell')) &&
			!sourceActor.flags?.[Constants.MODULE_ID]?.subtleSpell;
		if (notProficient) notifyPreUse(sourceActor.name, useWarnings, 'Armor');
		else if (raging) notifyPreUse(sourceActor.name, useWarnings, 'Raging');
		else if (silenced) notifyPreUse(sourceActor.name, useWarnings, 'Silenced');
		if (useWarnings === 'Enforce' && (notProficient || raging || silenced)) return false;
	}

	const incapacitated = deps.settings.autoArmorSpellUse !== 'off' && sourceActor.statuses.has('incapacitated');
	if (incapacitated && useWarnings) {
		notifyPreUse(sourceActor.name, useWarnings, 'Incapacitated');
		if (useWarnings === 'Enforce') return false;
	}

	const sourceToken = _getTokenFromActor(sourceActor) ?? sourceActor?.getActiveTokens?.()?.[0];
	const isTargetSelf = activity.target?.affects?.type === 'self';
	let targets = game.user?.targets;
	let singleTargetToken = isTargetSelf ? sourceToken : targets?.first();
	const needsTarget = deps.settings.needsTarget;
	const placesTemplate = !!activity?.target?.template?.type;
	const invalidTargets = !_hasValidTargets(activity, targets?.size, needsTarget);
	if (invalidTargets) {
		if (needsTarget !== 'source') return false;
		singleTargetToken = undefined;
	}
	if (singleTargetToken) options.distance = _getDistance(sourceToken, singleTargetToken);
	let ac5eConfig = _getConfig(usageConfig, dialogConfig, hook, sourceToken?.id, singleTargetToken?.id, options);
	ac5eConfig = _ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: singleTargetToken });
	_applyPreUseActivityAbilityOverride(activity, ac5eConfig);
	_rebuildPreUseTargetADCState(ac5eConfig, activity);
	ac5eConfig.targetADCResolvedAtUse = _applyPreUseActivityAlteredDC(activity, ac5eConfig, deps);
	_ensureUsageConfigurationDialogForTargetADCOptins(activity, usageConfig, dialogConfig, ac5eConfig);
	_ensureUsageConfigurationDialogForAbilityOverrideOptins(activity, usageConfig, dialogConfig, ac5eConfig);
	_ensureUsageConfigurationDialogForTemplateSizeOptins(activity, usageConfig, dialogConfig, ac5eConfig);
	resolveActivityTemplateSize(activity, ac5eConfig);
	if (globalThis.ac5e?.debug?.abilityOverrideTrace) {
		console.warn('AC5E TRACE preUseActivity.configureState', {
			activityType: activity?.type,
			dialogConfigure: dialogConfig?.configure,
			usageConfigure: usageConfig?.configure,
			targetADCChoiceCount: getTargetADCOptinChoices(ac5eConfig, activity).length,
			abilityOverrideChoiceCount: getAbilityOverrideOptinChoices(ac5eConfig, activity).length,
		});
	}
	_wireResolvedTargetADCButton(activity, ac5eConfig, usageConfig);
	_logUsageDialogDebug('preUseActivity.summary', {
		activityType: activity?.type ?? null,
		itemName: item?.name ?? null,
		configure: dialogConfig?.configure ?? null,
		scaling: usageConfig?.scaling ?? null,
		initialTargetADC: ac5eConfig?.initialTargetADC ?? null,
		alteredTargetADC: ac5eConfig?.alteredTargetADC ?? null,
		targetADCResolvedAtUse: !!ac5eConfig?.targetADCResolvedAtUse,
		targetADCEntryCount:
			(Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC.length : 0) +
			(Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC.length : 0),
	});

	const hasResolvedSingleTarget = isTargetSelf || targets?.size === 1;
	const shouldCheckPreUseRange = singleTargetToken && hasResolvedSingleTarget && !placesTemplate && activity?.type !== 'attack';
	if (shouldCheckPreUseRange) {
		ac5eConfig.subject.rangeNotes = [];
		const failLabel = _localize('AC5E.OutOfRange');
		ac5eConfig.subject.fail = (ac5eConfig.subject.fail ?? []).filter((entry) => {
			if (entry === failLabel) return false;
			if (!entry || typeof entry !== 'object') return true;
			const label = String(entry.label ?? entry.name ?? entry.id ?? '').trim();
			return label !== failLabel;
		});
		const { inRange, outOfRangeFail, rangeNotes = [] } = autoRanged(activity, sourceToken, singleTargetToken, { ...options, ac5eConfig });
		ac5eConfig.subject.rangeNotes.push(...rangeNotes);
		if (outOfRangeFail && !usageConfig?.workflow?.AoO && !inRange && !ac5eConfig.subject.fail.includes(failLabel)) {
			ac5eConfig.subject.fail.push(failLabel);
		}
	}

	const subjectFail = _filterOptinEntries(ac5eConfig?.subject?.fail ?? [], ac5eConfig?.optinSelected);
	const opponentFail = _filterOptinEntries(ac5eConfig?.opponent?.fail ?? [], ac5eConfig?.optinSelected);
	const failEntries = [...subjectFail, ...opponentFail];
	if (failEntries.length && useWarnings) {
		const failText = _localize('AC5E.Fail');
		const itemName = item?.name ?? 'activity';
		const failDetails = failEntries
			.map((entry) => {
				if (!entry || typeof entry !== 'object') return { label: entry ? String(entry) : undefined, description: undefined, chanceReason: undefined };
				const label = entry?.label ?? entry?.name ?? entry?.id ?? entry?.bonus ?? entry?.modifier ?? entry?.set ?? entry?.threshold;
				const description = entry?.description !== undefined ? String(entry.description).trim() : undefined;
				const chance = entry?.chance;
				const chanceReason =
					chance?.enabled && chance?.triggered ?
						Number.isFinite(Number(chance.rolled)) ?
							`rolled a ${Math.trunc(Number(chance.rolled))}`
						:	'triggered'
					:	undefined;
				return { label: label !== undefined ? String(label) : undefined, description, chanceReason };
			})
			.filter((entry) => entry?.label || entry?.description || entry?.chanceReason);
		const failLabels = failDetails.map((entry) => entry.label).filter(Boolean);
		const failReasons = [...new Set(failDetails.flatMap((entry) => [entry.description, entry.chanceReason]).filter(Boolean))];
		const reasonText = failLabels.length ? ` (${failLabels.join(', ')})` : '';
		const reasonDetailText = failReasons.length ? ` Reason: ${failReasons.join('; ')}` : '';
		ui.notifications.warn(`AC5E: ${sourceActor.name} - ${itemName}: ${failText}${reasonText}${reasonDetailText}`);
		if (useWarnings === 'Enforce') return false;
	}

	_setAC5eProperties(ac5eConfig, usageConfig, dialogConfig, messageConfig);
	return true;
}

export function preActivityConsumption(activity, usageConfig, _messageConfig, _hook, deps) {
	const ac5eConfig = usageConfig?.[Constants.MODULE_ID];
	if (!ac5eConfig) return true;
	_applyPreUseActivityAbilityOverride(activity, ac5eConfig);
	_refreshPreUseActivityTargetADCState(activity, ac5eConfig, deps);
	resolveActivityTemplateSize(activity, ac5eConfig);
	return true;
}

export function preCreateActivityTemplate(activity, templateData) {
	const resolved = templateSizeStateByActivityUuid.get(activity?.uuid);
	if (!resolved || typeof resolved !== 'object') return true;
	templateData.flags ??= {};
	templateData.flags.dnd5e ??= {};
	templateData.flags.dnd5e.dimensions ??= {};
	const dnd5eDimensions = templateData.flags.dnd5e.dimensions;
	if (Number.isFinite(Number(resolved.size))) {
		const size = Number(resolved.size);
		templateData.distance = size;
		dnd5eDimensions.size = size;
		if (templateData.t === 'rect') templateData.width = size;
	}
	if (Number.isFinite(Number(resolved.width))) {
		const width = Number(resolved.width);
		templateData.width = width;
		dnd5eDimensions.width = width;
	}
	if (Number.isFinite(Number(resolved.height))) {
		dnd5eDimensions.height = Number(resolved.height);
	}
	return true;
}

export async function postUseActivity(usageConfig, results, hook) {
	const message = results?.message;
	const ac5eConfig = usageConfig?.[Constants.MODULE_ID];
	if (!ac5eConfig) return true;
	if ((hook === 'use' || hook === 'postUse') && ac5eConfig?.pendingUses?.length && !ac5eConfig.pendingUsesApplied) {
		const optins = ac5eConfig.optinSelected ?? {};
		const selectedIds = new Set(Object.keys(optins).filter((key) => optins[key]));
		const pending = ac5eConfig.pendingUses.filter((entry) => !entry.optin || selectedIds.has(entry.id));
		if (pending.length) await _applyPendingUses(pending);
		ac5eConfig.pendingUsesApplied = true;
	}
	if (!message) return true;

	const dnd5eUseFlag = _getMessageDnd5eFlags(message);
	if (dnd5eUseFlag) {
		ac5eConfig.options ??= {};
		if (dnd5eUseFlag.use?.spellLevel !== undefined) ac5eConfig.options.spellLevel ??= dnd5eUseFlag.use.spellLevel;
		if (Number.isFinite(Number(message.system?.scaling))) {
			const increase = Number(message.system.scaling);
			ac5eConfig.options.scaling = { increase, value: increase + 1 };
		}
		if (Array.isArray(dnd5eUseFlag.use?.effects)) ac5eConfig.options.useEffects ??= foundry.utils.duplicate(dnd5eUseFlag.use.effects);
		if (Array.isArray(dnd5eUseFlag.targets)) ac5eConfig.options.targets ??= foundry.utils.duplicate(dnd5eUseFlag.targets);
		if (dnd5eUseFlag.activity) ac5eConfig.options.activity ??= foundry.utils.duplicate(dnd5eUseFlag.activity);
		if (dnd5eUseFlag.item) ac5eConfig.options.item ??= foundry.utils.duplicate(dnd5eUseFlag.item);
	}

	const safeUseConfig = _getSafeUseConfig(ac5eConfig);
	const resolvedTargetADCState = _getResolvedTargetADCMessageState(ac5eConfig, dnd5eUseFlag?.activity);
	_setUseConfigInflightCache({
		messageId: message.id,
		originatingMessageId: dnd5eUseFlag?.originatingMessage,
		useConfig: safeUseConfig,
	});
	const persistedMessage = typeof message?.setFlag === 'function' ? message : (message?.id ? game.messages?.get?.(message.id) : null);
	if (typeof persistedMessage?.setFlag === 'function') {
		await persistedMessage.setFlag(Constants.MODULE_ID, 'use', safeUseConfig);
		if (resolvedTargetADCState) await persistedMessage.setFlag(Constants.MODULE_ID, 'resolvedTargetADC', resolvedTargetADCState);
	}
	if (message && typeof message === 'object' && typeof message?.setFlag !== 'function') {
		_setMessageFlagScope(message, Constants.MODULE_ID, { use: safeUseConfig, resolvedTargetADC: resolvedTargetADCState }, { merge: true });
	}
	return true;
}

export function getTargetADCOptinChoices(ac5eConfig, activity) {
	const activityType = activity?.type;
	if (!['save', 'check'].includes(activityType)) return [];
	const activityData = activity?.[activityType];
	const baseDC = Number(ac5eConfig?.initialTargetADC ?? activityData?.dc?.value);
	if (!Number.isFinite(baseDC)) return _buildTargetADCOptinChoiceList(ac5eConfig, NaN);
	return _buildTargetADCOptinChoiceList(ac5eConfig, baseDC);
}

export function getAbilityOverrideOptinChoices(ac5eConfig, activity) {
	const activityType = (activity?.type ?? '').toLowerCase();
	if (!['save', 'check'].includes(activityType)) return [];
	const entries = [
		...(Array.isArray(ac5eConfig?.subject?.abilityOverride) ? ac5eConfig.subject.abilityOverride : []),
		...(Array.isArray(ac5eConfig?.opponent?.abilityOverride) ? ac5eConfig.opponent.abilityOverride : []),
	].filter((entry) => entry && typeof entry === 'object' && !!entry.optin);
	const choices = [];
	for (const entry of entries) {
		const rawValue = typeof entry?.set === 'string' ? entry.set.trim().toLowerCase() : '';
		if (!rawValue) continue;
		const validAbility = Object.hasOwn(CONFIG?.DND5E?.abilities ?? {}, rawValue) || rawValue === 'spellcasting';
		if (!validAbility) continue;
		const baseLabel = (entry?.label ?? entry?.name ?? entry?.id ?? '').trim();
		const label = baseLabel || `${_localize('AC5E.AbilityOverride')}: ${rawValue}`;
		choices.push({
			id: entry?.id ?? null,
			label,
			displayLabel: label,
			description:
				typeof entry?.description === 'string' && entry.description.trim() ? entry.description.trim()
				: typeof entry?.autoDescription === 'string' && entry.autoDescription.trim() ? entry.autoDescription.trim()
				: '',
			entry,
		});
	}
	return choices;
}

export function getTemplateSizeOptinChoices(ac5eConfig, activity) {
	if (!activity?.target?.template?.type) return [];
	const entries = [
		...(Array.isArray(ac5eConfig?.subject?.templateSize) ? ac5eConfig.subject.templateSize : []),
		...(Array.isArray(ac5eConfig?.opponent?.templateSize) ? ac5eConfig.opponent.templateSize : []),
	].filter((entry) => entry && typeof entry === 'object' && !!entry.optin);
	return entries.map((entry) => {
		const label = String(entry?.label ?? entry?.name ?? entry?.id ?? '').trim() || 'Template Size';
		return {
			id: entry?.id ?? null,
			label,
			displayLabel: label,
			description:
				typeof entry?.description === 'string' && entry.description.trim() ? entry.description.trim()
				: typeof entry?.autoDescription === 'string' && entry.autoDescription.trim() ? entry.autoDescription.trim()
				: '',
			entry,
		};
	});
}

export function getResolvedUseDisplayState(ac5eConfig, activity, { optinSelected } = {}) {
	if (!ac5eConfig || !activity) return { resolvedTargetADC: null, hoverLines: [], hoverText: '' };
	const tempConfig = foundry.utils.duplicate(ac5eConfig);
	tempConfig.preAC5eConfig = foundry.utils.duplicate(ac5eConfig?.preAC5eConfig ?? {});
	tempConfig.options = foundry.utils.duplicate(ac5eConfig?.options ?? {});
	tempConfig.options.activity = activity;
	tempConfig.subject = foundry.utils.duplicate(ac5eConfig?.subject ?? {});
	tempConfig.opponent = foundry.utils.duplicate(ac5eConfig?.opponent ?? {});
	tempConfig.optinSelected = foundry.utils.duplicate(optinSelected ?? ac5eConfig?.optinSelected ?? {});
	const activityType = (activity?.type ?? tempConfig?.options?.activity?.type ?? '').trim().toLowerCase();
	if (['save', 'check'].includes(activityType)) {
		const activityData = activity?.[activityType];
		const resolvedOverrideAbility = _getResolvedWinningAbilityOverride(activity, tempConfig);
		const resolvedOverrideAbilityKey = (resolvedOverrideAbility?.resolved ?? '').toLowerCase();
		if (resolvedOverrideAbilityKey) {
			const sourceActor = activity?.item?.actor;
			const overrideBaseDC = Number(sourceActor?.system?.abilities?.[resolvedOverrideAbilityKey]?.dc);
			if (Number.isFinite(overrideBaseDC)) tempConfig.initialTargetADC = overrideBaseDC;
		} else {
			const fallbackBaseDC = Number(ac5eConfig?.initialTargetADC ?? activityData?.dc?.value);
			if (Number.isFinite(fallbackBaseDC)) tempConfig.initialTargetADC = fallbackBaseDC;
		}
		tempConfig.alteredTargetADC = undefined;
		_rebuildPreUseTargetADCState(tempConfig, activity);
		const targetValues = Array.isArray(tempConfig?.targetADC) ? tempConfig.targetADC : [];
		if (Number.isFinite(Number(tempConfig?.initialTargetADC)) && targetValues.length) {
			const computedAltered = Number(getAlteredTargetValueOrThreshold(Number(tempConfig.initialTargetADC), targetValues, 'dcBonus'));
			if (Number.isFinite(computedAltered) && computedAltered !== Number(tempConfig.initialTargetADC)) {
				tempConfig.alteredTargetADC = computedAltered;
			}
		}
	}
	const resolvedTargetADC = _getResolvedTargetADCMessageState(tempConfig, activity);
	const hoverLines = Array.isArray(resolvedTargetADC?.hoverLines) ? resolvedTargetADC.hoverLines.filter(Boolean) : [];
	const hoverText = hoverLines.join('\n');
	return { resolvedTargetADC, hoverLines, hoverText };
}

function notifyPreUse(actorName, warning, type) {
	const key = `AC5E.ActivityUse.Type.${type}.${warning}`;
	return ui.notifications.warn(actorName ? `${actorName} ${_localize(key)}` : _localize(key));
}

function _applyPreUseActivityAlteredDC(activity, ac5eConfig, deps) {
	const activityType = activity?.type;
	if (!['save', 'check'].includes(activityType)) return false;
	const activityData = activity?.[activityType];
	if (!activityData?.dc || typeof activityData.dc !== 'object') return false;
	const initialDC = Number(activityData.dc.value);
	if (!Number.isFinite(initialDC)) return false;
	let alteredDC = Number(ac5eConfig?.alteredTargetADC);
	if (!Number.isFinite(alteredDC)) {
		const targetValues = Array.isArray(ac5eConfig?.targetADC) ? ac5eConfig.targetADC : [];
		if (!targetValues.length) return false;
		const computedAltered = Number(getAlteredTargetValueOrThreshold(initialDC, targetValues, 'dcBonus'));
		if (!Number.isFinite(computedAltered) || computedAltered === initialDC) return false;
		ac5eConfig.initialTargetADC = initialDC;
		ac5eConfig.alteredTargetADC = computedAltered;
		alteredDC = computedAltered;
	}
	if (!Number.isFinite(alteredDC) || alteredDC === initialDC) return false;
	activityData.dc.value = alteredDC;
	if (deps?.hookDebugEnabled?.('preUseActivityHook') || globalThis?.ac5e?.debugTargetADC) {
		console.warn('AC5E targetADC: preUseActivity activity DC override', { activityType, initialDC, alteredDC });
	}
	return true;
}

function _applyPreUseActivityAbilityOverride(activity, ac5eConfig) {
	const activityType = activity?.type;
	const isSaveOrCheck = ['save', 'check'].includes(activityType);
	const isAttack = activityType === 'attack';
	const activityData = isSaveOrCheck ? activity?.[activityType] : null;
	if (isSaveOrCheck && (!activityData?.dc || typeof activityData.dc !== 'object')) return false;
	const candidateEntries = _filterOptinEntries(
		[
			...(Array.isArray(ac5eConfig?.subject?.abilityOverride) ? ac5eConfig.subject.abilityOverride : []),
			...(Array.isArray(ac5eConfig?.opponent?.abilityOverride) ? ac5eConfig.opponent.abilityOverride : []),
		],
		ac5eConfig?.optinSelected,
	).filter((entry) => entry && typeof entry === 'object');
	if (!candidateEntries.length) return false;
	const resolvedAbilityOverride = _getResolvedWinningAbilityOverride(activity, ac5eConfig, candidateEntries);
	if (!resolvedAbilityOverride) return false;
	const sourceActor = activity?.item?.actor;
	const previousDcCalculation = (activityData?.dc?.calculation ?? '').trim().toLowerCase();
	const calculation = resolvedAbilityOverride.raw;
	const resolvedAbility = resolvedAbilityOverride.resolved;
	const appliedAbility = resolvedAbility || calculation;
	if (isSaveOrCheck) {
		activityData.dc.calculation = appliedAbility;
		if (resolvedAbility && Object.hasOwn(CONFIG?.DND5E?.abilities ?? {}, resolvedAbility)) {
			const nextDc = Number(sourceActor?.system?.abilities?.[resolvedAbility]?.dc);
			if (Number.isFinite(nextDc)) {
				activityData.dc.value = nextDc;
				ac5eConfig.initialTargetADC = nextDc;
				ac5eConfig.alteredTargetADC = undefined;
			}
		}
	}
	if (isAttack && activity?.attack && typeof activity.attack === 'object') {
		activity.attack.ability = appliedAbility;
	}
	ac5eConfig.options ??= {};
	if (resolvedAbility) ac5eConfig.options.ability = resolvedAbility;
	ac5eConfig.options.activityAbilityResolved = appliedAbility;
	ac5eConfig.options._abilityOverrideResolvedAtUse = appliedAbility;
	ac5eConfig.preAC5eConfig ??= {};
	if (isSaveOrCheck) ac5eConfig.preAC5eConfig.previousActivityDcCalculation = previousDcCalculation || null;
	ac5eConfig.preAC5eConfig.activityAbilityResolved = appliedAbility;
	ac5eConfig.preAC5eConfig._abilityOverrideResolvedAtUse = appliedAbility;
	return true;
}

function _getResolvedWinningAbilityOverride(activity, ac5eConfig, preFilteredEntries = null) {
	const entries =
		Array.isArray(preFilteredEntries) ?
			preFilteredEntries
		:	_filterOptinEntries(
				[
					...(Array.isArray(ac5eConfig?.subject?.abilityOverride) ? ac5eConfig.subject.abilityOverride : []),
					...(Array.isArray(ac5eConfig?.opponent?.abilityOverride) ? ac5eConfig.opponent.abilityOverride : []),
				],
				ac5eConfig?.optinSelected,
			).filter((entry) => entry && typeof entry === 'object');
	let winningEntry = null;
	for (const entry of entries) {
		const rawValue = typeof entry?.set === 'string' ? entry.set.trim().toLowerCase() : '';
		if (!rawValue) continue;
		const validAbility = Object.hasOwn(CONFIG?.DND5E?.abilities ?? {}, rawValue) || rawValue === 'spellcasting';
		if (!validAbility) continue;
		const sourceActor = activity?.item?.actor;
		const resolved =
			rawValue === 'spellcasting' ?
				(activity?.spellcastingAbility ?? sourceActor?.system?.attributes?.spellcasting ?? '').trim().toLowerCase()
			:	rawValue;
		if (!Object.hasOwn(CONFIG?.DND5E?.abilities ?? {}, resolved)) continue;
		const priority = Number(entry?.priority);
		const score = Number.isFinite(priority) ? priority : 0;
		const label = (entry?.label ?? entry?.name ?? entry?.id ?? '').trim();
		if (!winningEntry || score >= winningEntry.score) winningEntry = { raw: rawValue, resolved, score, label };
	}
	return winningEntry;
}

function _ensureUsageConfigurationDialogForTargetADCOptins(activity, usageConfig, dialogConfig, ac5eConfig) {
	const hookType = (_resolvePreUseEvaluationHookType(ac5eConfig, activity) ?? '').toLowerCase();
	if (!['save', 'check'].includes(hookType)) return;
	const targetADCEntries = [
		...(Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC : []),
		...(Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC : []),
	].filter((entry) => entry && typeof entry === 'object');
	if (!targetADCEntries.length) return;
	dialogConfig.configure = true;
	usageConfig.configure = true;
	if (usageConfig?.scaling === false) usageConfig.scaling = 0;
}

function _ensureUsageConfigurationDialogForAbilityOverrideOptins(activity, usageConfig, dialogConfig, ac5eConfig) {
	const activityType = (activity?.type ?? '').toLowerCase();
	if (!['save', 'check'].includes(activityType)) return;
	const abilityOverrideEntries = [
		...(Array.isArray(ac5eConfig?.subject?.abilityOverride) ? ac5eConfig.subject.abilityOverride : []),
		...(Array.isArray(ac5eConfig?.opponent?.abilityOverride) ? ac5eConfig.opponent.abilityOverride : []),
	].filter((entry) => entry && typeof entry === 'object' && !!entry.optin);
	if (!abilityOverrideEntries.length) return;
	dialogConfig.configure = true;
	usageConfig.configure = true;
}

function _ensureUsageConfigurationDialogForTemplateSizeOptins(activity, usageConfig, dialogConfig, ac5eConfig) {
	if (!activity?.target?.template?.type) return;
	const templateSizeEntries = [
		...(Array.isArray(ac5eConfig?.subject?.templateSize) ? ac5eConfig.subject.templateSize : []),
		...(Array.isArray(ac5eConfig?.opponent?.templateSize) ? ac5eConfig.opponent.templateSize : []),
	].filter((entry) => entry && typeof entry === 'object' && !!entry.optin);
	if (!templateSizeEntries.length) return;
	dialogConfig.configure = true;
	usageConfig.configure = true;
}

function resolveActivityTemplateSize(activity, ac5eConfig) {
	const activityUuid = activity?.uuid;
	if (!activityUuid) return null;
	if (!activity?.target?.template?.type) {
		templateSizeStateByActivityUuid.delete(activityUuid);
		return null;
	}
	const entries = _filterOptinEntries(
		[
			...(Array.isArray(ac5eConfig?.subject?.templateSize) ? ac5eConfig.subject.templateSize : []),
			...(Array.isArray(ac5eConfig?.opponent?.templateSize) ? ac5eConfig.opponent.templateSize : []),
		],
		ac5eConfig?.optinSelected,
	).filter((entry) => entry && typeof entry === 'object' && entry.evaluation !== false);
	if (!entries.length) {
		ac5eConfig.templateSize = null;
		templateSizeStateByActivityUuid.delete(activityUuid);
		return null;
	}
	const sourceToken = _getTokenFromActor(activity?.item?.actor) ?? activity?.item?.actor?.getActiveTokens?.()?.[0];
	const sandbox = _createEvaluationSandbox({ subjectToken: sourceToken, opponentToken: null, options: { ...(ac5eConfig?.options ?? {}), activity } });
	sandbox.ac5eConfig = ac5eConfig;
	sandbox.optinSelected = ac5eConfig?.optinSelected ?? {};
	const resolved = {};
	for (const entry of entries) {
		for (const field of ['size', 'width', 'height']) {
			const expression = String(entry?.templateSize?.[field] ?? '').trim();
			if (!expression) continue;
			const selectedScale = _getOptinSelectionScale(ac5eConfig?.optinSelected?.[entry.id]);
			const prepared =
				Number.isFinite(selectedScale) ?
					expression.replace(/\(optinScale\)/gi, selectedScale).replace(/\boptinScale\b/gi, selectedScale)
				:	expression;
			const evaluated = _ac5eSafeEval({ expression: prepared, sandbox: { ...sandbox, baseValue: getActivityTemplateBaseValue(activity, field) }, mode: 'formula', debug: { changeKey: entry.changeKey, field } });
			const numeric = resolveTemplateSizeNumber(evaluated);
			if (Number.isFinite(numeric)) resolved[field] = numeric;
		}
	}
	ac5eConfig.templateSize = Object.keys(resolved).length ? resolved : null;
	if (ac5eConfig.templateSize) templateSizeStateByActivityUuid.set(activityUuid, foundry.utils.duplicate(ac5eConfig.templateSize));
	else templateSizeStateByActivityUuid.delete(activityUuid);
	return ac5eConfig.templateSize;
}

function getActivityTemplateBaseValue(activity, field) {
	const template = activity?.target?.template;
	const numeric = Number(template?.[field]);
	return Number.isFinite(numeric) ? numeric : 0;
}

function resolveTemplateSizeNumber(value) {
	const direct = Number(value);
	if (Number.isFinite(direct)) return direct;
	const expression = String(value ?? '').trim();
	if (!expression || !/^[\d+\-*/().\s]+$/.test(expression)) return NaN;
	try {
		// eslint-disable-next-line no-new-func
		const evaluated = new Function(`"use strict"; return (${expression});`)();
		const numeric = Number(evaluated);
		return Number.isFinite(numeric) ? numeric : NaN;
	} catch {
		return NaN;
	}
}

function _refreshPreUseActivityTargetADCState(activity, ac5eConfig, deps) {
	const activityType = activity?.type;
	if (!['save', 'check'].includes(activityType)) return;
	const activityData = activity?.[activityType];
	if (!activityData?.dc || typeof activityData.dc !== 'object') return;
	const recalculatedBaseDC = Number(activityData?.dc?.value);
	if (Number.isFinite(recalculatedBaseDC)) ac5eConfig.initialTargetADC = recalculatedBaseDC;
	const preservedInitialDC = Number(ac5eConfig?.initialTargetADC);
	if (Number.isFinite(preservedInitialDC)) activityData.dc.value = preservedInitialDC;
	ac5eConfig.alteredTargetADC = undefined;
	_rebuildPreUseTargetADCState(ac5eConfig, activity);
	ac5eConfig.targetADCResolvedAtUse = _applyPreUseActivityAlteredDC(activity, ac5eConfig, deps);
}

function _wireResolvedTargetADCButton(activity, ac5eConfig, usageConfig) {
	const activityType = activity?.type;
	if (!['save', 'check'].includes(activityType)) return;
	const {
		resolvedTargetADC: resolvedTargetADCState,
		hoverText,
	} = getResolvedUseDisplayState(ac5eConfig, activity, { optinSelected: ac5eConfig?.optinSelected ?? {} });
	ac5eConfig.resolvedUseButtonState = {
		resolvedTargetADC: resolvedTargetADCState,
		hoverText,
	};
	usageConfig ??= {};
	usageConfig[Constants.MODULE_ID] ??= {};
	usageConfig[Constants.MODULE_ID].resolvedUseButtonState = {
		resolvedTargetADC: resolvedTargetADCState,
		hoverText,
	};
	activity._ac5eResolvedUseButtonState = {
		resolvedTargetADC: resolvedTargetADCState,
		hoverText,
	};
	if (activity._ac5eResolvedTargetADCWrapped) return;
	const originalUsageChatButtons = typeof activity._usageChatButtons === 'function' ? activity._usageChatButtons.bind(activity) : null;
	if (!originalUsageChatButtons) return;
	activity._ac5eResolvedTargetADCWrapped = true;
	activity._usageChatButtons = function(message) {
		const baseButtons = originalUsageChatButtons(message) ?? [];
		if (!Array.isArray(baseButtons) || !baseButtons.length) return baseButtons;
		const resolvedState = this._ac5eResolvedUseButtonState;
		const resolvedTargetADC = resolvedState?.resolvedTargetADC ?? null;
		const hoverText = (resolvedState?.hoverText ?? '').trim();
		if (!resolvedTargetADC && !hoverText) return baseButtons;
		return baseButtons.map((button) => {
			const action = button?.dataset?.action ?? '';
			if (!['rollSave', 'rollCheck'].includes(action)) return button;
			const nextButton = foundry.utils.duplicate(button);
			nextButton.dataset ??= {};
			if (resolvedTargetADC) {
				const currentButtonDC = Number(button?.dataset?.dc ?? resolvedTargetADC.alteredDC);
				nextButton.dataset.dc = String(resolvedTargetADC.alteredDC);
				nextButton.dataset.ac5eTargetAdc = 'true';
				nextButton.label =
					`<span class="ac5e-dc-choice-label" title="${_escapeHtmlAttribute(hoverText || resolvedTargetADC.hoverText)}">` +
					`${_rewriteTargetADCButtonLabel(button?.label, resolvedTargetADC.alteredDC, currentButtonDC)}</span>`;
			}
			if (hoverText) {
				nextButton.dataset.tooltip = hoverText;
				nextButton.title = hoverText;
			}
			return nextButton;
		});
	};
}

function _buildTargetADCOptinChoiceList(ac5eConfig, baseDC) {
	const getValues = (entries = []) =>
		Array.isArray(entries) ?
			entries
				.filter((entry) => entry && typeof entry === 'object')
				.flatMap((entry) => (Array.isArray(entry.values) ? entry.values : []))
		:	[];
	const subjectTargetADCEntries = Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC.filter((entry) => entry && typeof entry === 'object') : [];
	const opponentTargetADCEntries = Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC.filter((entry) => entry && typeof entry === 'object') : [];
	const allTargetADCEntries = [...subjectTargetADCEntries, ...opponentTargetADCEntries];
	const baseTargetADCValues = getValues(allTargetADCEntries.filter((entry) => !entry?.optin));
	const choices = [];
	const seen = new Set();
	const addChoice = ({ id, label, dc } = {}) => {
		const numericDC = Number(dc);
		const hasNumericBaseDC = Number.isFinite(baseDC);
		if (!Number.isFinite(numericDC)) {
			const fallbackLabel = (label ?? '').trim();
			if (!fallbackLabel) return;
			choices.push({ id: id ?? null, label: fallbackLabel, dc: null, baseDC: hasNumericBaseDC ? baseDC : null });
			return;
		}
		if (hasNumericBaseDC && numericDC === baseDC) return;
		if (seen.has(numericDC)) return;
		seen.add(numericDC);
		const normalizedLabel =
			(label ?? '').trim() || (hasNumericBaseDC ? `${_localize('AC5E.ModifyDC')} ${numericDC} (${baseDC})` : `${_localize('AC5E.ModifyDC')} ${numericDC}`);
		choices.push({ id: id ?? null, label: normalizedLabel, dc: numericDC, baseDC: hasNumericBaseDC ? baseDC : null });
	};
	for (const entry of allTargetADCEntries) {
		if (!entry?.optin) continue;
		const optinValues = Array.isArray(entry.values) ? entry.values : [];
		if (!optinValues.length) continue;
		const candidateDC = Number.isFinite(baseDC) ? Number(getAlteredTargetValueOrThreshold(baseDC, [...baseTargetADCValues, ...optinValues], 'dcBonus')) : NaN;
		const entryLabel = (entry?.label ?? entry?.name ?? entry?.id ?? '').trim();
		const beforeCount = choices.length;
		addChoice({
			id: entry?.id ?? null,
			label: entryLabel || (Number.isFinite(candidateDC) && Number.isFinite(baseDC) ? `${_localize('AC5E.ModifyDC')} ${candidateDC} (${baseDC})` : `${_localize('AC5E.ModifyDC')}`),
			dc: candidateDC,
		});
		if (choices.length > beforeCount) {
			const created = choices.at(-1);
			if (created) {
				created.entry = entry;
				created.displayLabel = entryLabel || created.label;
				created.description =
					typeof entry?.description === 'string' && entry.description.trim() ? entry.description.trim()
					: typeof entry?.autoDescription === 'string' && entry.autoDescription.trim() ? entry.autoDescription.trim()
					: '';
			}
		}
	}
	return choices;
}

function _buildResolvedTargetADCHoverText(ac5eConfig, baseDC, alteredDC) {
	const labelEntries = [
		...(Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC : []),
		...(Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC : []),
	].filter((entry) => entry && typeof entry === 'object');
	const labels = [...new Set(labelEntries.map((entry) => String(entry?.label ?? entry?.name ?? entry?.id ?? '').trim()).filter(Boolean))];
	const prefix = `${_localize('AC5E.ModifyDC')} ${alteredDC} (${baseDC})`;
	return labels.length ? `${prefix}: ${labels.join(', ')}` : prefix;
}

function _buildResolvedAbilityOverrideHoverText(ac5eConfig, activityLike) {
	const resolvedOverrideAbility = _getResolvedWinningAbilityOverride(activityLike, ac5eConfig);
	if (!resolvedOverrideAbility?.resolved) return '';
	const resolvedAbility = resolvedOverrideAbility.resolved;
	const abilityLabel = CONFIG?.DND5E?.abilities?.[resolvedAbility]?.label ?? resolvedAbility;
	const formattedAbility =
		typeof abilityLabel === 'string' ? abilityLabel.charAt(0).toUpperCase() + abilityLabel.slice(1) : `${abilityLabel ?? ''}`.trim();
	const sourceLabel = (resolvedOverrideAbility?.label ?? '').trim();
	return sourceLabel ?
			`${_localize('AC5E.AbilityOverride')} (${formattedAbility}): ${sourceLabel}`
		:	`${_localize('AC5E.AbilityOverride')} (${formattedAbility})`;
}

function _getResolvedTargetADCMessageState(ac5eConfig, activityLike) {
	const activityType = (activityLike?.type ?? ac5eConfig?.options?.activity?.type ?? '').toLowerCase();
	if (!['save', 'check'].includes(activityType)) return null;
	const baseDC = Number(ac5eConfig?.initialTargetADC);
	const alteredDC = Number(ac5eConfig?.alteredTargetADC);
	const hoverLines = [];
	if (Number.isFinite(baseDC) && Number.isFinite(alteredDC) && alteredDC !== baseDC) {
		const dcHoverText = _buildResolvedTargetADCHoverText(ac5eConfig, baseDC, alteredDC);
		if (dcHoverText) hoverLines.push(dcHoverText);
	}
	const abilityOverrideHoverText = _buildResolvedAbilityOverrideHoverText(ac5eConfig, activityLike);
	if (abilityOverrideHoverText) hoverLines.push(abilityOverrideHoverText);
	if (!hoverLines.length) return null;
	const hoverText = hoverLines.join('\n');
	return { baseDC, alteredDC, hoverLines, hoverText, activityType };
}

function _rebuildPreUseTargetADCState(ac5eConfig, activity) {
	const resolvedHookType = _resolvePreUseEvaluationHookType(ac5eConfig, activity);
	const hookType = (resolvedHookType ?? '').toLowerCase();
	if (!['save', 'check'].includes(hookType)) return;
	const getValues = (entries = []) =>
		Array.isArray(entries) ?
			entries
				.filter((entry) => entry && typeof entry === 'object')
				.flatMap((entry) => (Array.isArray(entry.values) ? entry.values : []))
		:	[];
	const subjectTargetADCEntries = Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC.filter((entry) => entry && typeof entry === 'object') : [];
	const opponentTargetADCEntries = Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC.filter((entry) => entry && typeof entry === 'object') : [];
	const allTargetADCEntries = [...subjectTargetADCEntries, ...opponentTargetADCEntries];
	if (!allTargetADCEntries.length) {
		ac5eConfig.targetADC = [];
		return;
	}
	const selectedIds = new Set(Object.keys(ac5eConfig?.optinSelected ?? {}).filter((key) => _isOptinSelectionActive(ac5eConfig.optinSelected[key])));
	const baseValues = getValues(allTargetADCEntries.filter((entry) => !entry?.optin));
	const selectedOptinValues = getValues(allTargetADCEntries.filter((entry) => entry?.optin && selectedIds.has(entry.id)));
	ac5eConfig.targetADC = [...new Set([...baseValues, ...selectedOptinValues])];
}

function _resolvePreUseEvaluationHookType(ac5eConfig, activity) {
	const hookType = (ac5eConfig?.hookType ?? '').toLowerCase();
	if (hookType && hookType !== 'use') return hookType;
	return (activity?.type ?? hookType ?? '').toLowerCase();
}

function _rewriteTargetADCButtonLabel(baseLabel, choiceDC, baseDC) {
	const label = String(baseLabel ?? '').trim();
	if (!label) return `DC ${choiceDC}`;
	const choiceText = `${Math.trunc(Number(choiceDC))}`;
	const directDCPattern = /\bDC\s*-?\d+\b/i;
	if (directDCPattern.test(label)) return label.replace(directDCPattern, `DC ${choiceText}`);
	if (Number.isFinite(Number(baseDC))) {
		const baseText = `${Math.trunc(Number(baseDC))}`;
		const escapedBase = baseText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const baseNumberPattern = new RegExp(`\\b${escapedBase}\\b`);
		if (baseNumberPattern.test(label)) return label.replace(baseNumberPattern, choiceText);
	}
	return `${label} (DC ${choiceText})`;
}

function _escapeHtmlAttribute(value) {
	const escapedValue = foundry?.utils?.escapeHTML?.(value);
	if (typeof escapedValue === 'string') return escapedValue;
	return String(value ?? '');
}

function _logUsageDialogDebug(stage, payload) {
	return;
}
