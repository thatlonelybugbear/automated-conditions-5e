import { _activeModule } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';

const MIDI_TRACKER_DEBUG_MARKER = 'ac5e-midi-tracker-sync-2026-03-05-r1';

export function syncMidiResolvedAdvantageMode(ac5eConfig, config, dialog, rolls, deps) {
	if (!_activeModule('midi-qol')) return;
	if (!['attack', 'check', 'save'].includes(ac5eConfig?.hookType)) return;
	const trackers = collectMidiRollModifierTrackers(ac5eConfig, config, dialog, { includeAllChoices: true });
	if (!trackers.length) return;
	const debugMidiTooltipSync = deps.hookDebugEnabled('midiTooltipSync');
	const mode = rolls?.[0]?.options?.advantageMode ?? ac5eConfig?.advantageMode ?? config?.rolls?.[0]?.options?.advantageMode ?? 0;
	if (mode === undefined || mode === null) return;
	const advModes = CONFIG?.Dice?.D20Roll?.ADV_MODE;
	if (!advModes) return;
	const explicitOverride = deps.getExplicitModeOverride(ac5eConfig);
	const isDialogD20Override = explicitOverride?.replacesCalculatedMode && explicitOverride?.family === 'd20' && explicitOverride?.source === 'dialog';
	if (debugMidiTooltipSync) logMidiTrackerBuildMarkerOnce('hooks.syncMidiResolvedAdvantageMode', deps);

	for (const [trackerIndex, tracker] of trackers.entries()) {
		tracker.attribution ??= {};
		if (typeof tracker.attribution !== 'object') continue;
		if (debugMidiTooltipSync) {
			console.warn('AC5E midiTooltipSync pre', {
				marker: MIDI_TRACKER_DEBUG_MARKER,
				hookType: ac5eConfig?.hookType,
				mode,
				trackerIndex,
				trackerCount: trackers.length,
				trackerAttribution: foundry.utils.duplicate(tracker?.attribution ?? {}),
			});
		}
		const hasAc5eAdv = hasAc5eAttributionForType(tracker, 'ADV');
		const hasAc5eDis = hasAc5eAttributionForType(tracker, 'DIS');
		if (hasAc5eAdv || hasAc5eDis) {
			const configButtonsLabel = getMidiAttributionSourceLabel(tracker, 'config-buttons');
			if (hasAc5eAdv) removeMidiAttributionSource(tracker, 'ADV', 'config-buttons');
			if (hasAc5eDis) removeMidiAttributionSource(tracker, 'DIS', 'config-buttons');
			const modeType =
				mode === advModes.ADVANTAGE ? 'ADV'
				: mode === advModes.DISADVANTAGE ? 'DIS'
				: '';
			if (modeType) {
				const oppositeType = modeType === 'ADV' ? 'DIS' : 'ADV';
				const hasOppositeAc5e = hasAc5eAttributionForType(tracker, oppositeType);
				const hasModeAc5e = hasAc5eAttributionForType(tracker, modeType);
				const hasModeNonAc5e = hasNonAc5eAttributionForType(tracker, modeType);
				const label = configButtonsLabel || 'Roll Dialog';
				const shouldAddConfigButtons = (hasOppositeAc5e || !hasModeAc5e) && !hasModeNonAc5e;
				if (shouldAddConfigButtons) setMidiAttributionSource(tracker, modeType, 'config-buttons', label);
			}
		}
		if (isDialogD20Override) {
			const modeType =
				mode === advModes.ADVANTAGE ? 'ADV'
				: mode === advModes.DISADVANTAGE ? 'DIS'
				: '';
			removeMidiAttributionSource(tracker, 'ADV', 'config-buttons');
			removeMidiAttributionSource(tracker, 'DIS', 'config-buttons');
			if (modeType && !hasNonAc5eAttributionForType(tracker, modeType)) {
				const label = getMidiAttributionSourceLabel(tracker, 'config-buttons') || 'Roll Dialog';
				setMidiAttributionSource(tracker, modeType, 'config-buttons', label);
			}
		}
		if (debugMidiTooltipSync) {
			console.warn('AC5E midiTooltipSync attribution', {
				marker: MIDI_TRACKER_DEBUG_MARKER,
				hookType: ac5eConfig?.hookType,
				mode,
				trackerIndex,
				trackerCount: trackers.length,
				hasAc5eAdv,
				hasAc5eDis,
				trackerAttribution: foundry.utils.duplicate(tracker?.attribution ?? {}),
			});
		}
		if (mode === advModes.ADVANTAGE) {
			tracker.advantage.setOverride();
			tracker.disadvantage.clearOverride();
			continue;
		}
		if (mode === advModes.DISADVANTAGE) {
			tracker.disadvantage.setOverride();
			tracker.advantage.clearOverride();
			continue;
		}
		if (mode === advModes.NORMAL) {
			tracker.advantage.setOverride();
			tracker.disadvantage.setOverride();
			continue;
		}
		tracker.advantage.clearOverride();
		tracker.disadvantage.clearOverride();
	}
}

