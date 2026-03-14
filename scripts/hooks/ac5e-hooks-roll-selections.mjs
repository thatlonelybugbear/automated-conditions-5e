import { getDamageBonusEntries } from './ac5e-hooks-dialog-damage-state.mjs';

export function getRollNonBonusOptinEntries(ac5eConfig, hookType) {
	const modes = ['advantage', 'disadvantage', 'noAdvantage', 'noDisadvantage', 'critical', 'noCritical', 'fail', 'fumble', 'success', 'modifiers'];
	if (hookType === 'attack') modes.push('abilityOverride');
	return modes.flatMap((mode) => {
		const subjectEntries = Array.isArray(ac5eConfig?.subject?.[mode]) ? ac5eConfig.subject[mode] : [];
		const opponentEntries = Array.isArray(ac5eConfig?.opponent?.[mode]) ? ac5eConfig.opponent[mode] : [];
		return subjectEntries.concat(opponentEntries).filter((entry) => entry && typeof entry === 'object' && entry.optin && (!entry.hook || entry.hook === hookType));
	});
}

export function getBonusEntriesForHook(ac5eConfig, hookType) {
	const subjectBonuses = Array.isArray(ac5eConfig?.subject?.bonus) ? ac5eConfig.subject.bonus : [];
	const opponentBonuses = Array.isArray(ac5eConfig?.opponent?.bonus) ? ac5eConfig.opponent.bonus : [];
	return subjectBonuses.concat(opponentBonuses).filter((entry) => entry && typeof entry === 'object' && entry.mode === 'bonus' && (!entry.hook || entry.hook === hookType));
}

export function getSelectedOptinEntries(ac5eConfig, optins, selectedTypes, hookType) {
	const selectedIds = new Set(Object.keys(optins ?? {}).filter((key) => optins[key]));
	if (hookType === 'damage') {
		const entries = getDamageBonusEntries(ac5eConfig, selectedTypes).filter((entry) => entry.optin);
		return { selectedEntries: entries.filter((entry) => selectedIds.has(entry.id)), selectedIds };
	}
	const entries = getAllOptinEntriesForHook(ac5eConfig, hookType);
	return { selectedEntries: entries.filter((entry) => selectedIds.has(entry.id)), selectedIds };
}

export function getAllOptinEntriesForHook(ac5eConfig, hookType) {
	const subjectBonuses = Array.isArray(ac5eConfig?.subject?.bonus) ? ac5eConfig.subject.bonus : [];
	const opponentBonuses = Array.isArray(ac5eConfig?.opponent?.bonus) ? ac5eConfig.opponent.bonus : [];
	const subjectInfo = Array.isArray(ac5eConfig?.subject?.info) ? ac5eConfig.subject.info : [];
	const opponentInfo = Array.isArray(ac5eConfig?.opponent?.info) ? ac5eConfig.opponent.info : [];
	const subjectTargetADC = Array.isArray(ac5eConfig?.subject?.targetADC) ? ac5eConfig.subject.targetADC : [];
	const opponentTargetADC = Array.isArray(ac5eConfig?.opponent?.targetADC) ? ac5eConfig.opponent.targetADC : [];
	const subjectRange = Array.isArray(ac5eConfig?.subject?.range) ? ac5eConfig.subject.range : [];
	const opponentRange = Array.isArray(ac5eConfig?.opponent?.range) ? ac5eConfig.opponent.range : [];
	return subjectBonuses
		.concat(opponentBonuses, subjectInfo, opponentInfo, subjectTargetADC, opponentTargetADC, subjectRange, opponentRange)
		.filter((entry) => entry && typeof entry === 'object' && entry.optin && (!entry.hook || entry.hook === hookType));
}
