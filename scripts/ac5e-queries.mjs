import { ac5eQueue } from './ac5e-main.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
const CADENCE_FLAG_KEY = 'cadence';
const CADENCE_FLAG_REPLACE_PATH = `flags.${Constants.MODULE_ID}.==${CADENCE_FLAG_KEY}`;

function _isMissingDocumentError(err) {
	const message = String(err?.message ?? err ?? '').toLowerCase();
	return message.includes('does not exist') || message.includes('not found');
}

function _createDeleteTraceTag(source, uuid) {
	const stamp = Date.now();
	return `ac5e-delete:${source}:${uuid}:${stamp}`;
}

function _logDeleteTrace(stage, payload = {}) {
	const settings = game.settings.get(Constants.MODULE_ID, Settings.DEBUG);
	if (globalThis?.[Constants.MODULE_NAME_SHORT]?.debugQueries || settings) console.warn('AC5E delete trace', { stage, ...payload });
}

export async function _doQueries({ validActivityUpdatesGM = [], validActorUpdatesGM = [], validEffectDeletionsGM = [], validEffectUpdatesGM = [], validItemUpdatesGM = [] } = {}) {
	const activeGM = game.users.activeGM;
	if (!activeGM) return false;
	try {
		if (validEffectDeletionsGM.length) {
			_logDeleteTrace('dispatch-gm-query-delete-batch', {
				count: validEffectDeletionsGM.length,
				uuids: validEffectDeletionsGM,
				activeGmId: activeGM.id,
			});
			await activeGM.query(Constants.GM_EFFECT_DELETIONS, { validEffectDeletionsGM });
		}
		if (validActivityUpdatesGM.length || validActorUpdatesGM.length || validEffectUpdatesGM.length || validItemUpdatesGM.length) {
			await activeGM.query(Constants.GM_DOCUMENT_UPDATES, { validActivityUpdatesGM, validActorUpdatesGM, validEffectUpdatesGM, validItemUpdatesGM });
		}
		return true;
	} catch (err) {
		console.error('doQueries failed:', err);
		return false;
	}
}

export async function _setCombatCadenceFlag({ combatUuid, state } = {}) {
	if (!combatUuid || !state) return false;
	const activeGM = game.users.activeGM;
	if (!activeGM) return false;
	try {
		if (activeGM.id === game.user?.id) {
			const combat = fromUuidSync(combatUuid);
			if (!combat) return false;
			await combat.update({ [CADENCE_FLAG_REPLACE_PATH]: state }, { ac5eCadenceSync: true, diff: false });
			return true;
		}
		await activeGM.query(Constants.GM_COMBAT_CADENCE_UPDATE, { combatUuid, state });
		return true;
	} catch (err) {
		console.error('setCombatCadenceFlag failed:', err);
		return false;
	}
}

export async function _setContextKeywordsSetting({ state } = {}) {
	if (!state || typeof state !== 'object') return false;
	const activeGM = game.users.activeGM;
	if (!activeGM) return false;
	try {
		if (activeGM.id === game.user?.id) {
			await game.settings.set(Constants.MODULE_ID, 'contextKeywordsRegistry', state);
			return true;
		}
		await activeGM.query(Constants.GM_CONTEXT_KEYWORDS_UPDATE, { state });
		return true;
	} catch (err) {
		console.error('setContextKeywordsSetting failed:', err);
		return false;
	}
}

export async function _setUsageRulesSetting({ state } = {}) {
	if (!state || typeof state !== 'object') return false;
	const activeGM = game.users.activeGM;
	if (!activeGM) return false;
	try {
		if (activeGM.id === game.user?.id) {
			await game.settings.set(Constants.MODULE_ID, Settings.USAGE_RULES_REGISTRY, state);
			return true;
		}
		await activeGM.query(Constants.GM_USAGE_RULES_UPDATE, { state });
		return true;
	} catch (err) {
		console.error('setUsageRulesSetting failed:', err);
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
			const source = 'gm-query-handler';
			const traceTag = _createDeleteTraceTag(source, uuid);
			if (!doc) {
				_logDeleteTrace('skip-missing-local-doc', { uuid, source, traceTag });
				return;
			}
			try {
				_logDeleteTrace('dispatch-delete', { uuid, source, traceTag, docUuid: doc.uuid });
				await doc.delete({ strict: false, ac5eDeleteTraceTag: traceTag, ac5eDeleteSource: source });
				_logDeleteTrace('delete-ok', { uuid, source, traceTag });
			} catch (err) {
				if (_isMissingDocumentError(err)) {
					_logDeleteTrace('delete-noop-missing', { uuid, source, traceTag, message: err?.message });
					return;
				}
				_logDeleteTrace('delete-error', { uuid, source, traceTag, message: err?.message, err });
				console.error(`${Constants.GM_EFFECT_DELETIONS} failed to delete ${uuid}:`, err);
			}
		}),
	);
}

export function _gmDocumentUpdates({ validActivityUpdatesGM, validActorUpdatesGM, validEffectUpdatesGM, validItemUpdatesGM }) {
	const merged = [...(validActivityUpdatesGM || []), ...(validActorUpdatesGM || []), ...(validEffectUpdatesGM || []), ...(validItemUpdatesGM || [])];
	const byUuid = new Map();
	for (const entry of merged) {
		if (!entry || !entry.uuid) continue;
		byUuid.set(entry.uuid, entry);
	}
	const entries = Array.from(byUuid.values());
	if (!entries.length) return;
	return ac5eQueue.add(() => documentUpdates(entries));
}

export async function _gmCombatCadenceUpdate({ combatUuid, state } = {}) {
	if (!game.user?.isGM) return false;
	if (!combatUuid || !state) return false;
	const combat = fromUuidSync(combatUuid);
	if (!combat) return false;
	try {
		await combat.update({ [CADENCE_FLAG_REPLACE_PATH]: state }, { ac5eCadenceSync: true, diff: false });
		return true;
	} catch (err) {
		console.error(`${Constants.GM_COMBAT_CADENCE_UPDATE} failed for ${combatUuid}:`, err);
		return false;
	}
}

export async function _gmContextKeywordsUpdate({ state } = {}) {
	if (!game.user?.isGM) return false;
	if (!state || typeof state !== 'object') return false;
	try {
		await game.settings.set(Constants.MODULE_ID, 'contextKeywordsRegistry', state);
		return true;
	} catch (err) {
		console.error(`${Constants.GM_CONTEXT_KEYWORDS_UPDATE} failed:`, err);
		return false;
	}
}

export async function _gmUsageRulesUpdate({ state } = {}) {
	if (!game.user?.isGM) return false;
	if (!state || typeof state !== 'object') return false;
	try {
		await game.settings.set(Constants.MODULE_ID, Settings.USAGE_RULES_REGISTRY, state);
		return true;
	} catch (err) {
		console.error(`${Constants.GM_USAGE_RULES_UPDATE} failed:`, err);
		return false;
	}
}

async function documentUpdates(entries) {
	const mapped = entries.map(({ uuid, updates, options }) => ({ uuid, doc: fromUuidSync(uuid), updates, options }));
	await Promise.all(
		mapped.map(async ({ uuid, doc, updates, options }) => {
			if (!doc) {
				return { uuid, status: 'error', error: 'Document not found' };
			}
			try {
				if (options) await doc.update(updates, options);
				else await doc.update(updates);
			} catch (err) {
				console.error(`${Constants.GM_DOCUMENT_UPDATES} failed to update ${uuid}:`, err);
			}
		}),
	);
}