function logMidiTrackerBuildMarkerOnce(context = '', deps) {
	if (!deps.hookDebugEnabled('midiTooltipSync') && !deps.hookDebugEnabled('midiTrackerSync')) return;
	if (globalThis.__ac5eMidiTrackerBuildMarkerLogged) return;
	globalThis.__ac5eMidiTrackerBuildMarkerLogged = true;
	console.warn('AC5E midiTrackerSync build marker', { marker: MIDI_TRACKER_DEBUG_MARKER, context });
}

function toMidiRollModifierTracker(value) {
	if (!value || typeof value !== 'object') return undefined;
	const tracker = value?.tracker ?? value;
	if (!tracker || typeof tracker !== 'object') return undefined;
	if (typeof tracker?.advantage?.setOverride !== 'function') return undefined;
	if (typeof tracker?.disadvantage?.setOverride !== 'function') return undefined;
	return tracker;
}

function resolveMidiWorkflow(config) {
	const directWorkflow = config?.midiOptions?.workflow;
	if (directWorkflow && typeof directWorkflow === 'object') return directWorkflow;
	const workflowId = config?.midiOptions?.workflowId;
	if (!workflowId) return undefined;
	return globalThis?.MidiQOL?.Workflow?.getWorkflow?.(workflowId);
}

function matchingWorkflowSaveDetails(ac5eConfig, config) {
	const workflow = resolveMidiWorkflow(config);
	const targetSaveDetails = workflow?.targetSaveDetails;
	if (!targetSaveDetails || typeof targetSaveDetails !== 'object') return [];
	const token = canvas?.tokens?.get?.(ac5eConfig?.tokenId);
	const actorUuid = token?.actor?.uuid;
	const tokenDocUuid = token?.document?.uuid;
	const rollActorUuid = config?.rolls?.[0]?.options?.actorUuid ?? config?.rolls?.[0]?.data?.actorUuid;
	const candidateActorUuids = new Set([actorUuid, rollActorUuid].filter((value) => typeof value === 'string' && value.trim()));
	const candidateTokenDocUuids = new Set([tokenDocUuid].filter((value) => typeof value === 'string' && value.trim()));
	const entries = Object.entries(targetSaveDetails ?? {}).filter(([, saveDetails]) => saveDetails && typeof saveDetails === 'object');
	const hasActorCandidates = candidateActorUuids.size > 0;
	const hasTokenCandidates = candidateTokenDocUuids.size > 0;
	if (!hasActorCandidates && !hasTokenCandidates) return entries.length === 1 ? entries : [];
	const matches = entries.filter(([workflowTokenDocUuid, saveDetails]) => {
		const entryActorUuid = saveDetails?.actorUuid;
		const actorMatch = hasActorCandidates && typeof entryActorUuid === 'string' ? candidateActorUuids.has(entryActorUuid) : false;
		const tokenMatch = hasTokenCandidates ? candidateTokenDocUuids.has(workflowTokenDocUuid) : false;
		return actorMatch || tokenMatch;
	});
	if (matches.length) return matches;
	if (entries.length === 1) return entries;
	return [];
}

