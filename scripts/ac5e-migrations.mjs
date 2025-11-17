import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

export async function migrate() {
	const lastMigrationPoint = '13.5110.6.3';
	if (settings.migrated === lastMigrationPoint) {
		console.warn(`${Constants.MODULE_ID} no migration needed`);
		return null;
	}
	if (lastMigrationPoint !== '13.5110.6.3') {
		const oldRangedSettings = settings.autoRangedCombined;
		if (!oldRangedSettings) return game.settings.set(Constants.MODULE_ID, 'lastMigratedPoint', lastMigrationPoint);
		if (oldRangedSettings === 'off') await game.settings.set(Constants.MODULE_ID, 'autoRangeChecks', new Set());
		else if (oldRangedSettings === 'ranged') await game.settings.set(Constants.MODULE_ID, 'autoRangeChecks', new Set(['meleeOoR', 'rangedOoR', 'rangedLongDisadvantage']));
		else if (oldRangedSettings === 'nearby') await game.settings.set(Constants.MODULE_ID, 'autoRangeChecks', new Set(['meleeOoR', 'rangedOoR', 'rangedLongDisadvantage', 'rangedNearbyFoes']));
		await game.settings.set(Constants.MODULE_ID, 'lastMigratedPoint', lastMigrationPoint);
		console.warn(`${Constants.MODULE_ID} migrated to post ${lastMigrationPoint}`);
	}
}
