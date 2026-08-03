const MODULE_ID = 'simplecover5e';
const TOTAL_COVER_AC = 999;
const COVER_TYPES = new Set(['none', 'half', 'threeQuarters', 'total']);

import { getAlteredTargetValueOrThreshold } from '../ac5e-helpers.mjs';


export function applySimpleCover5eLibraryMode({ config, message, messages = [], activity, attacker, targets } = {}) {
	const api = game.modules.get(MODULE_ID)?.api;
	if (_activeModule('midi-qol') || !api?.getCoverForTargets || !api.getLibraryMode?.() || !attacker || !Array.isArray(targets) || !targets.length) return;
	const targetMessages = [...new Set([message, ...messages])].filter(Boolean);
	const targetTokens = targets.map((target) => fromUuidSync(target?.tokenUuid)?.object).filter(Boolean);
	if (!targetTokens.length) return;
	const results = api.getCoverForTargets({
		activity,
		attacker,
		targets: targetTokens,
		losCheck: !!game.settings.get(MODULE_ID, 'losCheck'),
		includeEmbeddedCover: true,
	});
	const coverTargets = [];
	for (const result of results) {
		const actor = result?.target?.actor;
		const tokenUuid = result?.target?.document?.uuid;
		if (!actor) continue;
		const cover = result?.result?.cover ?? 'none';
		const bonus = cover === 'total' ? null : (result?.result?.bonus ?? getCoverBonus(cover));
		const target = targets.find((entry) => entry?.tokenUuid === tokenUuid || entry?.uuid === actor.uuid);
		const ac = bonus === null ? TOTAL_COVER_AC : Number(actor.system?.attributes?.ac?.value ?? 0) + bonus;
		if (target) target.ac = ac;
		coverTargets.push({ newCover: null, originalCover: cover, uuid: actor.uuid, tokenUuid });
	}
	if (!coverTargets.length) return;
	for (const targetMessage of targetMessages) foundry.utils.setProperty(targetMessage, `data.flags.${MODULE_ID}.targets`, coverTargets);
	if (targets.length === 1) applySingleTargetTotalCover(config, targets[0]?.ac);
}

export function applySimpleCover5eTooltip(ac5eConfig, message) {
	const coverTargets = foundry.utils.getProperty(message, `data.flags.${MODULE_ID}.targets`);
	if (!Array.isArray(coverTargets)) return;
	ac5eConfig.simpleCoverEntries = coverTargets
		.map((target) => {
			const cover = target.newCover ?? target.originalCover ?? 'none';
			const bonus = getCoverBonus(cover);
			if (!bonus && bonus !== null) return null;
			const actor = fromUuidSync(target.uuid);
			const base = Number(actor?.system?.attributes?.ac?.value);
			if (!Number.isFinite(base)) return null;
			return {
			base,
			ac: bonus === null ? TOTAL_COVER_AC : base + bonus,
			label: game.i18n.localize(`EFFECT.DND5E.Status${cover === 'threeQuarters' ? 'ThreeQuarters' : cover[0].toUpperCase() + cover.slice(1)}Cover`),
			};
		})
		.filter(Boolean);
	if (ac5eConfig.tooltipObj?.attack) delete ac5eConfig.tooltipObj.attack;
}

export function applySimpleCover5eDialogTooltip(ac5eConfig, message, root) {
	const selectedCovers = new Map(
		[...root?.querySelectorAll?.(`select[name^="${MODULE_ID}.targets."][name$=".newCover"]`) ?? []].map((select) => [
			Number(select.name.match(/\.targets\.(\d+)\.newCover$/)?.[1]),
			select.value,
		]),
	);
	const coverTargets = foundry.utils.getProperty(message, `data.flags.${MODULE_ID}.targets`);
	if (!Array.isArray(coverTargets)) return false;
	const previous = coverTargets.map((target, index) => target?.newCover);
	for (const [index, cover] of selectedCovers) {
		if (coverTargets[index] && COVER_TYPES.has(cover)) coverTargets[index].newCover = cover === coverTargets[index].originalCover ? null : cover;
	}
	applySimpleCover5eDialogTargets(ac5eConfig, coverTargets);
	applySimpleCover5eTooltip(ac5eConfig, message);
	for (const [index, cover] of selectedCovers) {
		if (coverTargets[index]) coverTargets[index].newCover = previous[index];
	}
	return true;
}

