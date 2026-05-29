import { _getDistance, _hasValidTargets, _localize } from '../ac5e-helpers.mjs';
import { runAc5eRollPhase } from './ac5e-hooks-roll-phase.mjs';
import { autoRanged } from '../ac5e-systemRules.mjs';
import { forceDialogConfigureForOptins } from './ac5e-hooks-roll-dialog-configure.mjs';

export function preRollAttack(config, dialog, message, hook, reEval, deps) {
	if (deps.hookDebugEnabled('preRollAttackHook')) {
		console.warn(`AC5E TRACE preRollAttack.start ${JSON.stringify({
			hook,
			hasConfig: !!config,
			hasDialog: !!dialog,
			hasMessage: !!message,
		})}`);
	}
	const { subject: { actor: sourceActor, ability } = {}, subject: configActivity, ammunition, attackMode, mastery } = config || {};
	const { messageForTargets, activity: messageActivity, messageTargets, options } = deps.getHookMessageData(config, hook, message, deps);
	const activity = messageActivity || configActivity;
	const resolvedAbilityOverride = _getResolvedUseAbilityOverride({
		config,
		options,
		moduleId: deps?.Constants?.MODULE_ID,
		hookType: hook,
	});
	const baselineAbility =
		options?._ac5eBaselineAttackAbility ??
		options?.originatingUseConfig?.options?._ac5eBaselineAttackAbility ??
		config?.originatingUseConfig?.options?._ac5eBaselineAttackAbility ??
		config?.useConfig?.options?._ac5eBaselineAttackAbility ??
		config?.subject?.ability ??
		configActivity?.attack?.ability ??
		activity?.attack?.ability;
	const hasBaselineAbility = baselineAbility !== undefined && baselineAbility !== null;
	const resolvedAbility = resolvedAbilityOverride || (hasBaselineAbility ? baselineAbility : ability);
	if (options && options._ac5eBaselineAttackAbility === undefined) {
		const initialBaseline = baselineAbility ?? ability ?? '';
		options._ac5eBaselineAttackAbility = initialBaseline;
	}
	if (resolvedAbilityOverride) {
		options.ability = resolvedAbilityOverride;
		config.ability = resolvedAbilityOverride;
	} else if (options?._ac5eBaselineAttackAbility !== undefined) {
		const baseline = options._ac5eBaselineAttackAbility;
		options.ability = baseline;
		config.ability = baseline;
		if (configActivity?.attack && typeof configActivity.attack === 'object') configActivity.attack.ability = baseline;
		if (activity?.attack && typeof activity.attack === 'object') activity.attack.ability = baseline;
		if (config?.rolls?.[0]?.options) config.rolls[0].options.ability = baseline;
	}
	const nextAttackAbility = resolvedAbilityOverride || null;
	if (nextAttackAbility) {
		if (configActivity?.attack && typeof configActivity.attack === 'object' && configActivity.attack.ability !== nextAttackAbility) {
			configActivity.attack.ability = nextAttackAbility;
		}
		if (activity?.attack && typeof activity.attack === 'object' && activity.attack.ability !== nextAttackAbility) {
			activity.attack.ability = nextAttackAbility;
		}
	}
	if (Array.isArray(config?.rolls)) {
		for (const roll of config.rolls) {
			roll.options ??= {};
			if (resolvedAbilityOverride) roll.options.ability = resolvedAbilityOverride;
		}
	}
	options.ammo = ammunition;
	options.ammunition = sourceActor.items.get(ammunition)?.toObject();
	options.attackMode = attackMode;
	const actionType = activity?.getActionType(attackMode);
	options.actionType = actionType;
	options.mastery = mastery;
	deps.prepareHookTargetsAndDamage({ options, hook, activity, messageForTargets, messageTargets, damageSource: 'activity' }, deps);
	const item = activity?.item;
	const needsTarget = deps.settings.needsTarget;
	const { invalidTargets, sourceToken, singleTargetToken } = resolveAttackRollTargetContext({
		hook,
		config,
		messageForTargets,
		activity,
		options,
		sourceActor,
		needsTarget,
		getSubjectTokenForHook: (hookType, messageData, actor) => deps.getSubjectTokenForHook(hookType, messageData, actor, deps),
		getSingleTargetToken: deps.getSingleTargetToken,
		logResolvedTargets: deps.logResolvedTargets,
	});
	if (invalidTargets && needsTarget !== 'source') return false;
	const ac5eConfig = runAc5eRollPhase({
		hook,
		config,
		dialog,
		message,
		subjectToken: sourceToken,
		opponentToken: singleTargetToken,
		options,
		reEval,
		deps,
		applyHookState: ({ ac5eConfig }) => {
			applyAttackRangeState({ ac5eConfig, activity, sourceToken, singleTargetToken, options, config });
			applyAttackHeavyState({
				ac5eConfig,
				item,
				actionType,
				sourceActor,
				sourceToken,
				modernRules: deps.settings.dnd5eModernRules,
				automateHeavy: deps.settings.automateHeavy,
			});
			if (deps.hookDebugEnabled('preRollAttackHook')) {
				console.warn(`AC5E TRACE preRollAttack.done ${JSON.stringify({
					hookType: ac5eConfig?.hookType ?? null,
					defaultButton: ac5eConfig?.defaultButton ?? null,
				})}`);
			}
		},
		captureBaseline: deps.captureFrozenD20Baseline,
		syncTargets: ({ ac5eConfig: finalizedConfig }) => deps.syncTargetsToConfigAndMessage(finalizedConfig, options.targets ?? [], message, deps),
		debugExtra: { activity: activity?.uuid ?? activity?.id ?? null },
	});
	forceDialogConfigureForOptins(ac5eConfig, config, dialog, hook, message);
	return ac5eConfig;
}

