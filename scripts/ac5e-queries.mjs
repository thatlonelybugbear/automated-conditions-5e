import { ac5eQueue } from './ac5e-main.mjs';
import Constants from './ac5e-constants.mjs';

export async function doQueries({ effectDeletionsGM = [], effectUpdatesGM = [], itemUpdatesGM = [], activityUpdatesGM = [] } = {}) {
	const activeGM = game.users.activeGM;
	if (!activeGM) return false;
	try {
		if (effectDeletionsGM.length) {
			await activeGM.query(Constants.GM_EFFECT_DELETIONS, { effectDeletionsGM });
		}
		if (effectUpdatesGM.length || itemUpdatesGM.length || activityUpdatesGM.length) {
			await activeGM.query(Constants.GM_DOCUMENT_UPDATES, { effectUpdatesGM, itemUpdatesGM, activityUpdatesGM });
		}
		return true;
	} catch (err) {
		console.error('doQueries failed:', err);
		return false;
	}
}

export function _gmEffectDeletions({ effectDeletionsGM = [] } = {}) {
	const uuids = Array.from(new Set(effectDeletionsGM || []));
	if (!uuids.length) return;
	ac5eQueue.add(() => deletions(uuids));
}

async function deletions(uuids = []) {
	const retrieved = uuids.map((uuid) => ({ uuid, doc: fromUuidSync(uuid) }));

	await Promise.all(
		retrieved.map(async ({ uuid, doc }) => {
			if (!doc) return;
			try {
				await doc.delete();
			} catch (err) {
				console.error(`${Constants.GM_EFFECT_DELETIONS} failed to delete ${uuid}:`, err);
			}
		})
	);
}

export function _gmDocumentUpdates({ effectUpdatesGM = [], itemUpdatesGM = [], activityUpdatesGM = [] } = {}) {
	const merged = [...(effectUpdatesGM || []), ...(itemUpdatesGM || []), ...(activityUpdatesGM || [])];
	const byUuid = new Map();
	for (const entry of merged) {
		if (!entry || !entry.uuid) continue;
		byUuid.set(entry.uuid, entry);
	}
	const entries = Array.from(byUuid.values());
	if (!entries.length) return;
	return ac5eQueue.add(() => documentUpdates(entries));
}

async function documentUpdates(entries) {
	const mapped = entries.map(({ uuid, updates }) => ({ uuid, doc: fromUuidSync(uuid), updates }));
	await Promise.all(
		mapped.map(async ({ uuid, doc, updates }) => {
			if (!doc) {
				return { uuid, status: 'error', error: 'Document not found' };
			}
			try {
				await doc.update(updates);
			} catch (err) {
				console.error(`${Constants.GM_DOCUMENT_UPDATES} failed to update ${uuid}:`, err);
			}
		})
	);
}
