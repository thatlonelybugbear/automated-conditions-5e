import { ac5eQueue } from './ac5e-main.mjs';

export function gmEffectDeletions({ effectDeletionsGM = [] } = {}) {
	return ac5eQueue.add(() => deletions(effectDeletionsGM));
}

async function deletions(uuids = []) {
	const retrieved = uuids.map((uuid) => ({ uuid, doc: fromUuidSync(uuid) }));

	const results = await Promise.all(
		retrieved.map(async ({ uuid, doc }) => {
			if (!doc) {
				return { uuid, status: 'error', error: 'Document not found' };
			}
			try {
				await doc.delete();
				return { uuid, status: 'ok' };
			} catch (err) {
				console.error(`Failed to delete ${uuid}:`, err);
				return { uuid, status: 'error', error: err?.message ?? String(err) };
			}
		})
	);

	return results;
}

export function gmDocumentUpdates({ effectUpdatesGM = [], itemUpdatesGM = [], activityUpdatesGM = [] } = {}) {
	return ac5eQueue.add(() => documentUpdates(effectUpdatesGM, itemUpdatesGM, activityUpdatesGM));
}

async function documentUpdates(effectUpdates = [], itemUpdates = [], activityUpdates = []) {
	const arr = [...(effectUpdates || []), ...(itemUpdates || []), ...(activityUpdates || [])];

	const mapped = arr.map(({ uuid, updates }) => ({ uuid, doc: fromUuidSync(uuid), updates }));

	const results = await Promise.all(
		mapped.map(async ({ uuid, doc, updates }) => {
			if (!doc) {
				return { uuid, status: 'error', error: 'Document not found' };
			}
			try {
				const result = await doc.update(updates);
				return { uuid, status: 'ok', result };
			} catch (err) {
				console.error(`Failed to update ${uuid}:`, err);
				return { uuid, status: 'error', error: err?.message ?? String(err) };
			}
		})
	);

	return results;
}