function _getResolvedUseAbilityOverride({ config, options, moduleId, hookType } = {}) {
	const ac5eConfig = config?.options?.[moduleId] ?? config?.[moduleId] ?? null;
	const optinResolved = _getResolvedOptinAbilityFromAc5eConfig(ac5eConfig, hookType);
	if (optinResolved) return optinResolved;
	const candidates = [
		options?.activityAbilityResolved,
		options?._abilityOverrideResolvedAtUse,
		options?.originatingUseConfig?.options?.activityAbilityResolved,
		options?.originatingUseConfig?.options?._abilityOverrideResolvedAtUse,
		config?.originatingUseConfig?.options?.activityAbilityResolved,
		config?.originatingUseConfig?.options?._abilityOverrideResolvedAtUse,
		config?.useConfig?.options?.activityAbilityResolved,
		config?.useConfig?.options?._abilityOverrideResolvedAtUse,
		config?.options?.[moduleId]?.options?.activityAbilityResolved,
		config?.options?.[moduleId]?.options?._abilityOverrideResolvedAtUse,
		config?.options?.[moduleId]?.preAC5eConfig?.activityAbilityResolved,
		config?.options?.[moduleId]?.preAC5eConfig?._abilityOverrideResolvedAtUse,
		config?.[moduleId]?.options?.activityAbilityResolved,
		config?.[moduleId]?.options?._abilityOverrideResolvedAtUse,
		config?.[moduleId]?.preAC5eConfig?.activityAbilityResolved,
		config?.[moduleId]?.preAC5eConfig?._abilityOverrideResolvedAtUse,
	];
	for (const candidate of candidates) {
		if (typeof candidate !== 'string') continue;
		const normalized = candidate.trim().toLowerCase();
		if (!normalized) continue;
		if (Object.hasOwn(CONFIG?.DND5E?.abilities ?? {}, normalized)) return normalized;
	}
	return null;
}

function _getResolvedOptinAbilityFromAc5eConfig(ac5eConfig, hookType) {
	if (!ac5eConfig || typeof ac5eConfig !== 'object') return null;
	const selectedIds = new Set(Object.keys(ac5eConfig.optinSelected ?? {}).filter((id) => ac5eConfig.optinSelected?.[id]));
	const entries = [
		...(Array.isArray(ac5eConfig.subject?.abilityOverride) ? ac5eConfig.subject.abilityOverride : []),
		...(Array.isArray(ac5eConfig.opponent?.abilityOverride) ? ac5eConfig.opponent.abilityOverride : []),
	].filter((entry) => entry && (!entry.hook || entry.hook === hookType));
	if (!entries.length) return null;
	let winner = null;
	for (const entry of entries) {
		if (entry.optin && !entry.forceOptin && !selectedIds.has(entry.id)) continue;
		let resolved = entry.set?.trim?.()?.toLowerCase?.();
		if (!resolved) continue;
		if (resolved === 'spellcasting') {
			const spellAbility =
				ac5eConfig?.options?.activity?.spellcastingAbility
				?? ac5eConfig?.options?.item?.actor?.system?.attributes?.spellcasting
				?? ac5eConfig?.options?.spellcastingAbility;
			resolved = spellAbility?.trim?.()?.toLowerCase?.() ?? '';
		}
		if (!_isValidAbilityKey(resolved)) continue;
		const score = Number.isFinite(entry.priority) ? entry.priority : 0;
		if (!winner || score >= winner.score) winner = { resolved, score };
	}
	return winner?.resolved ?? null;
}

