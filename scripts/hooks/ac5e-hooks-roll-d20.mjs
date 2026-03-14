export function preRollSavingThrow(config, dialog, message, hook, deps) {
	const { messageForTargets, activity, messageTargets, options } = deps.getHookMessageData(config, hook, message, deps);
	options.isDeathSave = config.hookNames.includes('deathSave');
	options.isConcentration = config.isConcentration;
	deps.prepareHookTargetsAndDamage({ options, hook, activity, messageForTargets, messageTargets, damageSource: 'activity' }, deps);
	if (deps.hookDebugEnabled('preRollSavingThrowHook')) console.error('ac5e _preRollSavingThrow:', hook, options, { config, dialog, message });
	const { subject, ability } = config || {};
	options.ability = ability;
	const subjectToken = deps.getSubjectTokenForHook(hook, messageForTargets, subject, deps);
	const subjectTokenId = subjectToken?.id;
	let opponentToken = deps.getOpponentTokenForSave(options, activity, subjectToken, deps);
	if (opponentToken === subjectToken) opponentToken = undefined;
	if (opponentToken && subjectToken) options.distance = deps.getDistance(opponentToken, subjectToken);
	deps.logResolvedTargets('save', subjectToken, opponentToken, options);
	let ac5eConfig = deps.getConfig(config, dialog, hook, subjectTokenId, opponentToken?.id, options);
	if (ac5eConfig.returnEarly) {
		deps.applyExplicitModeOverride(ac5eConfig, config);
		return deps.setAC5eProperties(ac5eConfig, config, dialog, message);
	}
	ac5eConfig = deps.ac5eChecks({ ac5eConfig, subjectToken, opponentToken });
	deps.captureFrozenD20Baseline(ac5eConfig, config);
	deps.calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties: true });
	deps.applyExplicitModeOverride(ac5eConfig, config);
	return deps.setAC5eProperties(ac5eConfig, config, dialog, message);
}

export function preRollAbilityCheck(config, dialog, message, hook, reEval, deps) {
	if (deps.hookDebugEnabled('preRollAbilityCheckHook')) console.warn('AC5E._preRollAbilityCheck:', { config, dialog, message });
	const { messageForTargets, activity, messageTargets, options } = deps.getHookMessageData(config, hook, message, deps);
	const hookNames = Array.isArray(config?.hookNames) ? config.hookNames : [];
	options.isInitiative = hookNames.includes('initiativeDialog') || config?.options?.isInitiative === true || config?.rolls?.[0]?.options?.isInitiative === true;
	if (options.isInitiative) return true;
	const { subject, ability, tool, skill } = config || {};
	options.skill = skill;
	options.tool = tool;
	options.ability = ability;
	deps.prepareHookTargetsAndDamage({ options, hook, activity, messageForTargets, messageTargets, damageSource: 'activity' }, deps);
	const subjectToken = deps.getSubjectTokenForHook(hook, messageForTargets, subject, deps);
	const subjectTokenId = subjectToken?.id;
	let opponentToken;
	let ac5eConfig = deps.getConfig(config, dialog, hook, subjectTokenId, opponentToken?.id, options, reEval);
	if (ac5eConfig.returnEarly) {
		deps.applyExplicitModeOverride(ac5eConfig, config);
		return deps.setAC5eProperties(ac5eConfig, config, dialog, message, options);
	}
	ac5eConfig = deps.ac5eChecks({ ac5eConfig, subjectToken, opponentToken });
	deps.captureFrozenD20Baseline(ac5eConfig, config);
	deps.calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties: true });
	deps.applyExplicitModeOverride(ac5eConfig, config);
	deps.setAC5eProperties(ac5eConfig, config, dialog, message);
	if (deps.hookDebugEnabled('preRollAbilityCheckHook')) console.warn('AC5E._preRollAbilityCheck', { ac5eConfig });
	return ac5eConfig;
}
