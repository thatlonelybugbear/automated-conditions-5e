import { runAc5eRollPhase } from './ac5e-hooks-roll-phase.mjs';

export function preRollDamage(config, dialog, message, hook, reEval, deps) {
	if (deps.hookDebugEnabled('preRollDamageHook')) console.warn('AC5E._preRollDamage', hook, { config, dialog, message });
	const { subject: configActivity, subject: { actor: sourceActor } = {}, rolls, attackMode, ammunition, mastery } = config || {};
	const { messageForTargets, activity: messageActivity, messageTargets, options } = deps.getHookMessageData(config, hook, message, deps);
	const activity = messageActivity || configActivity;
	const directDamageTargets = deps.getAssociatedRollTargets(options?.originatingMessageId, activity?.type);
	options.ammo = ammunition;
	options.ammunition = ammunition?.toObject();
	options.attackMode = attackMode;
	options.mastery = mastery;
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
	if (deps.hookDebugEnabled('preRollDamageHook')) console.warn('AC5E._preRollDamage:', { ac5eConfig });
	return ac5eConfig;
}
