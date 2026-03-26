import { forceDialogConfigureForMidiFastForward } from './ac5e-hooks-midi-fast-forward.mjs';

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
	forceDialogConfigureForMidiFastForward(ac5eConfig, config, dialog, hook);
	deps.captureFrozenD20Baseline(ac5eConfig, config);
	deps.calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties: true });
	deps.applyExplicitModeOverride(ac5eConfig, config);
	void syncMidiSaveDCMessageContent({ config, ac5eConfig, messageTargets });
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
	forceDialogConfigureForMidiFastForward(ac5eConfig, config, dialog, hook);
	deps.captureFrozenD20Baseline(ac5eConfig, config);
	deps.calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties: true });
	deps.applyExplicitModeOverride(ac5eConfig, config);
	void syncMidiSaveDCMessageContent({ config, ac5eConfig, messageTargets });
	deps.setAC5eProperties(ac5eConfig, config, dialog, message);
	if (deps.hookDebugEnabled('preRollAbilityCheckHook')) console.warn('AC5E._preRollAbilityCheck', { ac5eConfig });
	return ac5eConfig;
}

async function syncMidiSaveDCMessageContent({ config, ac5eConfig, messageTargets } = {}) {
	try {
		const midiMessageUuid = config?.midiOptions?.itemCardUuid ?? config?.workflow?.itemCardUuid;
		if (!midiMessageUuid) return;
		const initialTargetADC = Number(ac5eConfig?.initialTargetADC);
		const alteredTargetADC = Number(ac5eConfig?.alteredTargetADC);
		if (!Number.isFinite(initialTargetADC) || !Number.isFinite(alteredTargetADC) || initialTargetADC === alteredTargetADC) return;
		const messageMidi = fromUuidSync(midiMessageUuid);
		if (!messageMidi?.content || typeof messageMidi.update !== 'function') return;
		const content = String(messageMidi.content ?? '');
		if (!content.includes('midi-qol-saveDC')) return;
		const resolvedTargetCount = getMidiMessageTargetCount(content, messageTargets);
		const useWildcardMarker = resolvedTargetCount !== 1;
		const nextContent =
			useWildcardMarker ?
				markMidiSaveDCLabelsModified(content, initialTargetADC)
			:	replaceMidiSaveDCContent(content, initialTargetADC, alteredTargetADC);
		if (!nextContent || nextContent === content) return;
		await messageMidi.update({ content: nextContent });
	} catch (err) {
		console.warn('AC5E failed to sync Midi save DC message content', err);
	}
}

function getMidiMessageTargetCount(content, messageTargets) {
	if (Array.isArray(messageTargets) && messageTargets.length) return messageTargets.length;
	const saveTargetMatches = String(content ?? '').match(/midi-qol-save-class/g);
	return Array.isArray(saveTargetMatches) ? saveTargetMatches.length : 0;
}

function replaceMidiSaveDCContent(content, initialTargetADC, alteredTargetADC) {
	const baseLabel = `DC ${initialTargetADC}`;
	const nextLabel = `DC ${alteredTargetADC}`;
	return String(content ?? '')
		.replaceAll(`>${baseLabel}<`, `>${nextLabel}<`)
		.replaceAll(`vs ${baseLabel}`, `vs ${nextLabel}`);
}

function markMidiSaveDCLabelsModified(content, initialTargetADC) {
	const baseLabel = `DC ${initialTargetADC}`;
	const markedLabel = `DC ${initialTargetADC} (*)`;
	return String(content ?? '').replaceAll(`>${baseLabel}<`, `>${markedLabel}<`);
}
