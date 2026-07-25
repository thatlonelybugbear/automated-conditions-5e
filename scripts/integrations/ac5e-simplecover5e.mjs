const MODULE_ID = 'simplecover5e';
const TOTAL_COVER_AC = 999;
const COVER_BONUSES = Object.freeze({ none: 0, half: 2, threeQuarters: 5, total: null });


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
		const bonus = result?.result?.bonus ?? COVER_BONUSES[cover];
		const target = targets.find((entry) => entry?.tokenUuid === tokenUuid);
		const ac = bonus === null ? TOTAL_COVER_AC : Number(actor.system?.attributes?.ac?.value ?? 0) + bonus;
		if (target) target.ac = ac;
		for (const targetMessage of targetMessages) setMessageTargetAC(targetMessage, actor.uuid, ac);
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
			const bonus = COVER_BONUSES[cover];
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
		if (coverTargets[index] && Object.hasOwn(COVER_BONUSES, cover)) coverTargets[index].newCover = cover === coverTargets[index].originalCover ? null : cover;
	}
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
		if (selected && Object.hasOwn(COVER_BONUSES, selected)) coverTarget.newCover = selected === coverTarget.originalCover ? null : selected;
		const cover = coverTarget.newCover ?? coverTarget.originalCover ?? 'none';
		const bonus = COVER_BONUSES[cover];
		const target = targets.find((entry) => entry?.tokenUuid === coverTarget.tokenUuid || entry?.uuid === coverTarget.uuid);
		const actor = fromUuidSync(coverTarget.uuid);
		if (!target || !actor) continue;
		const ac = bonus === null ? TOTAL_COVER_AC : Number(actor.system?.attributes?.ac?.value ?? 0) + bonus;
		target.ac = ac;
		setMessageTargetAC(coverMessage, actor.uuid, ac);
	}
	const activeTargets = targets.filter((target) => Number.isFinite(Number(target?.ac)));
	if (targets.length === 1 && Number(targets[0]?.ac) === TOTAL_COVER_AC) {
		applySingleTargetTotalCover(rollConfig, TOTAL_COVER_AC);
		return true;
	}
	if (!activeTargets.length) return false;
	const baseline = Math.min(...activeTargets.map((target) => Number(target.ac)));
	ac5eConfig.preAC5eConfig ??= {};
	ac5eConfig.preAC5eConfig.baseRoll0Options ??= {};
	ac5eConfig.preAC5eConfig.baseRoll0Options.target = baseline;
	for (const entry of Object.values(ac5eConfig.preAC5eConfig.baseTargetAcByKey ?? {})) {
		const target = targets.find((candidate) => candidate?.uuid === entry.uuid || candidate?.tokenUuid === entry.tokenUuid);
		if (target) entry.ac = target.ac;
	}
	delete ac5eConfig.initialTargetADCs;
	delete ac5eConfig.alteredTargetADCs;
	return false;
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
	setMessageTargetAC(message, target.uuid, TOTAL_COVER_AC);
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

function setMessageTargetAC(message, uuid, ac) {
	const targets = foundry.utils.getProperty(message, 'data.flags.dnd5e.targets');
	if (!Array.isArray(targets)) return;
	for (const target of targets) {
		if (target?.uuid === uuid) target.ac = ac;
	}
}

function _activeModule(moduleId) {
	return !!game.modules.get(moduleId)?.active;
}
