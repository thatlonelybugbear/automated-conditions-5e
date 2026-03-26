import { _activeModule } from '../ac5e-helpers.mjs';
import { getDamageBonusEntries, getDamageNonBonusOptinEntries } from './ac5e-hooks-dialog-damage-state.mjs';
import { getAllOptinEntriesForHook, getRollNonBonusOptinEntries } from './ac5e-hooks-roll-selections.mjs';

function getSelectedDamageTypes(ac5eConfig, config) {
	const selectedFromConfig = Array.isArray(ac5eConfig?.options?.selectedDamageTypes) ? ac5eConfig.options.selectedDamageTypes.filter(Boolean) : [];
	if (selectedFromConfig.length) return selectedFromConfig;
	const selectedByIndex = Array.isArray(ac5eConfig?.options?.selectedDamageTypesByIndex) ? ac5eConfig.options.selectedDamageTypesByIndex.filter(Boolean) : [];
	if (selectedByIndex.length) return selectedByIndex;
	return (Array.isArray(config?.rolls) ? config.rolls : [])
		.map((roll) => {
			const type = roll?.options?.type;
			return typeof type === 'string' && type.trim().length ? String(type).toLowerCase() : undefined;
		})
		.filter(Boolean);
}

export function getRelevantOptinEntriesForMidiFastForward(ac5eConfig, config, hookType = ac5eConfig?.hookType) {
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

export function forceDialogConfigureForMidiFastForward(ac5eConfig, config, dialog, hookType = ac5eConfig?.hookType) {
	if (!_activeModule('midi-qol')) return false;
	if (!dialog || typeof dialog !== 'object') return false;
	if (dialog.configure !== false) return false;
	const relevantEntries = getRelevantOptinEntriesForMidiFastForward(ac5eConfig, config, hookType);
	if (!relevantEntries.length) return false;
	dialog.configure = true;
	if (globalThis.ac5e?.debug?.optins) {
		console.warn('AC5E forced dialog.configure for Midi fast-forward due to relevant optins', {
			hookType,
			optins: relevantEntries.map((entry) => ({ id: entry.id, label: entry.label ?? entry.name, mode: entry.mode })),
		});
	}
	return true;
}
