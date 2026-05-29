import { runAc5eRollPhase } from './ac5e-hooks-roll-phase.mjs';
import { forceDialogConfigureForOptins } from './ac5e-hooks-roll-dialog-configure.mjs';

export function preRollDamage(config, dialog, message, hook, reEval, deps) {
	if (deps.hookDebugEnabled('preRollDamageHook')) console.warn('AC5E._preRollDamage', hook, { config, dialog, message });
	const { subject: configActivity, subject: { actor: sourceActor } = {}, rolls, attackMode, ammunition, mastery } = config || {};
	const { messageForTargets, activity: messageActivity, messageTargets, options } = deps.getHookMessageData(config, hook, message, deps);
	const activity = messageActivity || configActivity;
	const resolvedAbilityOverride = _getResolvedUseAbilityOverride({ config, options, moduleId: deps?.Constants?.MODULE_ID });
	if (resolvedAbilityOverride) {
		options.ability = resolvedAbilityOverride;
		config.ability = resolvedAbilityOverride;
		if (activity?.attack && typeof activity.attack === 'object') activity.attack.ability = resolvedAbilityOverride;
		if (Array.isArray(rolls)) {
			for (const roll of rolls) {
				roll.options ??= {};
				roll.options.ability = resolvedAbilityOverride;
			}
		}
	}
	const directDamageTargets = deps.getAssociatedRollTargets(options?.originatingMessageId, activity?.type, messageForTargets, deps);
	options.ammo = ammunition;
	options.ammunition = ammunition?.toObject();
	options.attackMode = attackMode;
	options.mastery = mastery;
	const rollScaling = rolls?.[0]?.data?.scaling;
	if (rolls?.[0]?.data) options.rollData = { ...rolls[0].data };
	else if (rollScaling !== undefined) options.scaling = rollScaling;
	if (Array.isArray(directDamageTargets) && directDamageTargets.length) {
		options.hook = hook;
		options.activity = activity;
		options.targets = foundry.utils.duplicate(directDamageTargets);
		deps.collectRollDamageTypes(rolls, options);
	} else {
		deps.prepareHookTargetsAndDamage({ options, hook, activity, messageForTargets, messageTargets, rolls, damageSource: 'roll' }, deps);
	}
	const sourceToken = deps.getSubjectTokenForHook(hook, messageForTargets, sourceActor, deps);
	const isTargetSelf = activity?.target?.affects?.type === 'self';
	let singleTargetToken = deps.getSingleTargetToken(options.targets) ?? (isTargetSelf ? sourceToken : game.user?.targets?.first());
	const needsTarget = deps.settings.needsTarget;
	const invalidTargets = !deps.hasValidTargets(activity, options.targets?.length ?? game.user?.targets?.size, needsTarget);
	if (invalidTargets) {
		if (needsTarget !== 'source') return false;
		singleTargetToken = undefined;
	}
	if (singleTargetToken) options.distance = deps.getDistance(sourceToken, singleTargetToken);
	deps.logResolvedTargets('damage', sourceToken, singleTargetToken, options);
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
			deps.applyOptinCriticalToDamageConfig(ac5eConfig, config);
		},
		captureBaseline: deps.captureFrozenDamageBaseline,
		syncTargets: ({ ac5eConfig: finalizedConfig }) => deps.syncTargetsToConfigAndMessage(finalizedConfig, options.targets ?? [], message, deps),
		debugExtra: { activity: activity?.uuid ?? activity?.id ?? null },
	});
	forceDialogConfigureForOptins(ac5eConfig, config, dialog, hook, message);
	if (deps.applyDamageFormulaStateToConfig?.(ac5eConfig, config)) {
		deps.setAC5eProperties(ac5eConfig, config, dialog, message);
	}
	if (deps.hookDebugEnabled('preRollDamageHook')) console.warn('AC5E._preRollDamage:', { ac5eConfig });
	return ac5eConfig;
}

function _getResolvedUseAbilityOverride({ config, options, moduleId } = {}) {
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