function collectMidiRollModifierTrackers(ac5eConfig, config, dialog, { includeAllChoices = false } = {}) {
	const trackers = [];
	const seen = new Set();
	const collect = (value) => {
		const tracker = toMidiRollModifierTracker(value);
		if (!tracker || seen.has(tracker)) return;
		seen.add(tracker);
		trackers.push(tracker);
	};
	const hookType = ac5eConfig?.hookType;
	if (hookType === 'attack') {
		collect(config?.workflow?.attackRollModifierTracker);
		return trackers;
	}
	if (!['check', 'save'].includes(hookType)) return trackers;

	const maps = [config?.midiOptions?.advantageByChoice, config?.options?.advantageByChoice, dialog?.options?.advantageByChoice].filter((candidate) => candidate && typeof candidate === 'object');
	const choiceKeys = [
		config?.skill,
		config?.tool,
		config?.ability,
		config?.rolls?.[0]?.options?.midiChosenId,
		config?.rolls?.[0]?.options?.ability,
		config?.rolls?.[0]?.options?.skill,
		config?.rolls?.[0]?.options?.tool,
		ac5eConfig?.options?.skill,
		ac5eConfig?.options?.tool,
		ac5eConfig?.options?.ability,
	]
		.map((value) => (typeof value === 'string' ? value.trim() : ''))
		.filter(Boolean);

	for (const map of maps) {
		for (const key of choiceKeys) collect(map?.[key]);
	}
	if (includeAllChoices) {
		for (const map of maps) {
			for (const value of Object.values(map ?? {})) collect(value);
		}
	}
	const chosenId = config?.rolls?.[0]?.options?.midiChosenId;
	const workflowSaveDetailsMatches = matchingWorkflowSaveDetails(ac5eConfig, config);
	for (const [, saveDetails] of workflowSaveDetailsMatches) {
		collect(saveDetails?.modifierTracker);
		const choiceMap = saveDetails?.advantageByChoice;
		if (!choiceMap || typeof choiceMap !== 'object') continue;
		if (typeof chosenId === 'string' && chosenId.trim()) collect(choiceMap[chosenId.trim()]);
		if (includeAllChoices) {
			for (const value of Object.values(choiceMap)) collect(value);
		}
		const choiceEntries = Object.values(choiceMap);
		if (choiceEntries.length === 1) collect(choiceEntries[0]);
	}
	for (const map of maps) {
		const entries = Object.values(map ?? {});
		if (entries.length !== 1) continue;
		collect(entries[0]);
	}
	collect(config?.midiOptions?.modifierTracker);
	collect(config?.midiOptions?.tracker);
	return trackers;
}

function removeMidiAttributionSource(tracker, type, source) {
	if (!tracker || !type || !source) return;
	const typed = tracker?.attribution?.[type];
	if (typed && typeof typed === 'object' && Object.prototype.hasOwnProperty.call(typed, source)) {
		delete typed[source];
		if (!Object.keys(typed).length) delete tracker.attribution[type];
	}
	const legacyKey = `${type}:${source}`;
	if (tracker?.legacyAttribution instanceof Set) tracker.legacyAttribution.delete(legacyKey);
	if (tracker?.advReminderAttribution instanceof Set) tracker.advReminderAttribution.delete(legacyKey);
}

function getMidiAttributionSourceLabel(tracker, source, preferredTypes = ['ADV', 'DIS']) {
	if (!tracker || !source) return '';
	for (const type of preferredTypes) {
		const typed = tracker?.attribution?.[type];
		if (!typed || typeof typed !== 'object') continue;
		const value = typed[source];
		if (value === undefined || value === null) continue;
		const label = String(value).trim();
		if (label) return label;
	}
	return '';
}

function setMidiAttributionSource(tracker, type, source, label) {
	if (!tracker || !type || !source) return;
	const nextLabel = String(label ?? '').trim();
	if (!nextLabel) return;
	if (typeof tracker?.addAttribution === 'function') {
		tracker.addAttribution(type, source, nextLabel);
		return;
	}
	tracker.attribution ??= {};
	if (!tracker.attribution[type] || typeof tracker.attribution[type] !== 'object') tracker.attribution[type] = {};
	if (!tracker.attribution[type][source]) tracker.attribution[type][source] = nextLabel;
}

function hasAc5eAttributionForType(tracker, type) {
	const typed = tracker?.attribution?.[type];
	if (!typed || typeof typed !== 'object') return false;
	return Object.keys(typed).some((source) => typeof source === 'string' && (source.startsWith(`${Constants.MODULE_ID}:`) || /^ac5e(?:\b|[:\s-])/i.test(source)));
}

function hasNonAc5eAttributionForType(tracker, type) {
	const typed = tracker?.attribution?.[type];
	if (!typed || typeof typed !== 'object') return false;
	return Object.keys(typed).some((source) => typeof source === 'string' && !source.startsWith(`${Constants.MODULE_ID}:`) && !/^ac5e(?:\b|[:\s-])/i.test(source));
}