export function applySimpleCover5eBuildOverride(ac5eConfig, rollConfig, message, formData, app) {
	if (_activeModule('midi-qol') || !game.modules.get(MODULE_ID)?.api?.getLibraryMode?.()) return false;
	const coverMessage = app?.message ?? message;
	if (!coverMessage) return false;
	const coverTargets = foundry.utils.getProperty(coverMessage, `data.flags.${MODULE_ID}.targets`);
	if (!Array.isArray(coverTargets) || !coverTargets.length) return false;
	const values = foundry.utils.flattenObject(formData?.object ?? {});
	const targets = ac5eConfig?.options?.targets;
	if (!Array.isArray(targets) || !targets.length) return false;
	for (const [index, coverTarget] of coverTargets.entries()) {
		const selected = values[`${MODULE_ID}.targets.${index}.newCover`];
		if (selected && COVER_TYPES.has(selected)) coverTarget.newCover = selected === coverTarget.originalCover ? null : selected;
		const cover = coverTarget.newCover ?? coverTarget.originalCover ?? 'none';
		const bonus = getCoverBonus(cover);
		const target = targets.find((entry) => entry?.tokenUuid === coverTarget.tokenUuid || entry?.uuid === coverTarget.uuid);
		const actor = fromUuidSync(coverTarget.uuid);
		if (!target || !actor) continue;
		const ac = bonus === null ? TOTAL_COVER_AC : Number(actor.system?.attributes?.ac?.value ?? 0) + bonus;
		target.ac = ac;
		const key = getTargetKey(target, targets.indexOf(target));
		ac5eConfig.preAC5eConfig ??= {};
		(ac5eConfig.preAC5eConfig.simpleCoverTargetAcByKey ??= {})[key] = { ac, total: bonus === null };
	}
	return false;
}

function applySimpleCover5eDialogTargets(ac5eConfig, coverTargets) {
	const targets = ac5eConfig?.options?.targets ?? [];
	const initialTargetADCs = {};
	const alteredTargetADCs = {};
	for (const [index, coverTarget] of coverTargets.entries()) {
		const target = targets.find((entry) => entry?.tokenUuid === coverTarget?.tokenUuid || entry?.uuid === coverTarget?.uuid);
		const cover = coverTarget.newCover ?? coverTarget.originalCover ?? 'none';
		const bonus = getCoverBonus(cover);
		const actor = fromUuidSync(coverTarget.uuid);
		const initial = bonus === null ? TOTAL_COVER_AC : Number(actor?.system?.attributes?.ac?.value ?? 0) + bonus;
		const key = target ? getTargetKey(target, targets.indexOf(target)) : `actor:${coverTarget.uuid}:index:${index}`;
		const altered = initial === TOTAL_COVER_AC ? TOTAL_COVER_AC : getAlteredTargetValueOrThreshold(initial, ac5eConfig.targetADC ?? [], 'acBonus');
		initialTargetADCs[key] = { ac: initial };
		alteredTargetADCs[key] = { ac: altered };
	}
	if (!Object.keys(initialTargetADCs).length) return;
	ac5eConfig.initialTargetADCs = initialTargetADCs;
	ac5eConfig.alteredTargetADCs = alteredTargetADCs;
	ac5eConfig.initialTargetADC = Math.min(...Object.values(initialTargetADCs).map((entry) => entry.ac));
	ac5eConfig.alteredTargetADC = Math.min(...Object.values(alteredTargetADCs).map((entry) => entry.ac));
}

