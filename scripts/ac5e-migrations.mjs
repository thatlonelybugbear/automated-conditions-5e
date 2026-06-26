import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

export async function _migrate() {
	const migration = '14.533.6.2';
	const lastMigratedPoint = settings.migrated;
	if (lastMigratedPoint === migration) {
		console.warn(`${Constants.MODULE_ID} no migration needed`);
		return null;
	}
	if (lastMigratedPoint !== migration) {
		if (!game?.user?.isActiveGM) return;
		await migrateRangeSubkeyChanges();
		await game.settings.set(Constants.MODULE_ID, 'lastMigratedPoint', migration);
		console.warn(`${Constants.MODULE_ID} migrated to post ${migration}`);
	}
}

async function migrateRangeSubkeyChanges() {
	const documents = [...(game.actors ?? []), ...(game.items ?? [])];
	let migrated = 0;
	for (const document of documents) {
		for (const effect of document.effects ?? []) {
			const changes = foundry.utils.duplicate(effect.system?.changes ?? []);
			let changed = false;
			for (const change of changes) {
				const migratedChange = migrateRangeSubkeyChange(change);
				if (!migratedChange) continue;
				change.key = migratedChange.key;
				change.value = migratedChange.value;
				changed = true;
			}
			if (!changed) continue;
			await effect.update({ 'system.changes': changes }, { render: false });
			migrated += 1;
		}
	}
	if (migrated) console.warn(`${Constants.MODULE_ID} migrated ${migrated} range subkey active effects`);
}

function migrateRangeSubkeyChange(change) {
	const key = String(change?.key ?? '');
	const match = key.match(/^(.*\.range)\.(short|long|reach|bonus|longdisadvantage|nolongdisadvantage|nearbyfoes|nonearbyfoes|nearbyfoedisadvantage|nonearbyfoedisadvantage|fail|outofrangefail|nofail|nooutofrangefail)$/i);
	if (!match) return null;
	const [, baseKey, rawField] = match;
	const field = normalizeRangeSubkey(rawField);
	const value = String(change?.value ?? '').trim();
	return {
		key: baseKey,
		value:
			valueHasRangeField(value, field) ? value
			: isRangeToggleField(field) ? value ? `${field}=${value}` : field
			: `${field}=${value}`,
	};
}

function normalizeRangeSubkey(field) {
	const normalized = String(field ?? '').toLowerCase();
	if (normalized === 'nearbyfoes') return 'nearbyFoeDisadvantage';
	if (normalized === 'nonearbyfoes') return 'noNearbyFoeDisadvantage';
	if (normalized === 'fail') return 'outOfRangeFail';
	if (normalized === 'outofrangefail') return 'outOfRangeFail';
	if (normalized === 'nofail') return 'noOutOfRangeFail';
	if (normalized === 'nooutofrangefail') return 'noOutOfRangeFail';
	if (normalized === 'longdisadvantage') return 'longDisadvantage';
	if (normalized === 'nolongdisadvantage') return 'noLongDisadvantage';
	if (normalized === 'nearbyfoedisadvantage') return 'nearbyFoeDisadvantage';
	if (normalized === 'nonearbyfoedisadvantage') return 'noNearbyFoeDisadvantage';
	return normalized;
}

function isRangeToggleField(field) {
	return ['longDisadvantage', 'noLongDisadvantage', 'nearbyFoeDisadvantage', 'noNearbyFoeDisadvantage', 'outOfRangeFail', 'noOutOfRangeFail'].includes(field);
}

function valueHasRangeField(value, field) {
	if (!value) return false;
	return new RegExp(`(?:^|;)\\s*${field}\\s*[:=]`, 'i').test(value);
}
