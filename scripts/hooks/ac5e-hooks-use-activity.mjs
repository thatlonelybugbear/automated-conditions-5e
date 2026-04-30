import {
	_autoArmor,
	_collectActivityDamageTypes,
	_filterOptinEntries,
	_getActivityEffectsStatusRiders,
	_getDistance,
	_getMessageDnd5eFlags,
	_getMessageFlagScope,
	_getTokenFromActor,
	getAlteredTargetValueOrThreshold,
	_hasValidTargets,
	_localize,
	_setUseConfigInflightCache,
} from '../ac5e-helpers.mjs';
import { _getConfig, _getSafeUseConfig } from '../ac5e-config-logic.mjs';
import Constants from '../ac5e-constants.mjs';
import { _setAC5eProperties } from '../ac5e-runtimeLogic.mjs';
import { autoRanged } from '../ac5e-systemRules.mjs';
import { _ac5eChecks, _applyPendingUses } from '../ac5e-setpieces.mjs';
import { getTargets } from './ac5e-hooks-target-context.mjs';

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
	_rebuildPreUseTargetADCState(ac5eConfig, activity);
	_applyPreUseActivityAlteredDC(activity, ac5eConfig, deps);
	_wireTargetADCChoiceButtons(activity, ac5eConfig);

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
	_setUseConfigInflightCache({
		messageId: message.id,
		originatingMessageId: dnd5eUseFlag?.originatingMessage,
		useConfig: safeUseConfig,
	});
	await message.setFlag(Constants.MODULE_ID, 'use', safeUseConfig);
	return true;
}

function notifyPreUse(actorName, warning, type) {
	const key = `AC5E.ActivityUse.Type.${type}.${warning}`;
	return ui.notifications.warn(actorName ? `${actorName} ${_localize(key)}` : _localize(key));
}