export function finalizeSimpleCover5eTargets(ac5eConfig, rollConfig, message) {
	if (_activeModule('midi-qol') || !game.modules.get(MODULE_ID)?.api?.getLibraryMode?.()) return false;
	const targets = ac5eConfig?.options?.targets;
	const coverTargetAcByKey = ac5eConfig?.preAC5eConfig?.simpleCoverTargetAcByKey;
	if (!Array.isArray(targets) || !targets.length || !coverTargetAcByKey || !Object.keys(coverTargetAcByKey).length) return false;
	const initialTargetADCs = {};
	const alteredTargetADCs = {};
	const activeTargets = [];
	for (const [index, target] of targets.entries()) {
		const key = getTargetKey(target, index);
		const coverTarget = coverTargetAcByKey[key];
		if (!coverTarget) continue;
		const initial = Number(coverTarget.ac);
		if (coverTarget.total || initial === TOTAL_COVER_AC) {
			target.ac = TOTAL_COVER_AC;
			initialTargetADCs[key] = { ac: TOTAL_COVER_AC };
			alteredTargetADCs[key] = { ac: TOTAL_COVER_AC };
			continue;
		}
		const altered = getAlteredTargetValueOrThreshold(initial, ac5eConfig.targetADC ?? [], 'acBonus');
		target.ac = altered;
		initialTargetADCs[key] = { ac: initial };
		alteredTargetADCs[key] = { ac: altered };
		activeTargets.push({ initial, altered });
	}
	ac5eConfig.initialTargetADCs = initialTargetADCs;
	ac5eConfig.alteredTargetADCs = alteredTargetADCs;
	ac5eConfig.finalizedTargets = foundry.utils.duplicate(targets);
	const target = activeTargets.length ? Math.min(...activeTargets.map((entry) => entry.altered)) : TOTAL_COVER_AC;
	ac5eConfig.initialTargetADC = activeTargets.length ? Math.min(...activeTargets.map((entry) => entry.initial)) : TOTAL_COVER_AC;
	ac5eConfig.alteredTargetADC = target;
	rollConfig.target = target;
	rollConfig.options ??= {};
	rollConfig.options.target = target;
	for (const roll of rollConfig.rolls ?? []) {
		roll.target = target;
		roll.options ??= {};
		roll.options.target = target;
		if (target === TOTAL_COVER_AC) roll.options.criticalSuccess = 21;
	}
	if (message) foundry.utils.setProperty(message, 'data.flags.automated-conditions-5e.finalizedTargets', foundry.utils.duplicate(targets));
	return true;
}

export function applySimpleCover5eSingleTargetTotalCover(config, message, targets) {
	if (_activeModule('midi-qol') || !game.modules.get(MODULE_ID)?.api?.getLibraryMode?.()) return false;
	if (!config || !Array.isArray(targets) || targets.length !== 1) return false;
	const coverTargets = foundry.utils.getProperty(message, `data.flags.${MODULE_ID}.targets`);
	const target = targets[0];
	const totalCover = coverTargets?.some((entry) =>
		(entry?.tokenUuid === target?.tokenUuid || entry?.uuid === target?.uuid) && (entry.newCover ?? entry.originalCover) === 'total',
	);
	if (!totalCover) return false;
	target.ac = TOTAL_COVER_AC;
	applySingleTargetTotalCover(config, TOTAL_COVER_AC);
	return true;
}

function applySingleTargetTotalCover(config, ac) {
	if (Number(ac) !== TOTAL_COVER_AC) {
		if (config) config.target = ac ?? null;
		return;
	}
	config.target = TOTAL_COVER_AC;
	for (const roll of config.rolls ?? []) {
		roll.target = TOTAL_COVER_AC;
		roll.options ??= {};
		roll.options.target = TOTAL_COVER_AC;
		roll.options.criticalSuccess = 21;
	}
	config.options ??= {};
	config.options.target = TOTAL_COVER_AC;
	config.options.criticalSuccess = 21;
}

function getCoverBonus(cover) {
	if (cover === 'total') return null;
	if (cover === 'half') return Number(CONFIG.DND5E.statusEffects.coverHalf?.coverBonus ?? 0);
	if (cover === 'threeQuarters') return Number(CONFIG.DND5E.statusEffects.coverThreeQuarters?.coverBonus ?? 0);
	return 0;
}

function getTargetKey(target, index) {
	const tokenUuid = target?.tokenUuid ?? target?.token?.uuid;
	return tokenUuid ? `token:${tokenUuid}` : target?.uuid ? `actor:${target.uuid}:index:${index}` : `index:${index}`;
}

function _activeModule(moduleId) {
	return !!game.modules.get(moduleId)?.active;
}
