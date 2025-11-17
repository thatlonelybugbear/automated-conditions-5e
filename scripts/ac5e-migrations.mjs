export async function _migrate() {
	console.log(settings.migrated)
	const migration = '13.5110.6.3';
	const lastMigratedPoint = settings.migrated;
	if (lastMigratedPoint === migration) {
		console.warn(`${Constants.MODULE_ID} no migration needed`);
		return null;
	}
	if (lastMigratedPoint !== migration) {
		const oldRangedSettings = settings.autoRangedCombined;
		if (!oldRangedSettings) return game.settings.set(Constants.MODULE_ID, 'lastMigratedPoint', migration);
		if (oldRangedSettings === 'off') await game.settings.set(Constants.MODULE_ID, 'autoRangeChecks', new Set());
		else if (oldRangedSettings === 'ranged') await game.settings.set(Constants.MODULE_ID, 'autoRangeChecks', new Set(['meleeOoR', 'rangedOoR', 'rangedLongDisadvantage']));
		else if (oldRangedSettings === 'nearby') await game.settings.set(Constants.MODULE_ID, 'autoRangeChecks', new Set(['meleeOoR', 'rangedOoR', 'rangedLongDisadvantage', 'rangedNearbyFoes']));
		await game.settings.set(Constants.MODULE_ID, 'lastMigratedPoint', migration);
		console.warn(`${Constants.MODULE_ID} migrated to post ${migration}`);
	}
}