function _applyPreUseActivityAlteredDC(activity, ac5eConfig, deps) {
	console.log('AC5E targetADC: preUseActivity initial', { activity, ac5eConfig, deps });
	const activityType = activity?.type;
	if (!['save', 'check'].includes(activityType)) return false;
	const activityData = activity?.[activityType];
	if (!activityData?.dc || typeof activityData.dc !== 'object') return false;
	const initialDC = Number(activityData.dc.value);
	if (!Number.isFinite(initialDC)) return false;
	let alteredDC = Number(ac5eConfig?.alteredTargetADC);
	if (!Number.isFinite(alteredDC)) {
		const targetValues = Array.isArray(ac5eConfig?.targetADC) ? ac5eConfig.targetADC : [];
		console.log('AC5E targetADC: preUseActivity potential target ADC values', { activityType, initialDC, targetValues });
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

function _wireTargetADCChoiceButtons(activity, ac5eConfig) {
	const activityType = activity?.type;
	if (!['save', 'check'].includes(activityType)) return;
	const activityData = activity?.[activityType];
	const baseDC = Number(ac5eConfig?.initialTargetADC ?? activityData?.dc?.value);
	if (!Number.isFinite(baseDC)) return;
	const dcChoices = _buildTargetADCChoiceList(ac5eConfig, baseDC);
	if (!dcChoices.length) return;
	if (activity._ac5eTargetADCChoicesWrapped) return;
	const originalUsageChatButtons = typeof activity._usageChatButtons === 'function' ? activity._usageChatButtons.bind(activity) : null;
	if (!originalUsageChatButtons) return;
	activity._ac5eTargetADCChoicesWrapped = true;
	activity._usageChatButtons = function(message) {
		const baseButtons = originalUsageChatButtons(message) ?? [];
		if (!Array.isArray(baseButtons) || !baseButtons.length) return baseButtons;
		const nextButtons = [];
		for (const button of baseButtons) {
			nextButtons.push(button);
			const action = String(button?.dataset?.action ?? '');
			if (!['rollSave', 'rollCheck'].includes(action)) continue;
			const currentButtonDC = Number(button?.dataset?.dc);
			for (const choice of dcChoices) {
				const choiceDC = Number(choice?.dc);
				if (!Number.isFinite(choiceDC)) continue;
				if (Number.isFinite(currentButtonDC) && currentButtonDC === choiceDC) continue;
				const cloned = foundry.utils.duplicate(button);
				cloned.dataset ??= {};
				cloned.dataset.dc = String(choiceDC);
				cloned.dataset.ac5eDcChoice = 'true';
				if (choice?.id) cloned.dataset.ac5eDcChoiceId = String(choice.id);
				const sourceLabel = String(choice?.label ?? '').trim() || `${_localize('AC5E.ModifyDC')} ${choiceDC} (${baseDC})`;
				const rewrittenLabel = _rewriteTargetADCButtonLabel(button?.label, choiceDC, currentButtonDC);
				const hoverText = `${sourceLabel} (${_localize('AC5E.ModifyDC')} ${choiceDC} (${baseDC}))`;
				cloned.label = `<span class="ac5e-dc-choice-label" title="${_escapeHtmlAttribute(hoverText)}">${rewrittenLabel}</span>`;
				nextButtons.push(cloned);
			}
		}
		return nextButtons;
	};
}

function _buildTargetADCChoiceList(ac5eConfig, baseDC) {
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
		if (!Number.isFinite(numericDC)) return;
		if (numericDC === baseDC) return;
		if (seen.has(numericDC)) return;
		seen.add(numericDC);
		const normalizedLabel = String(label ?? '').trim() || `${_localize('AC5E.ModifyDC')} ${numericDC} (${baseDC})`;
		choices.push({ id: id ?? null, label: normalizedLabel, dc: numericDC });
	};
	const alteredTargetADC = Number(ac5eConfig?.alteredTargetADC);
	if (Number.isFinite(alteredTargetADC)) {
		addChoice({
			id: 'ac5e:combined',
			label: `${_localize('AC5E.ModifyDC')} ${alteredTargetADC} (${baseDC})`,
			dc: alteredTargetADC,
		});
	}
	for (const entry of allTargetADCEntries) {
		if (!entry?.optin) continue;
		const optinValues = Array.isArray(entry.values) ? entry.values : [];
		if (!optinValues.length) continue;
		const candidateDC = Number(getAlteredTargetValueOrThreshold(baseDC, [...baseTargetADCValues, ...optinValues], 'dcBonus'));
		if (!Number.isFinite(candidateDC)) continue;
		const entryLabel = String(entry?.label ?? entry?.name ?? entry?.id ?? '').trim();
		addChoice({
			id: entry?.id ?? null,
			label: entryLabel || `${_localize('AC5E.ModifyDC')} ${candidateDC} (${baseDC})`,
			dc: candidateDC,
		});
	}
	return choices;
}

function _rebuildPreUseTargetADCState(ac5eConfig, activity) {
	const resolvedHookType = _resolvePreUseEvaluationHookType(ac5eConfig, activity);
	const hookType = String(resolvedHookType ?? '').toLowerCase();
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
	const selectedIds = new Set(Object.keys(ac5eConfig?.optinSelected ?? {}).filter((key) => ac5eConfig.optinSelected[key]));
	const baseValues = getValues(allTargetADCEntries.filter((entry) => !entry?.optin));
	const selectedOptinValues = getValues(allTargetADCEntries.filter((entry) => entry?.optin && selectedIds.has(entry.id)));
	ac5eConfig.targetADC = [...new Set([...baseValues, ...selectedOptinValues])];
}

function _resolvePreUseEvaluationHookType(ac5eConfig, activity) {
	const hookType = String(ac5eConfig?.hookType ?? '').toLowerCase();
	if (hookType && hookType !== 'use') return hookType;
	return String(activity?.type ?? hookType ?? '').toLowerCase();
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
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}
