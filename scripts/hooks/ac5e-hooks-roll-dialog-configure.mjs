import { _activeModule } from '../ac5e-helpers.mjs';
import { getDamageBonusEntries, getDamageNonBonusOptinEntries } from './ac5e-hooks-dialog-damage-state.mjs';
import { getAllOptinEntriesForHook, getRollNonBonusOptinEntries } from './ac5e-hooks-roll-selections.mjs';

function getSelectedDamageTypes(ac5eConfig, config) {
	const selectedFromConfig = Array.isArray(ac5eConfig?.options?.selectedDamageTypes) ? ac5eConfig.options.selectedDamageTypes.filter(Boolean) : [];
	if (selectedFromConfig.length) return selectedFromConfig;
	const selectedByIndex = Array.isArray(ac5eConfig?.options?.selectedDamageTypesByIndex) ? ac5eConfig.options.selectedDamageTypesByIndex.filter(Boolean) : [];
	if (selectedByIndex.length) return selectedByIndex;
	const selectedFromRolls = (Array.isArray(config?.rolls) ? config.rolls : [])
		.map((roll) => {
			const type = roll?.options?.type;
			return typeof type === 'string' && type.trim().length ? type.toLowerCase() : undefined;
		})
		.filter(Boolean);
	return selectedFromRolls.length ? selectedFromRolls : undefined;
}

export function getRelevantOptinEntriesForDialogConfigure(ac5eConfig, config, hookType = ac5eConfig?.hookType) {
	if (!ac5eConfig || !hookType) return [];
	let entries = [];
	if (hookType === 'damage') {
		const selectedDamageTypes = getSelectedDamageTypes(ac5eConfig, config);
		entries = [...getDamageBonusEntries(ac5eConfig, selectedDamageTypes), ...getDamageNonBonusOptinEntries(ac5eConfig, selectedDamageTypes)];
	} else {
		entries = [...getAllOptinEntriesForHook(ac5eConfig, hookType), ...getRollNonBonusOptinEntries(ac5eConfig, hookType)];
	}
	const deduped = new Map();
	for (const entry of entries) {
		if (!entry || typeof entry !== 'object') continue;
		if (!(entry.optin || entry.forceOptin)) continue;
		const id = String(entry.id ?? '');
		if (!id) continue;
		if (!deduped.has(id)) deduped.set(id, entry);
	}
	return [...deduped.values()];
}

function _isFastForwardingModuleActive() {
	return _activeModule('midi-qol') || _activeModule('rsreforged');
}

function _disableRsrQuickRollFastForward(message, config, hookType) {
	const shouldApply = _activeModule('rsreforged') && ['attack', 'damage'].includes(hookType);
	if (!shouldApply) return false;
	let changed = false;
	const targets = [message, config?.message].filter(Boolean);
	for (const target of targets) {
		const scope = target?.flags?.rsreforged;
		if (!scope || typeof scope !== 'object') continue;
		if (scope.quickRoll === false) continue;
		scope.quickRoll = false;
		changed = true;
	}
	return changed;
}

export function forceDialogConfigureForOptins(ac5eConfig, config, dialog, hookType = ac5eConfig?.hookType, message = undefined) {
	if (!_isFastForwardingModuleActive()) return false;
	const hasDialogObject = dialog && typeof dialog === 'object';
	const hasConfigDialogObject = config?.dialog && typeof config.dialog === 'object';
	if (!hasDialogObject && !hasConfigDialogObject) return false;
	const currentDialogConfigure = hasDialogObject ? dialog.configure : undefined;
	const currentConfigDialogConfigure = hasConfigDialogObject ? config.dialog.configure : undefined;
	const shouldForceConfigure =
		currentDialogConfigure !== true
		|| currentConfigDialogConfigure !== true;
	if (!shouldForceConfigure) return false;
	const relevantEntries = getRelevantOptinEntriesForDialogConfigure(ac5eConfig, config, hookType);
	if (globalThis.ac5e?.debug?.abilityOverrideTrace) {
		console.warn('AC5E TRACE dialogConfigure.forceForOptins.check', {
			hookType,
			dialogConfigure: currentDialogConfigure,
			configDialogConfigure: currentConfigDialogConfigure,
			relevantEntryCount: relevantEntries.length,
			entries: relevantEntries.map((entry) => ({ id: entry?.id, mode: entry?.mode, hook: entry?.hook, optin: !!entry?.optin, forceOptin: !!entry?.forceOptin, set: entry?.set, label: entry?.label ?? entry?.name })),
		});
	}
	if (!relevantEntries.length) return false;
	if (hasDialogObject) {
		try {
			dialog.configure = true;
		} catch (_err) {}
	}
	if (hasConfigDialogObject) {
		try {
			config.dialog.configure = true;
		} catch (_err) {}
	}
	const rsrQuickRollDisabled = _disableRsrQuickRollFastForward(message, config, hookType);
	if (globalThis.ac5e?.debug?.abilityOverrideTrace) {
		console.warn('AC5E forced dialog.configure due to relevant optins', {
			hookType,
			optins: relevantEntries.map((entry) => ({ id: entry.id, label: entry.label ?? entry.name, mode: entry.mode })),
			dialogConfigure: hasDialogObject ? dialog.configure : undefined,
			configDialogConfigure: hasConfigDialogObject ? config.dialog.configure : undefined,
			rsrQuickRollDisabled,
			rsrQuickRollState: {
				message: message?.flags?.rsreforged?.quickRoll,
				configMessage: config?.message?.flags?.rsreforged?.quickRoll,
			},
		});
	}
	return true;
}
