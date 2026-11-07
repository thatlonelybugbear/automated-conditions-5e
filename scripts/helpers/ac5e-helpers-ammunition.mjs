export function getAmmunitionRollData(selection, actor) {
	const ammunition = typeof selection === 'string' ? actor?.items?.get(selection) : selection;
	if (!ammunition) return undefined;
	const source = ammunition.toObject();
	const data = {
		...source,
		...(ammunition.getRollData?.()?.item ?? source.system),
		id: ammunition.id,
		uuid: ammunition.uuid,
		name: ammunition.name,
		identifier: ammunition.identifier,
		flags: source.flags,
	};
	Object.defineProperty(data, 'system', {
		enumerable: false,
		get() {
			globalThis.foundry?.utils?.logCompatibilityWarning?.('AC5e: ammunition.system is deprecated. Use flattened ammunition fields instead, such as ammunition.identifier. Removal is planned after D&D5e 6.2.', { once: true });
			return source.system;
		},
	});
	return data;
}
