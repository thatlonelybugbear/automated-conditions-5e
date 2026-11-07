export function getAmmunitionRollData(selection, actor) {
	const ammunition = typeof selection === 'string' ? actor?.items?.get(selection) : selection;
	if (!ammunition) return undefined;
	const source = ammunition.toObject();
	return {
		...source,
		...(ammunition.getRollData?.()?.item ?? source.system),
		id: ammunition.id,
		uuid: ammunition.uuid,
		name: ammunition.name,
		identifier: ammunition.identifier,
		flags: source.flags,
		system: source.system,
	};
}
