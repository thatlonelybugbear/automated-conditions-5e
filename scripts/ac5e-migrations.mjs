import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

export async function migrate() {
	const {
		flags: { lastMigrationPoint },
		version,
	} = game.modules.get(Constants.MODULE_ID);
	if (settings.debug) console.log(lastMigrationPoint);
	const alreadyMigrated = settings.migrated;
	if (version >= lastMigrationPoint) {
		console.warn(`${Constants.MODULE_ID} no migration needed`);
		return null;
	}
	//specific execution for 12.422.2
	if (lastMigrationPoint == '12.422.2') {
		const oldAutoRanged = settings.autoRanged;
		const oldAutoNearbyFoes = settings.autoRangedNearbyFoe;
		if (!oldAutoRanged && !oldAutoNearbyFoes) await game.settings.set(Constants.MODULE_ID, 'autoRangedAttacksMenu', 'off');
		else if (oldAutoRanged && !oldAutoNearbyFoes) await game.settings.set(Constants.MODULE_ID, 'autoRangedAttacksMenu', 'ranged');
		else await game.settings.set(Constants.MODULE_ID, 'autoRangedAttacksMenu', 'nearby');
		await game.settings.set(Constants.MODULE_ID, 'lastMigratedPoint', lastMigrationPoint);
		console.warn(`${Constants.MODULE_ID} migrated to post ${lastMigrationPoint}`);
		return true;
	}
}
