export function parseSpellSlotTarget(target) {
	const match = String(target ?? '').trim().match(/^spell\[\s*(slot|pact)(?:\s*,\s*(slot|pact))*\s*\]$/i);
	if (!match) return null;
	return new Set(match[0].slice(6, -1).split(',').map((pool) => pool.trim().toLowerCase()));
}

export function getMaxSpellSlotLevel() {
	return Math.max(0, ...Object.keys(globalThis.CONFIG?.DND5E?.spellLevels ?? {}).map(Number).filter((level) => Number.isInteger(level) && level >= 0));
}

export function getSpellSlotChoices(target, spells, { min = 1, max = getMaxSpellSlotLevel(), step = 1 } = {}) {
	const pools = parseSpellSlotTarget(target);
	if (!pools || !Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) return [];
	const choices = [];
	for (const [slot, pool] of Object.entries(spells ?? {})) {
		const pact = slot === 'pact';
		if (pact ? !pools.has('pact') : !pools.has('slot') || !/^spell[1-9]\d*$/.test(slot)) continue;
		const scale = pact ? Number(pool.level) : Number(slot.slice(5));
		if (Number(pool.value) < 1 || !Number.isFinite(Number(pool.value))) continue;
		if (!Number.isInteger(scale) || scale < Math.max(1, min) || scale > Math.min(getMaxSpellSlotLevel(), max) || (scale - min) % step !== 0) continue;
		choices.push({ slot, scale, available: Number(pool.value) });
	}
	return choices.sort((a, b) => a.scale - b.scale || Number(a.slot === 'pact') - Number(b.slot === 'pact'));
}

const pendingConsumptions = new WeakMap();

export function consumeSpellSlot(actor, choice) {
	const previous = pendingConsumptions.get(actor) ?? Promise.resolve();
	const pending = previous.catch(() => {}).then(async () => {
		const pool = actor.system?.spells?.[choice.slot];
		const level = choice.slot === 'pact' ? Number(pool?.level) : Number(choice.slot?.match(/^spell([1-9]\d*)$/)?.[1]);
		const value = Number(pool?.value);
		if (!Number.isInteger(level) || level < 1 || level > getMaxSpellSlotLevel() || level !== choice.scale || !Number.isFinite(value) || value < 1) {
			throw new Error(game.i18n.format('AC5E.OptinSpellSlot.Unavailable', { actor: actor.name, slot: choice.slot }));
		}
		return actor.update({ [`system.spells.${choice.slot}.value`]: value - 1 });
	});
	pendingConsumptions.set(actor, pending);
	const cleanup = () => { if (pendingConsumptions.get(actor) === pending) pendingConsumptions.delete(actor); };
	pending.then(cleanup, cleanup);
	return pending;
}
