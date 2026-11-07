import Constants from '../ac5e-constants.mjs';
import { _entryMatchesTransientState, _filterOptinEntries, _getOptinSelectionScale } from '../ac5e-helpers.mjs';
import { applyDamageFormulaModifiers } from './ac5e-hooks-dialog-damage-state.mjs';
import { forceDialogConfigureForOptins } from './ac5e-hooks-roll-dialog-configure.mjs';

export function preRollHitDie(config, dialog, message, deps) {
	if (!config?.subject || !config.rolls?.length) return true;
	const actor = config.subject;
	const subjectToken = deps.getTokenFromActor(actor);
	const options = { hook: 'hitDie', sourceActorUuid: actor.uuid, ability: 'con', denomination: config.denomination };
	let ac5eConfig = deps.getConfig(config, dialog, 'hitDie', subjectToken?.id, undefined, options);
	ac5eConfig = deps.ac5eChecks({ ac5eConfig, subjectToken, opponentToken: undefined });
	deps.setAC5eProperties(ac5eConfig, config, dialog, message);
	forceDialogConfigureForOptins(ac5eConfig, config, dialog, 'hitDie', message);
	return ac5eConfig;
}

export function buildHitDieRollConfig(ac5eConfig, rollConfig, index) {
	if (index !== 0) return;
	const selected = (entries = []) => _filterOptinEntries(entries, ac5eConfig.optinSelected)
		.filter((entry) => _entryMatchesTransientState(entry, ac5eConfig));
	const entries = (mode) => selected([...(ac5eConfig.subject?.[mode] ?? []), ...(ac5eConfig.opponent?.[mode] ?? [])]);
	const scaled = (value, entry) => {
		const scale = _getOptinSelectionScale(ac5eConfig.optinSelected?.[entry?.id]);
		return Number.isFinite(scale) ? String(value).replace(/\b(?:optinScale|bonusScale)\b/g, String(scale)) : String(value);
	};
	let advantage = !entries('noAdvantage').length && !!entries('advantage').length;
	let disadvantage = !entries('noDisadvantage').length && !!entries('disadvantage').length;
	let enforcedMode;
	for (const entry of entries('info')) {
		if (!['normal', 'advantage', 'disadvantage'].includes(entry?.enforceMode)) continue;
		const priority = Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 0;
		if (!enforcedMode || priority >= enforcedMode.priority) enforcedMode = { mode: entry.enforceMode, priority };
	}
	if (enforcedMode) {
		advantage = enforcedMode.mode === 'advantage';
		disadvantage = enforcedMode.mode === 'disadvantage';
	}
	const advDis = advantage === disadvantage ? '' : advantage ? 'adv' : 'dis';
	ac5eConfig.hasTransitAdvantage = advantage;
	ac5eConfig.hasTransitDisadvantage = disadvantage;
	const bonuses = entries('bonus').flatMap((entry) => (entry.values ?? []).map((value) => scaled(value, entry)));
	const modifiers = selected(ac5eConfig.damageModifiers).map((entry) => scaled(entry.value, entry));
	if (!bonuses.length && !modifiers.length && !advDis) return;
	const parts = [...(rollConfig.parts ?? []), ...bonuses];
	if (!parts.length) return;
	const formula = parts.map((part) => `(${part})`).join(' + ');
	const modified = applyDamageFormulaModifiers(formula, modifiers, { advDis }).formula.replace(/\[ac5eStaticFactor:[^\]]+\]/g, '');
	rollConfig.parts = [modified];
	rollConfig.options ??= {};
	rollConfig.options[Constants.MODULE_ID] = ac5eConfig;
	ac5eConfig.displayFormula = modified;
}