function _isValidAbilityKey(value) {
	const key = value?.trim?.()?.toLowerCase?.();
	if (!key) return false;
	return Object.hasOwn(CONFIG?.DND5E?.abilities ?? {}, key);
}

export function resolveAttackRollTargetContext({ hook, config, messageForTargets, activity, options, sourceActor, needsTarget, getSubjectTokenForHook, getSingleTargetToken, logResolvedTargets }) {
	const sourceToken = getSubjectTokenForHook(hook, messageForTargets, sourceActor);
	const isTargetSelf = activity?.target?.affects?.type === 'self';
	let singleTargetToken = getSingleTargetToken(options.targets) ?? (isTargetSelf ? sourceToken : game.user?.targets?.first());
	const invalidTargets = !_hasValidTargets(activity, options.targets?.length ?? game.user?.targets?.size, needsTarget);
	if (invalidTargets) {
		if (needsTarget !== 'source') return { invalidTargets, sourceToken, singleTargetToken };
		singleTargetToken = undefined;
	}
	if (singleTargetToken) options.distance = _getDistance(sourceToken, singleTargetToken);
	logResolvedTargets('attack', sourceToken, singleTargetToken, options);
	return { invalidTargets, sourceToken, singleTargetToken };
}

export function applyAttackRangeState({ ac5eConfig, activity, sourceToken, singleTargetToken, options, config }) {
	if (!singleTargetToken) return;
	ac5eConfig.subject.rangeNotes = [];
	const failLabel = _localize('AC5E.OutOfRange');
	const nearbyLabel = _localize('AC5E.NearbyFoe');
	const longLabel = _localize('RangeLong');
	ac5eConfig.subject.fail = (ac5eConfig.subject.fail ?? []).filter((entry) => {
		if (entry === failLabel) return false;
		if (!entry || typeof entry !== 'object') return true;
		const label = String(entry.label ?? entry.name ?? entry.id ?? '').trim();
		return label !== failLabel;
	});
	ac5eConfig.subject.disadvantage = (ac5eConfig.subject.disadvantage ?? []).filter((entry) => entry !== nearbyLabel && entry !== longLabel);
	const { nearbyFoe, inRange, range, longDisadvantage, outOfRangeFail, rangeNotes = [] } = autoRanged(activity, sourceToken, singleTargetToken, { ...options, ac5eConfig });
	if (nearbyFoe) ac5eConfig.subject.disadvantage.push(nearbyLabel);
	ac5eConfig.subject.rangeNotes.push(...rangeNotes);
	if (outOfRangeFail && !config.workflow?.AoO && !inRange && !ac5eConfig.subject.fail.includes(failLabel)) {
		ac5eConfig.subject.fail.push(failLabel);
	}
	if (range === 'long' && longDisadvantage) {
		ac5eConfig.subject.disadvantage.push(longLabel);
	}
}

export function applyAttackHeavyState({ ac5eConfig, item, actionType, sourceActor, sourceToken, modernRules, automateHeavy }) {
	if (!automateHeavy) return;
	if (!item?.system?.properties?.has('hvy')) return;
	const isSmall =
		modernRules ?
			(actionType === 'mwak' && sourceActor.system.abilities.str.value < 13) || (actionType === 'rwak' && sourceActor.system.abilities.dex.value < 13)
		:	sourceToken.document.width * sourceToken.document.height * sourceToken.document.texture.scaleX * sourceToken.document.texture.scaleY < 1;
	if (!isSmall) return;
	const localizationStr = 'DND5E.ITEM.Property.Heavy';
	ac5eConfig.subject.disadvantage = ac5eConfig.subject.disadvantage.concat(`${_localize('DND5E.ItemWeaponProperties')}: ${_localize(localizationStr)}`);
}
