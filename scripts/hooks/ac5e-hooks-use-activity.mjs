import {
	_autoArmor,
	_collectActivityDamageTypes,
	_filterOptinEntries,
	_getActivityEffectsStatusRiders,
	_getDistance,
	_getMessageDnd5eFlags,
	_getMessageFlagScope,
	_getTokenFromActor,
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
	if (activity.type === 'check') return true;
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
