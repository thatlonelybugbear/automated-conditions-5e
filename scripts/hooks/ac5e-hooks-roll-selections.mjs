import { getDamageBonusEntries, getDamageNonBonusOptinEntries } from './ac5e-hooks-dialog-damage-state.mjs';

function shouldHideTargetADCFromRollDialog(_ac5eConfig, hookType) {
	return ['save', 'check'].includes(hookType);
}

export function getConfigEntriesByModes(ac5eConfig, modes, hookType, predicate = undefined) {
	const modeList = Array.isArray(modes) ? modes : [modes];
	return modeList.flatMap((mode) => {
		if (mode === 'targetADC' && shouldHideTargetADCFromRollDialog(ac5eConfig, hookType)) return [];
		const subjectEntries = Array.isArray(ac5eConfig?.subject?.[mode]) ? ac5eConfig.subject[mode] : [];
		const opponentEntries = Array.isArray(ac5eConfig?.opponent?.[mode]) ? ac5eConfig.opponent[mode] : [];
		return subjectEntries.concat(opponentEntries).filter((entry) =>
			entry
			&& typeof entry === 'object'
			&& (!entry.hook || entry.hook === hookType)
			&& (!predicate || predicate(entry, mode))
		);
	});
}

export function getRollNonBonusOptinEntries(ac5eConfig, hookType) {
	const modes = ['advantage', 'disadvantage', 'noAdvantage', 'noDisadvantage', 'critical', 'noCritical', 'fail', 'fumble', 'success', 'modifiers'];
	return getConfigEntriesByModes(ac5eConfig, modes, hookType, (entry) => entry.optin);
}

export function getBonusEntriesForHook(ac5eConfig, hookType) {
	return getConfigEntriesByModes(ac5eConfig, 'bonus', hookType, (entry) => entry.mode === 'bonus');
}

export function getSelectedOptinEntries(ac5eConfig, optins, selectedTypes, hookType) {
	const selectedIds = new Set(Object.keys(optins ?? {}).filter((key) => optins[key]));
	if (hookType === 'damage') {
		const entries = [...getDamageBonusEntries(ac5eConfig, selectedTypes), ...getDamageNonBonusOptinEntries(ac5eConfig, selectedTypes)].filter((entry) => entry.optin);
		return { selectedEntries: entries.filter((entry) => selectedIds.has(entry.id)), selectedIds };
	}
	const entries = getAllOptinEntriesForHook(ac5eConfig, hookType);
	return { selectedEntries: entries.filter((entry) => selectedIds.has(entry.id)), selectedIds };
}

export function getAllOptinEntriesForHook(ac5eConfig, hookType) {
	return getConfigEntriesByModes(ac5eConfig, ['bonus', 'info', 'targetADC', 'range'], hookType, (entry) => entry.optin);
}
