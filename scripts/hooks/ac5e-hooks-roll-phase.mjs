import { debugRollStateMigration, getRollModeCounts } from '../ac5e-helpers.mjs';

function runPhaseCallback(callback, context) {
	if (!(callback instanceof Function)) return context.ac5eConfig;
	const nextConfig = callback(context);
	if (nextConfig !== undefined) context.ac5eConfig = nextConfig;
	return context.ac5eConfig;
}

function logPhaseState(stage, context, extra) {
	debugRollStateMigration(`phase.${context.hook}.${stage}`, {
		hook: context.hook,
		config: context.config,
		rolls: context.rolls ?? context.config?.rolls,
		ac5eConfig: context.ac5eConfig,
		extra,
	});
}

export function runAc5eRollPhase({
	hook,
	config,
	dialog,
	message,
	subjectToken,
	opponentToken,
	options,
	reEval,
	deps,
	applyHookState,
	captureBaseline,
	syncTargets,
	debugExtra,
} = {}) {
	let ac5eConfig = deps.getConfig(config, dialog, hook, subjectToken?.id, opponentToken?.id, options, reEval);
	if (ac5eConfig.returnEarly) {
		deps.applyExplicitModeOverride(ac5eConfig, config);
		debugRollStateMigration(`phase.${hook}.returnEarly`, { hook, config, rolls: config?.rolls, ac5eConfig, extra: debugExtra });
		return deps.setAC5eProperties(ac5eConfig, config, dialog, message);
	}

	const phaseContext = {
		hook,
		config,
		dialog,
		message,
		subjectToken,
		opponentToken,
		options,
		reEval,
		deps,
		ac5eConfig: deps.ac5eChecks({ ac5eConfig, subjectToken, opponentToken }),
	};

	logPhaseState('normalized', phaseContext, debugExtra);
	runPhaseCallback(applyHookState, phaseContext);
	if (captureBaseline instanceof Function) captureBaseline(phaseContext.ac5eConfig, config);
	deps.calcAdvantageMode(phaseContext.ac5eConfig, config, dialog, message, { skipSetProperties: true });
	deps.applyExplicitModeOverride(phaseContext.ac5eConfig, config);
	if (['attack', 'check', 'save'].includes(phaseContext.ac5eConfig?.hookType)) getRollModeCounts(phaseContext.ac5eConfig);
	deps.setAC5eProperties(phaseContext.ac5eConfig, config, dialog, message);
	if (syncTargets instanceof Function) syncTargets(phaseContext);
	logPhaseState('applied', phaseContext, debugExtra);
	return phaseContext.ac5eConfig;
}

export function runAc5eInitiativePhase({
	hook,
	subject,
	rollConfig,
	config,
	options,
	deps,
	getConfig,
	applyHookState,
	finalizeReturnEarly,
	finalizeApplied,
	debugExtra,
} = {}) {
	let ac5eConfig = getConfig(config, {}, hook, subject?.token?.object?.id ?? subject?.getActiveTokens?.()?.[0]?.id, undefined, options);
	const phaseContext = {
		hook,
		subject,
		rollConfig,
		config,
		rolls: rollConfig?.rolls,
		options,
		deps,
		ac5eConfig,
	};

	if (ac5eConfig.returnEarly) {
		debugRollStateMigration(`phase.${hook}.returnEarly`, { hook, config: rollConfig, rolls: rollConfig?.rolls, ac5eConfig, extra: debugExtra });
		return runPhaseCallback(finalizeReturnEarly, phaseContext);
	}

	const subjectToken = subject?.token?.object ?? subject?.getActiveTokens?.()[0];
	phaseContext.subjectToken = subjectToken;
	phaseContext.ac5eConfig = deps.ac5eChecks({ ac5eConfig, subjectToken, opponentToken: undefined });
	logPhaseState('normalized', phaseContext, debugExtra);
	runPhaseCallback(applyHookState, phaseContext);
	runPhaseCallback(finalizeApplied, phaseContext);
	logPhaseState('applied', phaseContext, debugExtra);
	return phaseContext.ac5eConfig;
}
