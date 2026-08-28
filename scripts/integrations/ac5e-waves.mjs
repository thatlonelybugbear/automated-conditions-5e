const MODULE_ID = 'waves';
const COVER_TYPES = ['none', 'half', 'threeQuarters', 'total'];
const COVER_BONUSES = [0, 2, 5, 5];
const COVER_LEVEL_LABELS = ['None', '1/2', '3/4', 'Total'];
const TOTAL_COVER_AC = 999;

export function prepareWavesCover(ac5eConfig, config, { sourceToken, targetTokens = [], ability } = {}) {
	if (!game.settings.get('automated-conditions-5e', 'wavesCover') || !game.modules.get(MODULE_ID)?.active || game.modules.get('simplecover5e')?.active) return;
	const api = game.modules.get(MODULE_ID)?.api;
	if (!api?.measureVisibility || !sourceToken) return;
	if (!targetTokens.some(Boolean)) return;
	if (ac5eConfig?.hookType === 'save' && ability !== 'dex') return;
	const entries = [];
	for (const targetToken of targetTokens.filter(Boolean)) {
		try {
			const result = api.measureVisibility(sourceToken, targetToken, { type: 'sight', includeSurfaces: true, ignoreHidden: false, showTestSamples: false });
			const cover = COVER_TYPES.includes(result?.cover) ? result.cover : 'none';
			entries.push({
				targetUuid: targetToken.document?.uuid ?? targetToken.uuid,
				actorUuid: targetToken.actor?.uuid,
				label: targetToken.name,
				baseAc: Number(targetToken.actor?.system?.attributes?.ac?.value ?? 0),
				measured: cover,
				selected: cover,
			});
		} catch (error) {
			if (globalThis.ac5e?.debug?.canSee) console.warn('AC5E: WAVES cover check failed', { source: sourceToken?.id, target: targetToken?.id, error });
		}
	}
	if (!entries.length) return;
	ac5eConfig.wavesCover = { entries };
	addWavesCoverOptins(ac5eConfig);
	applyWavesCoverToD20Config(ac5eConfig, config);
}

export function applyWavesCoverToD20Config(ac5eConfig, config, formData) {
	const entries = ac5eConfig?.wavesCover?.entries;
	if (!Array.isArray(entries) || !entries.length || !config) return false;
	const values = foundry.utils.flattenObject(formData?.object ?? {});
	for (const [index, entry] of entries.entries()) {
		const selection = ac5eConfig.optinSelected?.[entry.optinId];
		const enabledKey = `ac5eOptins.${entry.optinId}`;
		const enabled = Object.hasOwn(values, enabledKey) ? !!values[enabledKey] : selection !== false;
		const selectedIndex = enabled ? Number(values[`ac5eOptinScale.${entry.optinId}`] ?? selection?.scale) : 0;
		if (Number.isInteger(selectedIndex) && COVER_TYPES[selectedIndex]) entry.selected = COVER_TYPES[selectedIndex];
		const optin = ac5eConfig.subject?.bonus?.find((candidate) => candidate.id === entry.optinId);
		if (optin) {
			optin.name = optin.label = `Cover: ${COVER_LEVEL_LABELS[COVER_TYPES.indexOf(entry.selected)]}`;
			optin.suppressTooltipAttribution = ac5eConfig.hookType === 'attack' || entry.selected === 'none';
		}
	}
	if (ac5eConfig.hookType === 'attack') applyAttackCover(ac5eConfig);
	else if (ac5eConfig.hookType === 'save') applySaveCover(ac5eConfig, config);
	applyWavesCoverTooltip(ac5eConfig);
	return true;
}

function addWavesCoverOptins(ac5eConfig) {
	ac5eConfig.subject ??= {};
	ac5eConfig.subject.bonus ??= [];
	ac5eConfig.optinSelected ??= {};
	for (const [index, entry] of ac5eConfig.wavesCover.entries.entries()) {
		entry.optinId = `ac5e:waves-cover:${index}`;
		ac5eConfig.subject.bonus.push({
			id: entry.optinId,
			name: `Cover: ${COVER_LEVEL_LABELS[COVER_TYPES.indexOf(entry.selected)]}`,
			description: COVER_TYPES.map((cover, coverIndex) => `${coverIndex}: ${coverLabel(cover)}`).join(', '),
			hook: ac5eConfig.hookType,
			mode: 'bonus',
			bonus: [],
			values: [],
			optin: true,
			scaling: { min: 0, max: 3, step: 1 },
			scaleOptionLabels: COVER_LEVEL_LABELS,
			scaleLabels: ['(+0)', '(+2)', '(+5)', ac5eConfig.hookType === 'attack' ? '(\u221e)' : '(+5)'],
		});
		ac5eConfig.optinSelected[entry.optinId] = { enabled: true, scale: COVER_TYPES.indexOf(entry.measured) };
	}
}

function applyAttackCover(ac5eConfig) {
	const targets = ac5eConfig.options?.targets ?? [];
	const coverTargets = {};
	for (const [index, entry] of ac5eConfig.wavesCover.entries.entries()) {
		const target = targets.find((candidate) => candidate?.tokenUuid === entry.targetUuid || candidate?.uuid === entry.actorUuid);
		if (!target) continue;
		const total = entry.selected === 'total';
		const ac = total ? TOTAL_COVER_AC : entry.baseAc + COVER_BONUSES[COVER_TYPES.indexOf(entry.selected)];
		target.ac = ac;
		const targetIndex = targets.indexOf(target);
		const key = target.tokenUuid ? `token:${target.tokenUuid}` : target.uuid ? `actor:${target.uuid}:index:${targetIndex}` : `index:${index}`;
		coverTargets[key] = { ac, total };
	}
	ac5eConfig.preAC5eConfig ??= {};
	ac5eConfig.preAC5eConfig.simpleCoverTargetAcByKey = coverTargets;
}

function applyWavesCoverTooltip(ac5eConfig) {
	const entries = ac5eConfig.wavesCover.entries;
	if (ac5eConfig.hookType === 'attack') {
		ac5eConfig.simpleCoverEntries = entries.filter((entry) => entry.selected !== 'none').map((entry) => {
			const total = entry.selected === 'total';
			return {
				base: entry.baseAc,
				ac: total ? TOTAL_COVER_AC : entry.baseAc + COVER_BONUSES[COVER_TYPES.indexOf(entry.selected)],
				label: `${game.i18n.localize('AC5E.WavesCover.Label')}: ${coverLabel(entry.selected)}`,
			};
		});
	}
}

function applySaveCover(ac5eConfig, config) {
	const roll = config.rolls?.[0];
	if (!roll) return;
	config.parts ??= [];
	roll.parts ??= [];
	const bonus = COVER_BONUSES[COVER_TYPES.indexOf(ac5eConfig.wavesCover.entries[0]?.selected)] ?? 0;
	const previous = ac5eConfig.wavesCover.appliedBonus;
	for (const parts of new Set([config.parts, roll.parts])) {
		if (!Array.isArray(parts)) continue;
		if (previous) {
			const index = parts.lastIndexOf(`+${previous}`);
			if (index >= 0) parts.splice(index, 1);
		}
		if (bonus) parts.push(`+${bonus}`);
	}
	ac5eConfig.wavesCover.appliedBonus = bonus;
}

function coverLabel(cover) {
	return game.i18n.localize(`AC5E.WavesCover.${cover}`);
}
