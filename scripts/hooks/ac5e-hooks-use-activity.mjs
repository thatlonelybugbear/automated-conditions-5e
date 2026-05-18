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
	_setMessageFlagScope,
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
	ac5eConfig.targetADCResolvedAtUse = _applyPreUseActivityAlteredDC(activity, ac5eConfig, deps);
	_ensureUsageConfigurationDialogForTargetADCOptins(activity, usageConfig, dialogConfig, ac5eConfig);
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
	_refreshPreUseActivityTargetADCState(activity, ac5eConfig, deps);
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
	if (!Number.isFinite(baseDC)) return [];
	return _buildTargetADCOptinChoiceList(ac5eConfig, baseDC);
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
	const activityType = String(activity?.type ?? tempConfig?.options?.activity?.type ?? '').trim().toLowerCase();
	if (['save', 'check'].includes(activityType)) {
		const activityData = activity?.[activityType];
		const originalBaseDC = Number(ac5eConfig?.initialTargetADC ?? activityData?.dc?.value);
		tempConfig.initialTargetADC = Number.isFinite(originalBaseDC) ? originalBaseDC : tempConfig.initialTargetADC;
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
	const hoverLines = [String(resolvedTargetADC?.hoverText ?? '').trim()].filter(Boolean);
	const hoverText = hoverLines.join('\n');
	_logUsageDialogDebug('getResolvedUseDisplayState', {
		activityType,
		optinSelected: tempConfig?.optinSelected ?? {},
		initialTargetADC: tempConfig?.initialTargetADC ?? null,
		alteredTargetADC: tempConfig?.alteredTargetADC ?? null,
		resolvedTargetADC,
		hoverLines,
	});
	return { resolvedTargetADC, hoverLines, hoverText };
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

function _ensureUsageConfigurationDialogForTargetADCOptins(activity, usageConfig, dialogConfig, ac5eConfig) {
	const hookType = String(_resolvePreUseEvaluationHookType(ac5eConfig, activity) ?? '').toLowerCase();
	if (!['save', 'check'].includes(hookType)) return;
	const targetADCEntries = [
		...(Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC : []),
		...(Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC : []),
	].filter((entry) => entry && typeof entry === 'object');
	_logUsageDialogDebug('ensureUsageConfigurationDialogForTargetADCOptins', {
		hookType,
		targetADCEntryCount: targetADCEntries.length,
		configureBefore: dialogConfig?.configure ?? null,
		scalingBefore: usageConfig?.scaling ?? null,
	});
	if (!targetADCEntries.length) return;
	dialogConfig.configure = true;
	if (usageConfig?.scaling === false) usageConfig.scaling = 0;
	_logUsageDialogDebug('ensureUsageConfigurationDialogForTargetADCOptins.after', {
		configureAfter: dialogConfig?.configure ?? null,
		scalingAfter: usageConfig?.scaling ?? null,
	});
}

function _refreshPreUseActivityTargetADCState(activity, ac5eConfig, deps) {
	const activityType = activity?.type;
	if (!['save', 'check'].includes(activityType)) return;
	const activityData = activity?.[activityType];
	if (!activityData?.dc || typeof activityData.dc !== 'object') return;
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
		const hoverText = String(resolvedState?.hoverText ?? '').trim();
		if (!resolvedTargetADC && !hoverText) return baseButtons;
		return baseButtons.map((button) => {
			const action = String(button?.dataset?.action ?? '');
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
		if (!Number.isFinite(numericDC)) return;
		if (numericDC === baseDC) return;
		if (seen.has(numericDC)) return;
		seen.add(numericDC);
		const normalizedLabel = String(label ?? '').trim() || `${_localize('AC5E.ModifyDC')} ${numericDC} (${baseDC})`;
		choices.push({ id: id ?? null, label: normalizedLabel, dc: numericDC, baseDC });
	};
	for (const entry of allTargetADCEntries) {
		if (!entry?.optin) continue;
		const optinValues = Array.isArray(entry.values) ? entry.values : [];
		if (!optinValues.length) continue;
		const candidateDC = Number(getAlteredTargetValueOrThreshold(baseDC, [...baseTargetADCValues, ...optinValues], 'dcBonus'));
		if (!Number.isFinite(candidateDC)) continue;
		const entryLabel = String(entry?.label ?? entry?.name ?? entry?.id ?? '').trim();
		const beforeCount = choices.length;
		addChoice({
			id: entry?.id ?? null,
			label: entryLabel || `${_localize('AC5E.ModifyDC')} ${candidateDC} (${baseDC})`,
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

function _getResolvedTargetADCMessageState(ac5eConfig, activityLike) {
	const activityType = String(activityLike?.type ?? ac5eConfig?.options?.activity?.type ?? '').toLowerCase();
	if (!['save', 'check'].includes(activityType)) return null;
	const baseDC = Number(ac5eConfig?.initialTargetADC);
	const alteredDC = Number(ac5eConfig?.alteredTargetADC);
	if (!Number.isFinite(baseDC) || !Number.isFinite(alteredDC) || alteredDC === baseDC) return null;
	const hoverText = _buildResolvedTargetADCHoverText(ac5eConfig, baseDC, alteredDC);
	if (!hoverText) return null;
	return { baseDC, alteredDC, hoverText, activityType };
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

function _logUsageDialogDebug(stage, payload) {
	if (!globalThis?.ac5e?.debugUsageDialogTooltip) return;
	try {
		console.warn(`AC5E USAGE DIALOG DEBUG ${stage} ${JSON.stringify(payload)}`);
	} catch (_error) {
		console.warn(`AC5E USAGE DIALOG DEBUG ${stage}`, payload);
	}
}
