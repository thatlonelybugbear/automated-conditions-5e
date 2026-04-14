import { runAc5eRollPhase } from './ac5e-hooks-roll-phase.mjs';

export function preRollSavingThrow(config, dialog, message, hook, deps) {
	const { messageForTargets, activity, messageTargets, options } = deps.getHookMessageData(config, hook, message, deps);
	options.isDeathSave = config.hookNames.includes('deathSave');
	options.isConcentration = config.isConcentration;
	deps.prepareHookTargetsAndDamage({ options, hook, activity, messageForTargets, messageTargets, damageSource: 'activity' }, deps);
	if (deps.hookDebugEnabled('preRollSavingThrowHook')) console.error('ac5e _preRollSavingThrow:', hook, options, { config, dialog, message });
	const { subject, ability } = config || {};
	options.ability = ability;
	const subjectToken = deps.getSubjectTokenForHook(hook, messageForTargets, subject, deps);
	let opponentToken = deps.getOpponentTokenForSave(options, activity, subjectToken, deps);
	if (opponentToken === subjectToken) opponentToken = undefined;
	if (opponentToken && subjectToken) options.distance = deps.getDistance(opponentToken, subjectToken);
	deps.logResolvedTargets('save', subjectToken, opponentToken, options);
	return runAc5eRollPhase({
		hook,
		config,
		dialog,
		message,
		subjectToken,
		opponentToken,
		options,
		deps,
		captureBaseline: deps.captureFrozenD20Baseline,
	});
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
	let opponentToken;
	const ac5eConfig = runAc5eRollPhase({
		hook,
		config,
		dialog,
		message,
		subjectToken,
		opponentToken,
		options,
		reEval,
		deps,
		captureBaseline: deps.captureFrozenD20Baseline,
	});
	if (deps.hookDebugEnabled('preRollAbilityCheckHook')) console.warn('AC5E._preRollAbilityCheck', { ac5eConfig });
	return ac5eConfig;
}
