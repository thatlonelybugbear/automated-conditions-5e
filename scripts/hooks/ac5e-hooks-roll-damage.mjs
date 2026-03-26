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
	const sourceTokenId = sourceToken?.id;
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
	let ac5eConfig = deps.getConfig(config, dialog, hook, sourceTokenId, singleTargetToken?.id, options, reEval);
	if (ac5eConfig.returnEarly) {
		deps.applyExplicitModeOverride(ac5eConfig, config);
		return deps.setAC5eProperties(ac5eConfig, config, dialog, message);
	}
	ac5eConfig = deps.ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: singleTargetToken });
	deps.calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties: true });
	deps.applyExplicitModeOverride(ac5eConfig, config);
	deps.applyOptinCriticalToDamageConfig(ac5eConfig, config);
	deps.captureFrozenDamageBaseline(ac5eConfig, config);
	deps.applyDamageFormulaStateToConfig?.(ac5eConfig, config);
	deps.setAC5eProperties(ac5eConfig, config, dialog, message);
	deps.syncTargetsToConfigAndMessage(ac5eConfig, options.targets ?? [], message, deps);
	if (deps.hookDebugEnabled('preRollDamageHook')) console.warn('AC5E._preRollDamage:', { ac5eConfig });
	return ac5eConfig;
}
