// Repair self-references when an Item is copied, without replacing external origins.
export function repairCopiedItemEffectOrigins(item, data = {}, resolveUuid = () => null) {
	if (!item.uuid || !item._source?.effects?.length) return;
	const sources = new Set([
		data._stats?.duplicateSource, data._stats?.compendiumSource,
		item._source._stats?.duplicateSource, item._source._stats?.compendiumSource,
	].flatMap((uuid) => {
		if (typeof uuid !== 'string' || uuid.startsWith('.') || uuid === item.uuid) return [];
		try {
			const parsed = foundry.utils.parseUuid(uuid);
			return parsed?.type === 'Item' ? [uuid, parsed.uuid] : [];
		} catch { return []; }
	}));
	const sourceId = data._id;
	const effects = foundry.utils.duplicate(item._source.effects);
	let changed = false;
	for (const effect of effects) {
		if (effect.type === 'enchantment') continue;
		const origin = effect.system?.origin;
		const references = [effect.origin, effect.flags?.core?.originText, origin?.item, origin?.activity, origin?.effect, effect.flags?.dnd5e?.item, effect.flags?.dnd5e?.activity];
		const effectSources = new Set(sources);
		// Other copy paths may preserve the source Item ID without recording duplicateSource.
		if (sourceId && effect._id) for (const reference of references) {
			if (typeof reference !== 'string' || reference.startsWith('.')) continue;
			const uuid = reference.replace(/\.(?:Activity|ActiveEffect)\.[^.]+$/, '');
			if (uuid === item.uuid || effectSources.has(uuid)) continue;
			const source = resolveUuid(uuid);
			if (source?.documentName === 'Item' && source.id === sourceId && source.effects?.get(effect._id)) effectSources.add(uuid);
		}
		const remap = (reference) => {
			if (typeof reference !== 'string' || reference.startsWith('.')) return reference;
			for (const uuid of effectSources) {
				if (reference === uuid) return item.uuid;
				if (!reference.startsWith(`${uuid}.`)) continue;
				const suffix = reference.slice(uuid.length);
				const child = suffix.match(/^\.(Activity|ActiveEffect)\.([^.]+)$/);
				if (!child) continue;
				const exists = child[1] === 'Activity' ? item.system?.activities?.has(child[2]) : effects.some((effect) => effect._id === child[2]);
				if (exists) return `${item.uuid}${suffix}`;
			}
			return reference;
		};
		// Do not partially rebind an effect whose referenced child was not copied.
		const hasMissingChild = references.some((reference) => typeof reference === 'string' && [...effectSources].some((uuid) => {
			if (!reference.startsWith(`${uuid}.`)) return false;
			const child = reference.slice(uuid.length).match(/^\.(Activity|ActiveEffect)\.([^.]+)$/);
			return child && remap(reference) === reference;
		}));
		if (hasMissingChild) continue;
		let remapped = false;
		const update = (object, key) => {
			if (!object) return;
			const next = remap(object[key]);
			if (next === object[key]) return;
			object[key] = next;
			changed = remapped = true;
		};
		update(effect, 'origin');
		update(effect.flags?.core, 'originText');
		for (const key of ['item', 'activity', 'effect']) update(origin, key);
		for (const key of ['item', 'activity']) update(effect.flags?.dnd5e, key);
		// Keep an explicit self-origin actor consistent with a remapped self-origin Item.
		if (remapped && origin?.actor && !origin.actor.startsWith('.') && item.actor?.uuid) {
			for (const uuid of effectSources) {
				const index = uuid.lastIndexOf('.Item.');
				if (index < 0 || origin.actor !== uuid.slice(0, index)) continue;
				if (origin.actor !== item.actor.uuid) {
					origin.actor = item.actor.uuid;
					changed = true;
				}
				break;
			}
		}
	}
	if (changed) item.updateSource({ effects });
}
