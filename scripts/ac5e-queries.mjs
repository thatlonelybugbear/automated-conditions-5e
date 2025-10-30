import { ac5eQueue } from './ac5e-main.mjs';
import Constants from './ac5e-constants.mjs';

export async function _doQueries({ validActivityUpdatesGM = [], validEffectDeletionsGM = [], validEffectUpdatesGM = [], validItemUpdatesGM = [] } = {}) {
	const activeGM = game.users.activeGM;
	if (!activeGM) return false;
	try {
		if (validEffectDeletionsGM.length) {
			await activeGM.query(Constants.GM_EFFECT_DELETIONS, { validEffectDeletionsGM });
		}
		if (validEffectUpdatesGM.length || validItemUpdatesGM.length || validActivityUpdatesGM.length) {
			await activeGM.query(Constants.GM_DOCUMENT_UPDATES, { validEffectUpdatesGM, validItemUpdatesGM, validActivityUpdatesGM });
		}
		return true;
	} catch (err) {
		console.error('doQueries failed:', err);
		return false;
	}
}

export function _gmEffectDeletions({ validEffectDeletionsGM = [] } = {}) {
	const uuids = Array.from(new Set(validEffectDeletionsGM || []));
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

export function _gmDocumentUpdates({ validEffectUpdatesGM = [], validItemUpdatesGM = [], validActivityUpdatesGM = [] } = {}) {
	const merged = [...(validEffectUpdatesGM || []), ...(validItemUpdatesGM || []), ...(validActivityUpdatesGM || [])];
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
